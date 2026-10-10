import sharp from "sharp";
import type {PoolClient} from "pg";
import {sectionsPoolForUf} from "../db/sections.js";
import {pool} from "../db/index.js";
import {buildReport, consolidate, type Candidate, type VoteRow} from "./cartography/report.js";

/** A repeatable snapshot prevents a concurrent import changing the state total halfway through. */
export async function loadESReport(candidateId:number){
 const client=await pool.connect();
 try{
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const info=(await client.query<Candidate>("SELECT * FROM candidates WHERE id=$1",[candidateId])).rows[0];
  if(!info||info.uf!=="ES")throw new Error("Selecione um candidato do Espírito Santo para gerar este relatório.");
  const scope=[candidateId,info.election_id,info.round,info.office_code];
  const rows=(await client.query<VoteRow>(`SELECT municipality_code,votes,source_kind FROM vote_facts
   WHERE candidate_id=$1 AND election_id=$2 AND round=$3 AND office_code=$4 AND uf='ES'
   AND zone=-1 AND section=-1 AND neighborhood='' AND polling_place_code=''
   AND source_kind IN ('tse_scope','tse_municipality')`,scope)).rows;
  const report=consolidate(info,rows);
  await client.query("COMMIT");
  // Pins are optional context, never a source for totals or evidence of completeness.
  let pinClient:PoolClient|undefined;
  try{
   pinClient=await sectionsPoolForUf("ES")?.connect();
   if(pinClient){
   await pinClient.query("BEGIN READ ONLY");
   await pinClient.query("SET LOCAL statement_timeout = '8000ms'");
   report.pins=(await pinClient.query(`SELECT DISTINCT p.latitude::float8 lat,p.longitude::float8 lng FROM places p
    WHERE p.uf='ES' AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL
    AND EXISTS (SELECT 1 FROM section_votes sv WHERE sv.uf=p.uf AND sv.municipality_code=p.municipality_code
     AND sv.zone=p.zone AND sv.section=p.section AND sv.election_id=$1 AND sv.round=$2
     AND sv.office_code=$3 AND sv.candidate_number=$4 AND sv.votes>0)`,[info.election_id,info.round,info.office_code,info.number])).rows;
   await pinClient.query("COMMIT");
   }
  }catch{report.pins=[];if(pinClient)await pinClient.query("ROLLBACK")}finally{pinClient?.release()}
  return report;
 }catch(error){await client.query("ROLLBACK");throw error}finally{client.release()}
}
// Bound memory use: A2 rasterization is serialized. SVG itself stays fully vectorial.
let rasterQueue:Promise<unknown>=Promise.resolve();
export function rasterizeReport(svg:string):Promise<Buffer>{
 const job=rasterQueue.then(()=>sharp(Buffer.from(svg.replace('width="420mm" height="594mm"','width="4961" height="7016"')),{density:72,limitInputPixels:40_000_000})
  .png({compressionLevel:7}).withMetadata({density:300}).toBuffer());
 rasterQueue=job.catch(()=>{});
 return job;
}
export async function renderESMap(candidateId:number,format:"svg"|"png"){
 const report=await loadESReport(candidateId);
 const {svg}=buildReport(report);
 const filename=`mapa-profissional-es-${String(report.candidate.number).replace(/[^0-9A-Za-z-]/g,"")}-${report.candidate.election_id}-turno-${report.candidate.round}.${format}`;
 return {file:format==="svg"?Buffer.from(svg):await rasterizeReport(svg),
  mime:format==="svg"?"image/svg+xml; charset=utf-8":"image/png",filename};
}

