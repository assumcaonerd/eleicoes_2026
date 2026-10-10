import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {states,consolidateTerritories,territoryCSV,csvCell,type Fact} from '../src/majority/model.js';
import {majorityOverview,majorityGeometry,majorityComparison} from '../src/majority/data.js';
import {majorityPage} from '../src/majority/page.js';
import {handleWeb} from '../src/web/handler.js';
import {pool} from '../src/db/index.js';
import catalog from '../src/majority/municipalities-2026.json' with {type:'json'};
import exterior from '../src/majority/exterior-2026.json' with {type:'json'};
import es from '../src/web/cartography/es-ibge.json' with {type:'json'};

assert.equal(states.length,27);assert.equal(new Set(states.map(s=>s.ibgeCode)).size,27);
assert.equal(catalog.length,5571);assert.equal(exterior.length,186);assert(exterior.every(m=>m.uf==='ZZ'));
assert.equal(new Set(catalog.map(m=>m.uf+':'+m.code)).size,catalog.length);
assert.equal(es.features.length,78);
const facts:Fact[]=catalog.map((m,i)=>({uf:m.uf,municipality_code:m.code,votes:i%10,source_kind:'tse_municipality',source_updated_at:'2026-10-10T12:00:00Z'}));
const total=facts.reduce((n,f)=>n+f.votes,0);
const rows=consolidateTerritories(catalog,facts,true,total);
assert.equal(rows.length,27);assert(rows.every(r=>r.coverage===r.expected&&r.votes!==null));assert.equal(rows.reduce((n,r)=>n+r.votes!,0),total);
const municipal=consolidateTerritories(catalog,facts,false,total);assert.equal(municipal.length,5571);assert.equal(municipal.filter(r=>r.votes===0).length,558);
const missing=consolidateTerritories(catalog,facts.slice(1),true,total);assert.equal(missing.find(r=>r.uf===catalog[0].uf)!.votes,null);
assert.equal(consolidateTerritories(catalog,[],true,total).length,27);
assert.throws(()=>consolidateTerritories(catalog,[...facts,facts[0]],true,total),/duplicados/);
assert.throws(()=>consolidateTerritories(catalog,[{...facts[0],municipality_code:'invalid'}],true,total),/não conciliado/);
assert.throws(()=>consolidateTerritories(catalog,[{...facts[0],votes:-1}],true,total),/inválido/);
assert.throws(()=>consolidateTerritories(catalog,[{...facts[0],votes:1.3}],true,total),/inválido/);
assert.equal(consolidateTerritories(catalog,[...facts,{...facts[0],votes:999999,source_kind:'tse_scope'}],true,total).reduce((n,r)=>n+r.votes!,0),total);
assert.equal(csvCell('=SUM(A1:A2)'),`"'=SUM(A1:A2)"`);
const csv=territoryCSV({candidate:{election_id:6257,round:1,office_name:'Presidente',ballot_name:'TESTE SINTÉTICO',number:'00'},rows,total});
assert.equal(csv.split('\r\n').filter(Boolean).length,28);assert(csv.includes('Participação no total do candidato'));assert(!csv.includes('votos válidos (%)'));
assert.equal((await majorityGeometry()).features.length,27);assert.equal((await majorityGeometry('ES')).features.length,78);await assert.rejects(majorityGeometry('XX'),/UF inválida/);

