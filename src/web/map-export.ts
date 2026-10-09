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