// National reports share the original PNG encoder and keep the ES endpoint compatible.
import {sectionsPoolsForUf} from '../db/sections.js';
import {consolidateState,buildStateReport,complementaryReport,validPin,reportInfo,type StateReport} from './cartography/national.js';
export {reportInfo};
export async function loadStateReport(candidateId:number,selectedUf?:string):Promise<StateReport>{
 const client=await pool.connect();let report:StateReport;
 try{
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await client.query("SET LOCAL statement_timeout='20000ms'");
  const info=(await client.query<Candidate>('SELECT * FROM candidates WHERE id=$1',[candidateId])).rows[0];
  if(!info)throw new Error('Candidato não encontrado.');
  const uf=Number(info.office_code)===1?selectedUf:info.uf;
  if(!uf)throw new Error('Escolha uma UF para a votação presidencial.');
  if(Number(info.office_code)!==1&&selectedUf&&selectedUf!==info.uf)throw new Error('A UF deve corresponder à candidatura estadual.');
  reportInfo(uf);
  let ids=[candidateId];
  if(Number(info.office_code)===1){
   const variants=(await client.query<Candidate & {tse_candidate_id?:string}>('SELECT * FROM candidates WHERE election_id=$1 AND round=$2 AND office_code=$3 AND number=$4',[info.election_id,info.round,info.office_code,info.number])).rows;
   if(variants.some(v=>v.ballot_name.trim().toUpperCase()!==info.ballot_name.trim().toUpperCase()||v.tse_candidate_id&&(info as any).tse_candidate_id&&v.tse_candidate_id!==(info as any).tse_candidate_id))throw new Error('Identidade presidencial divergente entre UFs.');
   ids=variants.map(v=>v.id);
  }
  const rows=(await client.query<VoteRow>(`SELECT municipality_code,votes,source_kind FROM vote_facts
   WHERE candidate_id=ANY($1::bigint[]) AND election_id=$2 AND round=$3 AND office_code=$4 AND uf=$5
   AND zone=-1 AND section=-1 AND neighborhood='' AND polling_place_code=''
   AND source_kind IN ('tse_scope','tse_municipality')`,[ids,info.election_id,info.round,info.office_code,uf])).rows;
  report=consolidateState(info,uf,rows);
  await client.query('COMMIT');
 }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
 const pools=sectionsPoolsForUf(report.uf),unique=new Map<string,{lat:number;lng:number;municipality_code?:string}>();let places=0,coordinates=0,unavailable=0;
 // Consult every SP partition. Optional pin failure never modifies electoral totals.
 for(const p of pools){let c:PoolClient|undefined;try{
  c=await p.connect();await c.query('BEGIN READ ONLY');await c.query("SET LOCAL statement_timeout='12000ms'");
  const pins=(await c.query(`SELECT p.municipality_code,p.zone,p.polling_place_code,p.latitude::float8 lat,p.longitude::float8 lng
   FROM places p WHERE p.uf=$1 AND EXISTS (SELECT 1 FROM section_votes sv WHERE sv.uf=p.uf
   AND sv.municipality_code=p.municipality_code AND sv.zone=p.zone AND sv.section=p.section
   AND sv.election_id=$2 AND sv.round=$3 AND sv.office_code=$4 AND sv.candidate_number=$5)
   GROUP BY p.municipality_code,p.zone,p.polling_place_code,p.latitude,p.longitude`,[report.uf,report.candidate.election_id,report.candidate.round,report.candidate.office_code,report.candidate.number])).rows;
  places+=pins.length;for(const pin of pins)if(pin.lat!==null&&pin.lng!==null&&validPin(report,pin)){coordinates++;unique.set(`${pin.lat}:${pin.lng}`,{lat:pin.lat,lng:pin.lng,municipality_code:pin.municipality_code})}
  await c.query('COMMIT');
 }catch{unavailable++;if(c)await c.query('ROLLBACK').catch(()=>{})}finally{c?.release()}}
 report.pins=[...unique.values()];report.pinCoverage=pools.length?`${coordinates}/${places} locais consultados com coordenadas válidas; ${unavailable} base(s) indisponível(is).`:'Sem base de coordenadas configurada; mapa e votos preservados.';
 return report;
}
const inFlight=new Map<string,Promise<{file:Buffer;mime:string;filename:string}>>();
let generationQueue:Promise<unknown>=Promise.resolve();
export function renderStateMap(candidateId:number,format:'svg'|'png'|'html',uf?:string){
 const key=`${candidateId}:${uf??''}:${format}`;const active=inFlight.get(key);if(active)return active;
 if(inFlight.size>=4)return Promise.reject(new Error('Há relatórios em processamento. Aguarde a conclusão antes de solicitar outro.'));
 const job=generationQueue.then(async()=>{
  const report=await loadStateReport(candidateId,uf);
  const filename=`mapa-profissional-${report.uf.toLowerCase()}-${report.candidate.number}-${report.candidate.office_code}-${report.candidate.election_id}-turno-${report.candidate.round}.${format}`;
  if(format==='html')return {file:Buffer.from(complementaryReport(report)),mime:'text/html; charset=utf-8',filename};
  const {svg}=buildStateReport(report);
  return {file:format==='svg'?Buffer.from(svg):await rasterizeReport(svg),mime:format==='svg'?'image/svg+xml; charset=utf-8':'image/png',filename};
 });
 generationQueue=job.catch(()=>{});inFlight.set(key,job);job.finally(()=>inFlight.delete(key)).catch(()=>{});return job;
}
