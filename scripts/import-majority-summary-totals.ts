// Importa apenas totalizações oficiais agregadas por Brasil/UF, sem alterar voto_facts.
import {pool} from '../src/db/index.js';
import {fetchAndPersist} from '../src/tse/client.js';
import {scopeResultUrl,electionIdForOffice} from '../src/tse/url.js';
import {storeIndicators} from '../src/majority/indicators.js';
import {states} from '../src/majority/model.js';

const ufFilter=(process.env.TSE_ONLY_UF||'').trim().toUpperCase();
const ufs=ufFilter?[ufFilter]:states.map(s=>s.uf);
if(ufs.some(uf=>!states.some(s=>s.uf===uf)))throw new Error('TSE_ONLY_UF inválida');
const scopes=[...(!ufFilter?[{uf:'BR',office:1}]:[]),...ufs.flatMap(uf=>[{uf,office:1},{uf,office:3}])];
let imported=0,failed=0;
try {
 for(const {uf,office} of scopes){
  let url=scopeResultUrl({uf,office});
  if(office===1&&uf!=='BR')url=url.replace('/dados/br/br-','/dados/'+uf.toLowerCase()+'/'+uf.toLowerCase()+'-');
  try{
   const {data,file}=await fetchAndPersist<any>(url);
   const client=await pool.connect();
   try{await storeIndicators(client,data,{electionId:electionIdForOffice(office),round:1,office,uf},url,file);}
   finally{client.release();}
   imported++;
   console.log('EA20_IMPORTED',uf,office);
  }catch(e){failed++;console.error('EA20_IMPORT_FAILED',uf,office,String(e));}
 }
 console.log(JSON.stringify({kind:'EA20_SUMMARY_IMPORT',scopes:scopes.length,imported,failed,candidateVotesModified:false}));
 if(failed)process.exitCode=1;
}finally{await pool.end();}
