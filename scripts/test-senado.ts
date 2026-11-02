import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,readdirSync} from 'node:fs';
import vm from 'node:vm';
import {handleWeb} from '../src/web/handler.js';
import {homePage} from '../src/web/pages.js';
const server=createServer(async(req,res)=>{try{if(!await handleWeb(req,res)){res.writeHead(404);res.end()}}catch(e){res.writeHead(500);res.end(String(e))}});
await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
const address=server.address() as {port:number};const origin=`http://127.0.0.1:${address.port}`;
try{
 const home=homePage();assert(home.includes('href="/senado"'));assert(home.indexOf('id="senate-entry-title"')<home.indexOf('<section class="hero">'));
 for(const cookie of ['', 'vps_session=invalid-public-test']){
  for(const path of ['/senado','/senado/','/assets/senado/senadores.js','/assets/senado/img/alcolumbre-corda.webp']){
   const r=await fetch(origin+path,{headers:{cookie}});assert.equal(r.status,200,path);
   assert(!r.headers.has('set-cookie'));await r.arrayBuffer();
  }
 }
 const page=await(await fetch(origin+'/senado')).text();assert(!page.includes('fonts.googleapis.com'));assert(!page.includes('AtContent/'));assert(page.includes('Consulta gratuita, sem login.'));
 const context={window:{} as any};vm.runInNewContext(readFileSync('src/ui/senado/senadores.js','utf8'),context);
 const senators=context.window.SENADORES;assert.equal(senators.length,81);assert.equal(new Set(senators.map((s:any)=>s.uf)).size,27);
 for(const uf of new Set(senators.map((s:any)=>s.uf)))assert.equal(senators.filter((s:any)=>s.uf===uf).length,3);
 const assets=['senadores.js',...readdirSync('src/ui/senado/img').filter(f=>!f.includes('.')).flatMap(()=>[]),...readdirSync('src/ui/senado/img').filter(f=>f.includes('.')).map(f=>'img/'+f),...readdirSync('src/ui/senado/img/senadores').map(f=>'img/senadores/'+f)];
 for(const asset of assets){const r=await fetch(origin+'/assets/senado/'+asset);assert.equal(r.status,200,asset);await r.arrayBuffer()}
 for(const path of ['/assets/senado/not-found.js','/assets/senado/img/not-found.jpg','/assets/senado/img/%2e%2e%2findex.html'])assert.equal((await fetch(origin+path)).status,404,path);
 const app=await fetch(origin+'/app',{redirect:'manual'});assert.equal(app.status,303);assert.equal(app.headers.get('location'),'/login');
 for(const path of ['/api/candidates?q=teste','/api/majority/overview?candidateId=1'])assert.equal((await fetch(origin+path)).status,401,path);
 console.log('Senado: homepage entry, anonymous access, session independence, 81 records, all assets, path validation and paid-route protection passed.');
}finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()))}
