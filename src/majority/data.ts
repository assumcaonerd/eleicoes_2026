import {pool} from '../db/index.js';
import type {PoolClient} from 'pg';
import {sectionsSqlAllForUf} from '../db/sections.js';
import {config} from '../config.js';
import {electionIdForOffice} from '../tse/url.js';
import {states,consolidateTerritories,type Municipality,type Fact} from './model.js';
import es from '../web/cartography/es-ibge.json' with {type:'json'};
import municipalities from './municipalities-2026.json' with {type:'json'};
import brazil from './br-ibge.json' with {type:'json'};
import exterior from './exterior-2026.json' with {type:'json'};

async function catalog(uf?:string):Promise<Municipality[]>{
 if(uf==='ZZ')return exterior;
 if(uf==='ES')return es.features.map(f=>({uf:'ES',code:f.properties.tseCode,name:f.properties.name,ibgeCode:f.properties.ibgeCode}));
 const all=municipalities;
 return uf?all.filter(m=>m.uf===uf):all;
}
export async function majorityOverview(candidateId:number,uf?:string,existingClient?:PoolClient){
 if(!Number.isSafeInteger(candidateId)||candidateId<=0)throw new Error('Candidato inválido.');
 if(uf&&!states.some(s=>s.uf===uf)&&uf!=='ZZ')throw new Error('UF inválida.');
 const client=existingClient??await pool.connect();
 try{
  if(!existingClient)await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await client.query("SET LOCAL statement_timeout='15000ms'");
  const c=(await client.query('SELECT * FROM candidates WHERE id=$1',[candidateId])).rows[0];
  if(!c||![1,3].includes(Number(c.office_code)))throw new Error('Selecione governador ou presidente.');
  if(c.election_id!==electionIdForOffice(Number(c.office_code))||c.round!==1||config.tseCycle!=='ele2026')throw new Error('Este módulo utiliza apenas a base 2026, primeiro turno, configurada e validada.');
  if(c.office_code===3&&uf&&uf!==c.uf)throw new Error('A UF deve corresponder à candidatura de governador.');
  const scopeUf=c.office_code===3?c.uf:uf;
  const municipalities=await catalog(scopeUf);
  const variants=(await client.query(`SELECT id,uf,ballot_name,tse_candidate_id FROM candidates
   WHERE election_id=$1 AND round=$2 AND office_code=$3 AND number=$4
   AND ($5::text IS NULL OR uf=$5 OR ($3=1 AND uf='BR'))`,[c.election_id,c.round,c.office_code,c.number,c.office_code===3?c.uf:null])).rows;
  // Numbers are election-specific. Reject ambiguous identities rather than choosing a row.
  if(variants.some(v=>String(v.ballot_name).trim().toUpperCase()!==String(c.ballot_name).trim().toUpperCase()||
    (v.tse_candidate_id&&c.tse_candidate_id&&v.tse_candidate_id!==c.tse_candidate_id)))throw new Error('Identidade do candidato divergente entre UFs.');
  const ids=variants.map(v=>v.id);
  const facts=(await client.query<Fact>(`SELECT uf,municipality_code,votes,source_kind,source_updated_at
   FROM vote_facts WHERE candidate_id=ANY($1::bigint[]) AND election_id=$2 AND round=$3 AND office_code=$4
   AND zone=-1 AND section=-1 AND neighborhood='' AND polling_place_code=''
   AND source_kind IN ('tse_municipality','tse_scope')
   AND ($5::text IS NULL OR uf=$5 OR ($4=1 AND uf='BR' AND source_kind='tse_scope'))`,[ids,c.election_id,c.round,c.office_code,scopeUf??null])).rows;
  const totals=facts.filter(f=>f.source_kind==='tse_scope'&&f.municipality_code===''&&f.uf===(c.office_code===1?'BR':c.uf));
  if(totals.length>1)throw new Error('Total oficial duplicado.');
  const total=totals.length?Number(totals[0].votes):null;
  if(total!==null&&(!Number.isSafeInteger(total)||total<0))throw new Error('Total oficial inválido.');
  const territorialFacts=!scopeUf?facts.filter(f=>f.uf!=='ZZ'):facts;
  const rows=consolidateTerritories(municipalities,territorialFacts,!scopeUf,total);
  const times=territorialFacts.filter(f=>f.source_kind==='tse_municipality').map(f=>f.source_updated_at?new Date(f.source_updated_at).toISOString():null).filter((t):t is string=>Boolean(t)).sort();
  const coverage=rows.reduce((n,r)=>n+r.coverage,0),expected=rows.reduce((n,r)=>n+r.expected,0);
  const sum=territorialFacts.filter(f=>f.source_kind==='tse_municipality').reduce((n,f)=>n+Number(f.votes),0);
  const mismatch=c.office_code===3&&coverage===expected&&total!==null&&sum!==total;
  if(!existingClient)await client.query('COMMIT');
  return {candidate:c,rows,total,uf:scopeUf??null,coverage,expected,complete:expected>0&&coverage===expected&&!mismatch,
   reconciliation:mismatch?'divergent':c.office_code===3&&coverage===expected&&total!==null?'matched':'not_verified',
   updated_at:times[0]??null,latest_record_at:times.at(-1)??null,
   source:'TSE, EA20 importado; consolidação exclusiva de registros municipais',
   mode:'stored_snapshot',valid_votes:null,blank_votes:null,null_votes:null,turnout:null,abstention:null,
   warnings:[...(coverage<expected?['Base territorial incompleta. Registro ausente não equivale a zero.']:[]),
    ...(mismatch?['Soma municipal divergente do total estadual. Não exportar como resultado conciliado.']:[]),
    'Percentuais de votos válidos e situação da apuração não estão disponíveis nesta consulta.',
    'Horários indicam a importação dos registros. Não há confirmação de conexão ao vivo com o TSE.',
    ...(c.office_code===1&&!scopeUf?['O total nacional pode incluir exterior. As 27 UFs são consolidadas apenas quando todos os municípios possuem registros; não há conciliação nacional sem o exterior completo.']:[])]};
 }catch(e){if(!existingClient)await client.query('ROLLBACK');throw e}finally{if(!existingClient)client.release()}
}

