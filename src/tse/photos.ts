import sharp from 'sharp';
import {config} from '../config.js';

const MAX_BYTES=15*1024,MAX_SOURCE_BYTES=1024*1024;
const ufs=new Set('ac al ap am ba ce df es go ma mt ms mg pa pb pr pe pi rj rn rs ro rr sc sp se to br'.split(' '));
type Photo={bytes:Buffer|null;maxAge:number};
// The route carries only official election/candidate identifiers, never a client-supplied URL.
export function officialPhotoUrl(path:string):string|null{
 const match=/^\/assets\/candidate-photos\/(\d{1,6})\/([a-z]{2})\/([0-9]{7,20})\.webp$/.exec(path);
 if(!match||!ufs.has(match[2])||!/^ele\d{4}$/.test(config.tseCycle)||Number(match[1])<=0)return null;
 return `https://resultados.tse.jus.br/oficial/${config.tseCycle}/${Number(match[1])}/fotos/${match[2]}/${match[3]}.jpeg`;
}

export async function optimizePhoto(source:Buffer){
 const pipeline=()=>sharp(source,{limitInputPixels:4_000_000,animated:false}).rotate()
  .resize({width:96,height:128,fit:'inside',withoutEnlargement:true});
 let bytes=await pipeline().webp({quality:68,effort:2}).toBuffer();
 if(bytes.length>MAX_BYTES)bytes=await pipeline().webp({quality:40,effort:2}).toBuffer();
 if(bytes.length>MAX_BYTES)throw new Error('Thumbnail exceeds size budget');
 return bytes;
}

export function createPhotoLoader(fetcher:typeof fetch=fetch){
 const cache=new Map<string,Photo & {expires:number}>();
 const pending=new Map<string,Promise<Photo>>();
 let workers=0;
 const waiting:(()=>void)[]=[];
 async function acquire(){if(workers<2){workers++;return}await new Promise<void>(resolve=>waiting.push(resolve))}
 function release(){const next=waiting.shift();if(next)next();else workers--}
 async function download(url:string):Promise<Photo>{
  const response=await fetcher(url,{signal:AbortSignal.timeout(8000),redirect:'error'});
  if(!response.ok){await response.body?.cancel();return {bytes:null,maxAge:response.status===404?300:30}}
  if(!/^image\/(jpeg|png|webp)(;|$)/i.test(response.headers.get('content-type')||'')){
   await response.body?.cancel();throw new Error('Unexpected image type');
  }
  if(Number(response.headers.get('content-length'))>MAX_SOURCE_BYTES){await response.body?.cancel();throw new Error('Image too large')}
  const reader=response.body?.getReader();if(!reader)throw new Error('Empty image');
  let size=0;const chunks:Buffer[]=[];
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
   if(size>MAX_SOURCE_BYTES){await reader.cancel();throw new Error('Image too large')}chunks.push(Buffer.from(value));
  }}finally{reader.releaseLock()}
  return {bytes:await optimizePhoto(Buffer.concat(chunks)),maxAge:86400};
 }
 return function load(path:string):Promise<Photo>{
  const url=officialPhotoUrl(path);if(!url)return Promise.resolve({bytes:null,maxAge:300});
  const hit=cache.get(path);
  if(hit&&hit.expires>Date.now()){cache.delete(path);cache.set(path,hit);return Promise.resolve(hit)}
  cache.delete(path);
  const running=pending.get(path);if(running)return running;
  // Two small image jobs at a time, at most eight pending. Never queue unbounded work.
  if(pending.size>=8)return Promise.resolve({bytes:null,maxAge:0});
  const job=(async()=>{await acquire();try{
   let result:Photo;try{result=await download(url)}catch{result={bytes:null,maxAge:30}}
   cache.set(path,{...result,expires:Date.now()+result.maxAge*1000});
   while(cache.size>512)cache.delete(cache.keys().next().value!);
   return result;
  }finally{release();pending.delete(path)}})();
  pending.set(path,job);return job;
 };
}
export const loadCandidatePhoto=createPhotoLoader();
