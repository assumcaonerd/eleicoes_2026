import assert from 'node:assert/strict';
import type {IncomingMessage} from 'node:http';
import {ownsSenate,validateSenateUpdate,readSenators,saveSenatePosition,senateBase,senateOriginAllowed} from '../src/web/senate.js';
import {homePage} from '../src/web/pages.js';
import {senateAdminPage} from '../src/web/senate-admin.js';
import {createServer} from 'node:http';
import {handleWeb} from '../src/web/handler.js';
const {PGlite}=await import(process.env.PGLITE_MODULE||'../node_modules/@electric-sql/pglite/dist/index.js');
const db=new PGlite();const query=(q:string,p?:unknown[])=>db.query(q,p) as Promise<{rows:any[]}>;
process.env.SENATE_OWNER_EMAIL='owner@example.test';process.env.APP_ORIGIN='https://www.example.test';
const owner={id:1,email:'owner@example.test',role:'superadmin'},other={id:2,email:'other@example.test',role:'superadmin'};
const req={headers:{origin:'https://www.example.test'},socket:{remoteAddress:'127.0.0.1'}} as IncomingMessage;
await db.exec(`CREATE TABLE users(id bigint primary key);INSERT INTO users VALUES(1);CREATE TABLE audit_logs(id bigserial primary key,user_id bigint,event_type text,metadata jsonb,ip_hash text);CREATE TABLE senate_positions(senator_id text primary key,position text not null check(position in ('alcolumbre','marinho','indefinido')),source_url text not null default '',publication_date date,version int not null default 1,updated_by bigint references users(id),updated_at timestamptz default now());`);
try{
 assert(ownsSenate(owner));assert(ownsSenate({...owner,role:'user'}));assert(ownsSenate({...owner,role:'admin'}));for(const u of [null,other,{...owner,disabled_at:'2026-01-01'}])assert(!ownsSenate(u));assert(!ownsSenate(owner,''));
 assert(senateOriginAllowed(req));assert(senateOriginAllowed({...req,headers:{origin:'https://example.test'}} as IncomingMessage));for(const origin of ['', 'https://evil.test','http://www.example.test','https://example.test.evil.test'])assert(!senateOriginAllowed({...req,headers:{origin}} as IncomingMessage));
 const id=senateBase[0].id;const input={id,position:'marinho',source:'https://example.test/declaracao',date:'2026-11-02',version:0};
 for(const bad of [{...input,id:'fake'},{...input,position:'empate'},{...input,source:''},{...input,source:'javascript:alert(1)'},{...input,source:'https://u:p@example.test/'},{...input,date:'2026-02-30'},{...input,version:-1}])assert.throws(()=>validateSenateUpdate(bad));
 await assert.rejects(saveSenatePosition(other,req,input,query),/Acesso negado/);
 await saveSenatePosition(owner,req,input,query);let rows=await readSenators(query);assert.equal(rows.length,81);assert.equal(rows[0].posicao,'marinho');assert.equal(rows[0].version,1);assert.equal(rows[0].fonte,input.source);assert(!('updated_by' in rows[0]));
 await assert.rejects(saveSenatePosition(owner,req,input,query),/outra janela/);
 await saveSenatePosition(owner,req,{...input,position:'alcolumbre',version:1},query);rows=await readSenators(query);assert.equal(rows[0].posicao,'alcolumbre');assert.equal(rows[0].version,2);
 await saveSenatePosition(owner,req,{...input,position:'indefinido',source:'',date:'',version:2},query);rows=await readSenators(query);assert.equal(rows[0].posicao,'indefinido');assert.equal(rows[0].version,3);assert.equal(rows[0].fonte,'');
 assert.equal((await query('SELECT count(*)::int n FROM audit_logs')).rows[0].n,3);
 assert(!homePage().includes('Controle do Senado'));assert(!homePage(other).includes('Controle do Senado'));assert(homePage(owner).includes('Controle do Senado'));
 const admin=senateAdminPage(owner,rows);assert(admin.includes('name="version"'));assert(admin.includes('Salvar e atualizar o placar'));
 console.log('Owner-only authorization, CSRF origin validation, input validation, PostgreSQL persistence, optimistic locking, audit log, public projection and private navigation passed.');
 const server=createServer(async(req,res)=>{if(!await handleWeb(req,res)){res.writeHead(404);res.end()}});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 try{const origin='http://127.0.0.1:'+(server.address() as any).port;for(const path of ['/admin/senado','/admin/senado/posicao'])for(const method of ['GET','POST']){const r=await fetch(origin+path,{method,headers:{origin:'https://www.example.test'}});assert.equal(r.status,403);assert.equal(r.headers.get('cache-control'),'no-store')}
 assert.equal((await fetch(origin+'/assets/senado/base.json')).status,404);assert.equal((await fetch(origin+'/senado')).status,200);console.log('Anonymous administrative reads/writes blocked; private base file not served; public page remains open.');
 }finally{await new Promise<void>(r=>server.close(()=>r()))}
}finally{await db.close()}
