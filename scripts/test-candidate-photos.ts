import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Script,runInNewContext} from 'node:vm';
import {readFileSync} from 'node:fs';
import sharp from 'sharp';
import {officialPhotoUrl,optimizePhoto,createPhotoLoader} from '../src/tse/photos.js';
import {appPage} from '../src/web/pages.js';

const path='/assets/candidate-photos/6259/es/80002549430.webp';
const jpeg=await sharp({create:{width:300,height:420,channels:3,background:'#879bad'}}).jpeg().toBuffer();
test('official route validates identifiers and keeps photo requests on the TSE host',()=>{
 assert.equal(officialPhotoUrl(path),'https://resultados.tse.jus.br/oficial/ele2026/6259/fotos/es/80002549430.jpeg');
 for(const unsafe of [path.replace('/es/','/xx/'),path.replace('80002549430','../../etc'),path.replace('6259','0'),path.replace('80002549430','295'),path.replace('.webp','.svg')])assert.equal(officialPhotoUrl(unsafe),null);
});
test('thumbnail stays below 15 KB and within 96 by 128 pixels',async()=>{
 const image=await optimizePhoto(jpeg),meta=await sharp(image).metadata();
 assert(image.length<=15*1024);assert(meta.width!<=96);assert(meta.height!<=128);assert.equal(meta.format,'webp');
});
test('simultaneous requests share one download and subsequent requests use cache',async()=>{
 let calls=0;
 const load=createPhotoLoader((async()=>{calls++;return new Response(new Uint8Array(jpeg),{headers:{'content-type':'image/jpeg'}})}) as typeof fetch);
 const photos=await Promise.all(Array.from({length:8},()=>load(path)));
 assert.equal(calls,1);assert(photos.every(p=>p.bytes&&p.bytes.equals(photos[0].bytes!)));
 await load(path);assert.equal(calls,1);
});
test('missing, oversized and non-image responses do not break candidate data',async()=>{
 for(const response of [new Response('',{status:404}),new Response('html',{headers:{'content-type':'text/html'}}),new Response('large',{headers:{'content-type':'image/jpeg','content-length':'1048577'}})]){
  let calls=0;const load=createPhotoLoader((async()=>{calls++;return response}) as typeof fetch);
  assert.equal((await load(path)).bytes,null);assert.equal((await load(path)).bytes,null);assert.equal(calls,1);
 }
 let calls=0;const load=createPhotoLoader((async()=>{calls++;throw Error('offline')}) as typeof fetch);
 assert.equal((await load(path)).bytes,null);assert.equal((await load('/bad')).bytes,null);assert.equal(calls,1);
});
test('distinct requests are bounded to two image jobs and eight pending',async()=>{
 let active=0,max=0,calls=0;
 const load=createPhotoLoader((async()=>{calls++;active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,10));active--;return new Response(new Uint8Array(jpeg),{headers:{'content-type':'image/jpeg'}})}) as typeof fetch);
 const photos=await Promise.all(Array.from({length:10},(_,i)=>load(path.replace('80002549430',String(80002549430+i)))));
 assert.equal(calls,8);assert(max<=2);assert.equal(photos.filter(p=>p.bytes===null).length,2);
});
test('both panels produce valid scripts and load only the selected photo',()=>{
 const html=appPage({name:'Teste'},true);
 const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).filter(Boolean);
 for(const script of scripts)new Script(script);
 const majority=readFileSync(new URL('../src/ui/majority.js',import.meta.url),'utf8');new Script(majority);
 for(const script of [...scripts.filter(s=>s.includes('function showCandidatePhoto')),majority]){
  const helper=/function showCandidatePhoto\(c\)\{[\s\S]*?\n\}/.exec(script)![0];
  const image:any={hidden:true,getAttribute(){return this.src},removeAttribute(){delete this.src}};
  const show=runInNewContext(helper+';showCandidatePhoto',{document:{getElementById:()=>image},$:()=>image});
  show({tse_candidate_id:'80002549430',election_id:6259,office_code:7,uf:'ES'});assert.equal(image.src,path);assert.equal(image.hidden,true);image.onload();assert.equal(image.hidden,false);
  image.onerror();assert.equal(image.hidden,true);
  show({tse_candidate_id:'80002549430',election_id:6257,office_code:1,uf:'SP'});assert(image.src.includes('/6257/br/'));
  show({tse_candidate_id:'',election_id:6259,office_code:7,uf:'ES'});assert.equal(image.src,undefined);assert.equal(image.hidden,true);
 }
 assert(!html.includes('candidate-photo-status'));
});
