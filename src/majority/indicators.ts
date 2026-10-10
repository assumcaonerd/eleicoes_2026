import type {PoolClient} from 'pg';
import {createHash} from 'node:crypto';
import {fetchJson} from '../tse/client.js';
import {scopeResultUrl} from '../tse/url.js';
export const indicatorSpecification='https://www.tse.jus.br/eleicoes/eleicoes-2026-content/arquivos/divulgacao-de-resultados/tse-ea20-arquivo-de-resultado-unificado';
export type TotalScope={electionId:number;round:number;office:number;uf:string;municipalityCode?:string;zone?:number};
export function parseIndicators(p:any,scope:TotalScope){
 const type=scope.zone!==undefined?'zona':scope.municipalityCode?'mu':scope.uf==='BR'?'br':'uf';
 const code=scope.zone!==undefined?String(scope.zone).padStart(4,'0'):scope.municipalityCode||scope.uf;
 if(String(p.ele)!==String(scope.electionId)||String(p.t)!==String(scope.round)||p.f!=='o'||p.tpabr!==type||String(p.cdabr).toUpperCase()!==code.toUpperCase()||!p.carg?.some((c:any)=>Number(c.cd)===scope.office))throw new Error('EA20 diverge da eleição, turno, cargo, fase oficial ou território solicitado.');
 if(p.dv==='n')throw new Error('TSE ainda não autorizou a divulgação da votação neste recorte.');
 const integer=(v:any)=>{if(!/^\d+$/.test(String(v))||!Number.isSafeInteger(Number(v)))throw new Error('EA20: campo inteiro obrigatório ausente ou inválido.');return Number(v)};
 const decimal=(v:any)=>{const n=Number(String(v).replace(',','.'));if(v===undefined||!Number.isFinite(n)||n<0||n>100)throw new Error('EA20: percentual de seções inválido.');return n};
 if(!['s','n'].includes(p.tf)||!['n','p','f'].includes(p.and))throw new Error('EA20: situação da totalização inválida.');
 if(!/^\d{2}\/\d{2}\/2026$/.test(p.dt)||!/^\d{2}:\d{2}:\d{2}$/.test(p.ht))throw new Error('EA20: data da totalização ausente ou inválida.');
 return {valid_votes:integer(p.v?.vv),blank_votes:integer(p.v?.vb),null_votes:integer(p.v?.tvn),turnout:integer(p.e?.c),abstention:integer(p.e?.a),sections_totalized_percentage:decimal(p.s?.pstn),totalization_status:p.and,totalization_final:p.tf==='s',source_date:p.dt,source_time:p.ht,generation:String(p.idg),specification:indicatorSpecification,specification_date:'2026-07-10'};
}
export async function storeIndicators(client:PoolClient,p:any,scope:TotalScope,sourceUrl:string,sourceFile:string){
 const totals=parseIndicators(p,scope);
 const digest=createHash('sha256').update(JSON.stringify(p)).digest('hex');
 await client.query(`INSERT INTO territorial_totals(election_id,round,office_code,uf,municipality_code,zone,totals,source_url,source_file,source_sha256)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
 ON CONFLICT(election_id,round,office_code,uf,municipality_code,zone) DO UPDATE SET totals=EXCLUDED.totals,source_url=EXCLUDED.source_url,source_file=EXCLUDED.source_file,source_sha256=EXCLUDED.source_sha256,imported_at=now()`,[scope.electionId,scope.round,scope.office,scope.uf,scope.municipalityCode||'',scope.zone??-1,totals,sourceUrl,sourceFile,digest]);
}
export async function readIndicators(client:PoolClient,scope:TotalScope){
 const exists=(await client.query("SELECT to_regclass('public.territorial_totals') AS relation")).rows[0]?.relation;
 if(!exists)return {rows:[],status:'A tabela de totalizações ainda não foi criada neste ambiente.'};
 const rows=(await client.query(`SELECT municipality_code,totals,source_url,source_file,source_sha256,imported_at FROM territorial_totals WHERE election_id=$1 AND round=$2 AND office_code=$3 AND uf=$4 AND zone=-1`,[scope.electionId,scope.round,scope.office,scope.uf])).rows;
 return {rows,status:rows.length?'Snapshot oficial armazenado; data e hora da totalização constam na fonte.':'Nenhuma totalização EA20 foi importada para esta eleição, turno, cargo e território.'};
}

type OnlineTotals={totals:ReturnType<typeof parseIndicators>;source_url:string;fetched_at:string};
const onlineCache=new Map<string,{expires:number;value:OnlineTotals}>();
const pendingOnline=new Map<string,Promise<OnlineTotals>>();
/** Consult the official TSE EA20 result, never fabricate a denominator.
 * A short positive TTL and inflight deduplication avoid hammering the TSE. */
export async function readOnlineIndicators(scope:TotalScope):Promise<OnlineTotals>{
 if(scope.round!==1||![1,3].includes(scope.office)||!/^(BR|[A-Z]{2})$/.test(scope.uf)||!!scope.municipalityCode&&!/^\d{5}$/.test(scope.municipalityCode)||!!scope.municipalityCode&&scope.uf==='BR'||scope.zone!==undefined)throw new Error('Recorte EA20 online inválido.');
 const key=[scope.electionId,scope.round,scope.office,scope.uf,scope.municipalityCode||''].join(':');
 const cached=onlineCache.get(key);
 if(cached&&cached.expires>Date.now())return cached.value;
 const inFlight=pendingOnline.get(key);if(inFlight)return inFlight;
 const job=(async()=>{
  let url=scopeResultUrl({office:scope.office,uf:scope.uf,municipalityCode:scope.municipalityCode});
  if(scope.office===1&&scope.uf!=='BR'&&!scope.municipalityCode)url=url.replace('/dados/br/br-','/dados/'+scope.uf.toLowerCase()+'/'+scope.uf.toLowerCase()+'-');
  const raw=await fetchJson<any>(url);
  const value={totals:parseIndicators(raw,scope),source_url:url,fetched_at:new Date().toISOString()};
  onlineCache.set(key,{expires:Date.now()+60000,value});
  return value;
 })();
 pendingOnline.set(key,job);
 try{return await job}finally{pendingOnline.delete(key)}
}