export async function majorityComparison(ids:number[],uf?:string){
 if(ids.length!==2||new Set(ids).size!==2||ids.some(id=>!Number.isSafeInteger(id)||id<=0))throw new Error('Selecione dois candidatos diferentes.');
 const client=await pool.connect();
 try{
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const a=await majorityOverview(ids[0],uf,client),b=await majorityOverview(ids[1],uf,client);
  if(a.candidate.election_id!==b.candidate.election_id||a.candidate.round!==b.candidate.round||a.candidate.office_code!==b.candidate.office_code||a.uf!==b.uf)throw new Error('Comparação exige a mesma eleição, cargo, turno e território.');
  if(a.candidate.number===b.candidate.number)throw new Error('Os registros representam o mesmo candidato.');
  if(a.reconciliation==='divergent'||b.reconciliation==='divergent')throw new Error('Comparação bloqueada por divergência de totais.');
  const indexed=new Map(b.rows.map(r=>[r.uf+':'+r.code,r]));
  const rows=a.rows.map(r=>{
   const other=indexed.get(r.uf+':'+r.code);
   return {uf:r.uf,code:r.code,name:r.name,votes_a:r.votes,votes_b:other?.votes??null,
    difference:r.votes!==null&&other?.votes!==null&&other?.votes!==undefined?r.votes-other.votes:null};
  });
  await client.query('COMMIT');
  return {candidates:[a.candidate,b.candidate],totals:[a.total,b.total],rows,uf:a.uf,
   total_difference:a.total!==null&&b.total!==null?a.total-b.total:null,
   valid_vote_percentage_difference:null,source:a.source,
   warnings:['Diferença = primeiro candidato menos segundo candidato. Percentuais de votos válidos não disponíveis.',...new Set([...a.warnings,...b.warnings])]};
 }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}

