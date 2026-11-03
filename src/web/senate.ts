import {readFileSync} from 'node:fs';
import type {IncomingMessage} from 'node:http';
import {sql} from '../db/index.js';
import {hashIp,clientIp} from '../auth/security.js';
export type Position='alcolumbre'|'marinho'|'indefinido';
export const senateLabels={alcolumbre:'Alcolumbre',marinho:'Rogério Marinho',indefinido:'Sem posicionamento'};
export const senateBase=JSON.parse(readFileSync(new URL('../ui/senado/base.json',import.meta.url),'utf8')).map((s:any)=>({...s,id:s.uf.toLowerCase()+'-'+s.nome.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/-$/,'')}));
type Query=(text:string,params?:unknown[])=>Promise<{rows:any[]}>;
export function ownsSenate(user:any,owner=process.env.SENATE_OWNER_EMAIL){return Boolean(owner&&user&&!user.disabled_at&&String(user.email).toLowerCase()===owner.trim().toLowerCase())}
export function senateOriginAllowed(req:IncomingMessage){
 try{const origin=new URL(String(req.headers.origin||''));const configured=new URL(process.env.APP_ORIGIN||'');return origin.protocol===configured.protocol&&origin.port===configured.port&&origin.hostname.replace(/^www\./,'')===configured.hostname.replace(/^www\./,'')&&origin.origin===String(req.headers.origin)}catch{return false}
}
export function validateSenateUpdate(input:any){
 const id=String(input.id||'');if(!senateBase.some((s:any)=>s.id===id))throw Error('Senador inválido.');
 const position=String(input.position||'') as Position;if(!Object.hasOwn(senateLabels,position))throw Error('Posicionamento inválido.');
 const version=Number(input.version);if(!Number.isSafeInteger(version)||version<0)throw Error('Versão inválida.');
 let source=String(input.source||'').trim();if(source.length>2000)throw Error('Link muito longo.');
 if(source){let u:URL;try{u=new URL(source)}catch{throw Error('Link inválido.')}if(u.protocol!=='https:'||u.username||u.password)throw Error('Use um link HTTPS sem credenciais.');source=u.href}
 const date=String(input.date||'');if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date))throw Error('Data inválida.');
 const classification=String(input.classification||'tendencia');if(!['declaracao','partido','tendencia','terceiro'].includes(classification))throw Error('Categoria inválida.');
 const note=String(input.note||'').trim();if(note.length>1500)throw Error('Observação muito longa.');
 return {id,position,version,source,date,classification,note};
}
export async function readSenators(query:Query=sql){
 const {rows}=await query('SELECT senator_id,position,source_url,publication_date,version,updated_at,classification,editorial_note FROM senate_positions');
 const updates=new Map(rows.map(r=>[r.senator_id,r]));
 return senateBase.map((s:any)=>{const r=updates.get(s.id);return {...s,posicao:r?.position??s.posicao,fonte:r?.source_url||'',dataPublicacao:r?.publication_date?new Date(r.publication_date).toISOString().slice(0,10):'',classificacao:r?.classification??'tendencia',observacao:r?.editorial_note??'',version:r?.version??0,atualizadoEm:r?.updated_at??null}});
}
export async function saveSenatePosition(user:any,req:IncomingMessage,input:any,query:Query=sql){
 if(!ownsSenate(user))throw Error('Acesso negado.');if(!senateOriginAllowed(req))throw Error('Origem inválida.');
 const d=validateSenateUpdate(input);
 const {rows}=await query(`WITH changed AS (
 INSERT INTO senate_positions(senator_id,position,source_url,publication_date,updated_by,version,classification,editorial_note)
 SELECT $1,$2,$3,NULLIF($4,'')::date,$5,1,$8,$9 WHERE $6::int=0
 ON CONFLICT(senator_id) DO UPDATE SET position=excluded.position,classification=excluded.classification,editorial_note=excluded.editorial_note,source_url=excluded.source_url,publication_date=excluded.publication_date,updated_by=excluded.updated_by,updated_at=now(),version=senate_positions.version+1 WHERE senate_positions.version=$6
 RETURNING senator_id,version
 ), updated AS (
 UPDATE senate_positions SET classification=$8,editorial_note=$9,position=$2,source_url=$3,publication_date=NULLIF($4,'')::date,updated_by=$5,updated_at=now(),version=version+1
 WHERE senator_id=$1 AND version=$6 AND $6::int>0 RETURNING senator_id,version
 ), result AS (SELECT * FROM changed UNION ALL SELECT * FROM updated), logged AS (
 INSERT INTO audit_logs(user_id,event_type,metadata,ip_hash)
 SELECT $5,'SENATE_POSITION_UPDATED',jsonb_build_object('senatorId',$1::text,'position',$2::text,'source',$3::text,'version',result.version,'classification',$8::text,'note',$9::text),$7 FROM result RETURNING id
 ) SELECT result.* FROM result,logged`,[d.id,d.position,d.source,d.date,Number(user.id),d.version,hashIp(clientIp(req)),d.classification,d.note]);
 if(rows.length!==1)throw Error('Este registro mudou em outra janela. Reabra o painel antes de salvar.');return rows[0];
}
