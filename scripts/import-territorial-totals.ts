// Explicit ingestion of official 2026 totals only; never changes candidate votes.
import {pool} from '../src/db/index.js';
import {fetchAndPersist} from '../src/tse/client.js';
import {scopeResultUrl,electionIdForOffice} from '../src/tse/url.js';
import {storeIndicators} from '../src/majority/indicators.js';
import catalog from '../src/majority/municipalities-2026.json' with {type:'json'};
import exterior from '../src/majority/exterior-2026.json' with {type:'json'};
const uf=(process.env.TSE_ONLY_UF||'ES').toUpperCase();
if(!catalog.some(m=>m.uf===uf)&&uf!=='ZZ')throw new Error('UF inválida.');
let imported=0,failed=0;
try{
 for(const office of (uf==='ZZ'?[1]:[1,3])){
  const scopes=[{uf,municipalityCode:undefined as string|undefined},...(uf==='ZZ'?exterior:catalog.filter(m=>m.uf===uf)).map(m=>({uf,municipalityCode:m.code}))];
  for(const scope of scopes){
   // scopeResultUrl's presidential default is national; territorial EA20 uses UF folder/prefix.
   let url=scopeResultUrl({office,...scope});
   if(office===1&&!scope.municipalityCode)url=url.replace('/dados/br/br-','/dados/'+uf.toLowerCase()+'/'+uf.toLowerCase()+'-');
   try{const {data,file}=await fetchAndPersist(url);const client=await pool.connect();try{await storeIndicators(client,data,{electionId:electionIdForOffice(office),round:1,office,...scope},url,file);imported++}finally{client.release()}}catch(e){failed++;console.error('TOTALS_IMPORT_FAILURE',office,uf,scope.municipalityCode||'UF',String(e))}
  }
 }
 console.log(JSON.stringify({uf,imported,failed,candidateVotesModified:false}));if(failed)process.exitCode=1;
}finally{await pool.end()}