// Exercise the read-only integration contract without touching production or storing synthetic votes.
const savedConnect=pool.connect.bind(pool);
await assert.rejects(majorityComparison([1,1]),/diferentes/);
await assert.rejects(majorityComparison([1,2,3]),/dois candidatos/);
let candidate:any={id:1,election_id:6259,round:1,office_code:3,uf:'ES',number:'00',ballot_name:'VALIDAÇÃO SINTÉTICA',tse_candidate_id:'test'};
const esfacts:Fact[]=es.features.map((m,i)=>({uf:'ES',municipality_code:m.properties.tseCode,votes:i,source_kind:'tse_municipality',source_updated_at:'2026-10-10T12:00:00Z'}));
const essum=esfacts.reduce((n,f)=>n+f.votes,0);
let fixture:Fact[]=[...esfacts,{uf:'ES',municipality_code:'',votes:essum,source_kind:'tse_scope'}],queries:string[]=[];
(pool as any).connect=async()=>({release(){},async query(text:string,values:any[]=[]){queries.push(text);
 if(text==='SELECT * FROM candidates WHERE id=$1')return {rows:[values[0]===2?{...candidate,id:2,number:'01',ballot_name:'SEGUNDO SINTÉTICO'}:candidate]};
 if(text.includes('SELECT id,uf,ballot_name'))return {rows:[{id:values[3]==='01'?2:1,uf:candidate.uf,ballot_name:values[3]==='01'?'SEGUNDO SINTÉTICO':candidate.ballot_name,tse_candidate_id:'test'}]};
 if(text.includes('FROM vote_facts')){assert.deepEqual(values.slice(1,4),[candidate.election_id,candidate.round,candidate.office_code]);assert(text.includes("source_kind IN ('tse_municipality','tse_scope')"));return {rows:values[0][0]===2?[...esfacts.map(f=>({...f,votes:f.votes+1})),{uf:'ES',municipality_code:'',votes:essum+78,source_kind:'tse_scope'}]:fixture}}return {rows:[]};
}});
try{
 const data=await majorityOverview(1);assert.equal(data.rows.length,78);assert.equal(data.total,essum);assert.equal(data.reconciliation,'matched');assert.equal(data.rows.filter(r=>r.votes===0).length,1);assert.equal(data.valid_votes,null);assert.equal(data.mode,'stored_snapshot');assert(queries.includes('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'));
 queries=[];const compared=await majorityComparison([1,2]);assert.equal(compared.rows.length,78);assert.equal(compared.total_difference,-78);assert(compared.rows.every(r=>r.difference===-1));assert.equal(queries.filter(q=>q==='BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY').length,1);assert.equal(queries.filter(q=>q==='COMMIT').length,1);
 fixture=[...esfacts.slice(1),{uf:'ES',municipality_code:'',votes:essum,source_kind:'tse_scope'}];assert.equal((await majorityOverview(1)).complete,false);
 fixture=[...esfacts,{uf:'ES',municipality_code:'',votes:essum+1,source_kind:'tse_scope'}];assert.equal((await majorityOverview(1)).reconciliation,'divergent');
 fixture=[...esfacts,esfacts[0]];await assert.rejects(majorityOverview(1),/duplicados/);
 await assert.rejects(majorityOverview(1,'SP'),/UF deve corresponder/);
 candidate={...candidate,round:2};await assert.rejects(majorityOverview(1),/primeiro turno/);
 candidate={...candidate,round:1,office_code:7};await assert.rejects(majorityOverview(1),/governador ou presidente/);
}finally{(pool as any).connect=savedConnect}
const page=majorityPage({id:1,email:'synthetic@example.invalid'}),ids=[...page.matchAll(/id="(majority[^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
new Script(readFileSync(new URL('../src/ui/majority.js',import.meta.url),'utf8'));
assert(page.includes('prefers-reduced-motion'));assert(page.includes('@media(max-width:800px)'));assert(page.includes('outline:3px solid #ffdc35'));
for(const path of ['/api/majority/compare?ids=1,2','/api/majority/overview?candidateId=1','/api/majority/export.csv?candidateId=1','/api/majority/geometry','/api/majority/sections','/assets/siga-voto/majority.js','/app/majority']){
 let status=0;const res={writeHead(s:number){status=s},end(){}};assert(await handleWeb({method:'GET',url:path,headers:{}} as any,res as any));assert.equal(status,path==='/app/majority'?303:401);
}
console.log(JSON.stringify({passed:true,synthetic:true,states:27,municipalities:5571,es:78,exterior:186,checks:['zero versus missing','duplicate rejection','scope isolation','snapshot read-only','no mixed aggregate grains','CSV completeness and formula safety','cartographic inventories','unavailable indicators','authentication','UI syntax','existing controls preserved'],productionDatabaseTested:false,browserTested:false}));
await pool.end();