const geometryCache=new Map<string,Promise<any>>();
export async function majorityGeometry(uf?:string){
 if(!uf)return brazil;
 if(uf==='ES')return es;
 const state=states.find(s=>s.uf===uf);
 if(uf&&!state)throw new Error('UF inválida.');
 const key=uf??'BR';
 if(!geometryCache.has(key)){
  const url=state?`https://servicodados.ibge.gov.br/api/v3/malhas/estados/${state.ibgeCode}?formato=application/vnd.geo+json&qualidade=intermediaria&intrarregiao=municipio`:
   'https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application/vnd.geo+json&qualidade=intermediaria&intrarregiao=UF';
  geometryCache.set(key,(async()=>{
   const response=await fetch(url,{signal:AbortSignal.timeout(20000)});
   if(!response.ok)throw new Error('Malha IBGE indisponível: HTTP '+response.status);
   const geometry:any=await response.json();
   if(geometry.type!=='FeatureCollection'||!Array.isArray(geometry.features)||geometry.features.length===0||(!uf&&geometry.features.length!==27))throw new Error('Malha IBGE incompleta.');
   if(geometry.features.some((f:any)=>!['Polygon','MultiPolygon'].includes(f.geometry?.type)))throw new Error('Geometria territorial inválida.');
   return geometry;
  })().catch(e=>{geometryCache.delete(key);throw e}));
 }
 return geometryCache.get(key)!;
}

export async function majoritySections(args:{candidateId:number;uf:string;municipality:string;zone?:number;place?:string;section?:number;offset?:number}){
 const {candidate:c}=await majorityOverview(args.candidateId,args.uf);
 if(!/^\d{5}$/.test(args.municipality))throw new Error('Selecione um município oficial.');
 for(const value of [args.zone,args.section,args.offset])if(value!==undefined&&(!Number.isSafeInteger(value)||value<0))throw new Error('Filtro inválido.');
 const offset=args.offset??0;
 if(offset>10000)throw new Error('Página fora do limite.');
 const results=await sectionsSqlAllForUf(args.uf,`SELECT sv.uf,sv.municipality_code,sv.zone,sv.section,sv.polling_place_code,
   sv.votes,sv.source_updated_at,p.polling_place_name,p.address,p.latitude,p.longitude
  FROM section_votes sv LEFT JOIN LATERAL (
   SELECT polling_place_name,address,latitude,longitude FROM places p
   WHERE p.uf=sv.uf AND p.municipality_code=sv.municipality_code AND p.zone=sv.zone AND p.section=sv.section
   AND p.polling_place_code=sv.polling_place_code ORDER BY p.id LIMIT 1
  ) p ON true
  WHERE sv.election_id=$1 AND sv.round=$2 AND sv.office_code=$3 AND sv.candidate_number=$4 AND sv.uf=$5
   AND sv.municipality_code=$6 AND ($7::int IS NULL OR sv.zone=$7) AND ($8::text IS NULL OR sv.polling_place_code=$8)
   AND ($9::int IS NULL OR sv.section=$9)
  ORDER BY sv.zone,sv.section,sv.polling_place_code LIMIT $10`,[c.election_id,c.round,c.office_code,c.number,args.uf,args.municipality,args.zone??null,args.place??null,args.section??null,offset+501]);
 const all=results.flatMap(r=>r.rows).sort((a,b)=>a.zone-b.zone||a.section-b.section||String(a.polling_place_code).localeCompare(String(b.polling_place_code)));
 const seen=new Set<string>();
 for(const r of all){const key=r.uf+':'+r.municipality_code+':'+r.zone+':'+r.section;if(seen.has(key))throw new Error('Seção duplicada nas bases granulares. Consulta bloqueada.');seen.add(key)}
 return {rows:all.slice(offset,offset+500),has_more:all.length>offset+500,offset,limit:500,source:'TSE, boletins de urna importados',candidate:c};
}
