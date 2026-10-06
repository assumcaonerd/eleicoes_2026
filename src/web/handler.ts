import type { IncomingMessage, ServerResponse } from "node:http";
import { URL } from "node:url";
import { currentUser, hasActiveAccess, sessionCookie, clearSessionCookie, revokeCurrentSession, audit } from "../auth/security.js";
import { registerUser, loginUser } from "../auth/service.js";
import { createCheckout, handleStripeWebhook } from "../billing/stripe.js";
import { searchCandidates, compareCandidates, topTerritories, partyVotes, sourceStatus, sectionMap, sectionMetrics } from "../tools/queries.js";
import { sql } from "../db/index.js";
import { homePage, authPage, plansPage, appPage, adminPage } from "./pages.js";

async function readBody(req:IncomingMessage,raw=false){
  const chunks:Buffer[]=[];
  for await(const chunk of req) chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk));
  const buf=Buffer.concat(chunks);
  if(raw) return buf;
  const type=String(req.headers["content-type"]??"");
  if(type.includes("application/json")) return JSON.parse(buf.toString("utf8")||"{}");
  return Object.fromEntries(new URLSearchParams(buf.toString("utf8")));
}
function html(res:ServerResponse,content:string,status=200){
  res.writeHead(status,{"content-type":"text/html; charset=utf-8","content-security-policy":"default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://checkout.stripe.com","x-content-type-options":"nosniff","referrer-policy":"strict-origin-when-cross-origin","permissions-policy":"camera=(), microphone=(), geolocation=()"});
  res.end(content);
}
function json(res:ServerResponse,data:unknown,status=200){res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"});res.end(JSON.stringify(data))}
function redirect(res:ServerResponse,to:string,cookie?:string){var h:any={location:to};if(cookie)h["set-cookie"]=cookie;res.writeHead(303,h);res.end()}
function sameOrigin(req:IncomingMessage){const origin=req.headers.origin;if(!origin)return true;return !process.env.APP_ORIGIN||origin===process.env.APP_ORIGIN}

export async function handleWeb(req:IncomingMessage,res:ServerResponse){
  const url=new URL(req.url??"/","http://local");
  if(req.method==="POST"&&!sameOrigin(req)&&url.pathname!=="/webhooks/stripe"){json(res,{error:"Origem inválida."},403);return true}
  if(url.pathname==="/"&&req.method==="GET"){const user=await currentUser(req);html(res,homePage(user));return true}
  if(url.pathname==="/login"&&req.method==="GET"){html(res,authPage("login"));return true}
  if(url.pathname==="/cadastro"&&req.method==="GET"){html(res,authPage("cadastro"));return true}
  if(url.pathname==="/cadastro"&&req.method==="POST"){try{const d=await readBody(req) as any;const x=await registerUser(req,d);redirect(res,"/planos",sessionCookie(x.token,process.env.NODE_ENV==="production"));}catch(e:any){html(res,authPage("cadastro",e.message),400)}return true}
  if(url.pathname==="/login"&&req.method==="POST"){try{const d=await readBody(req) as any;const x=await loginUser(req,d);redirect(res,"/app",sessionCookie(x.token,process.env.NODE_ENV==="production"));}catch(e:any){html(res,authPage("login",e.message),401)}return true}
  if(url.pathname==="/logout"&&req.method==="POST"){await revokeCurrentSession(req);redirect(res,"/",clearSessionCookie());return true}
  if(url.pathname==="/webhooks/stripe"&&req.method==="POST"){try{const raw=await readBody(req,true) as Buffer;const sig=String(req.headers["stripe-signature"]??"");const event=await handleStripeWebhook(raw,sig);json(res,{received:true,event});}catch(e:any){json(res,{error:e.message},400)}return true}
  const user=await currentUser(req);
  if(url.pathname==="/planos"&&req.method==="GET"){if(!user){redirect(res,"/login");return true}html(res,plansPage(user));return true}
  if(url.pathname==="/checkout"&&req.method==="POST"){if(!user){redirect(res,"/login");return true}try{const d=await readBody(req) as any;const plan=d.plan==="lifetime"?"lifetime":"monthly";const target=await createCheckout({id:Number(user.id),email:user.email},plan);await audit(req,"CHECKOUT_STARTED",Number(user.id),{plan});if(!target)throw new Error("Checkout indisponível.");redirect(res,target);}catch(e:any){html(res,plansPage(user),400)}return true}
  if(url.pathname==="/app"&&req.method==="GET"){if(!user){redirect(res,"/login");return true}const active=await hasActiveAccess(Number(user.id));html(res,appPage(user,active));return true}
  if(url.pathname==="/api/candidates"&&req.method==="GET"){if(!user){json(res,{error:"Não autenticado."},401);return true}if(!await hasActiveAccess(Number(user.id))){json(res,{error:"Assinatura inativa."},402);return true}const q=url.searchParams.get("q")??"";const office=Number(url.searchParams.get("office")||0)||undefined;const uf=url.searchParams.get("uf")?.toUpperCase()||undefined;const rows=await searchCandidates({query:q,officeCode:office,uf,limit:50});await sql("INSERT INTO search_history(user_id,query,filters) VALUES($1,$2,$3)",[Number(user.id),q,JSON.stringify({office,uf})]);await audit(req,"SEARCH_CANDIDATE",Number(user.id),{q,office,uf});json(res,{rows});return true}
  if(url.pathname==="/api/compare"&&req.method==="GET"){
    if(!user){json(res,{error:"Não autenticado."},401);return true}
    if(!await hasActiveAccess(Number(user.id))){json(res,{error:"Assinatura inativa."},402);return true}
    const ids=(url.searchParams.get("ids")??"").split(",").map(Number).filter(Number.isFinite);
    if(ids.length<2||ids.length>3){json(res,{error:"Selecione 2 ou 3 candidatos para comparar."},400);return true}
    const level=(url.searchParams.get("level")??"municipality") as any;
    try{
      const rows=await compareCandidates({candidateIds:ids,level,municipalityCode:url.searchParams.get("municipality")||undefined,zone:Number(url.searchParams.get("zone")||0)||undefined});
      json(res,{rows});
    }catch(e:any){
      json(res,{error:e?.message??"Falha ao comparar candidatos."},400);
    }
    return true
  }
  if(url.pathname==="/api/top-territories"&&req.method==="GET"){if(!user){json(res,{error:"Não autenticado."},401);return true}if(!await hasActiveAccess(Number(user.id))){json(res,{error:"Assinatura inativa."},402);return true}const candidateId=Number(url.searchParams.get("candidateId"));const level=(url.searchParams.get("level")??"municipality") as any;const rows=await topTerritories({candidateId,level,limit:Number(url.searchParams.get("limit")||20)});json(res,{rows});return true}
  if(url.pathname==="/api/party-votes"&&req.method==="GET"){if(!user){json(res,{error:"Não autenticado."},401);return true}if(!await hasActiveAccess(Number(user.id))){json(res,{error:"Assinatura inativa."},402);return true}const row=await partyVotes({partyAbbr:url.searchParams.get("party")??"",officeCode:Number(url.searchParams.get("office")||0),uf:url.searchParams.get("uf")??""});json(res,{row});return true}
  if(url.pathname==="/api/data-status"&&req.method==="GET"){if(!user){json(res,{error:"Não autenticado."},401);return true}const rows=await sourceStatus();json(res,{rows});return true}
  if(url.pathname==="/api/map"&&req.method==="GET"){if(!user){json(res,{error:"Não autenticado."},401);return true}if(!await hasActiveAccess(Number(user.id))){json(res,{error:"Assinatura inativa."},402);return true}const rows=await sectionMap({candidateId:Number(url.searchParams.get("candidateId")),municipalityCode:url.searchParams.get("municipality")||undefined,limit:Number(url.searchParams.get("limit")||2000)});json(res,{rows});return true}
  if(url.pathname==="/api/section-metrics"&&req.method==="GET"){if(!user){json(res,{error:"Não autenticado."},401);return true}if(!await hasActiveAccess(Number(user.id))){json(res,{error:"Assinatura inativa."},402);return true}const row=await sectionMetrics({candidateId:Number(url.searchParams.get("candidateId")),municipalityCode:url.searchParams.get("municipality")||"",zone:Number(url.searchParams.get("zone")),section:Number(url.searchParams.get("section"))});json(res,{row});return true}
  if(url.pathname==="/api/favorites"&&req.method==="GET"){if(!user){json(res,{error:"Não autenticado."},401);return true}const rows=(await sql<any>("SELECT c.* FROM favorites f JOIN candidates c ON c.id=f.candidate_id WHERE f.user_id=$1 ORDER BY f.created_at DESC",[Number(user.id)])).rows;json(res,{rows});return true}
  if(url.pathname==="/api/favorites"&&req.method==="POST"){if(!user){json(res,{error:"Não autenticado."},401);return true}const d=await readBody(req) as any;const id=Number(d.candidateId);await sql("INSERT INTO favorites(user_id,candidate_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[Number(user.id),id]);json(res,{ok:true});return true}
  if(url.pathname==="/api/favorites"&&req.method==="DELETE"){if(!user){json(res,{error:"Não autenticado."},401);return true}const d=await readBody(req) as any;const id=Number(d.candidateId);await sql("DELETE FROM favorites WHERE user_id=$1 AND candidate_id=$2",[Number(user.id),id]);json(res,{ok:true});return true}
  if(url.pathname==="/api/history"&&req.method==="GET"){if(!user){json(res,{error:"Não autenticado."},401);return true}const rows=(await sql<any>("SELECT query,filters,created_at FROM search_history WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50",[Number(user.id)])).rows;json(res,{rows});return true}
  if(url.pathname==="/api/export.csv"&&req.method==="GET"){if(!user){json(res,{error:"Não autenticado."},401);return true}if(!await hasActiveAccess(Number(user.id))){json(res,{error:"Assinatura inativa."},402);return true}const candidateId=Number(url.searchParams.get("candidateId"));const level=(url.searchParams.get("level")??"municipality") as any;const rows=await topTerritories({candidateId,level,limit:100});const keys=rows.length?Object.keys(rows[0] as any):[];const escCsv=(v:any)=>'"'+String(v??"").replace(/"/g,'""')+'"';const csv=[keys.join(";"),...rows.map((r:any)=>keys.map(k=>escCsv(r[k])).join(";"))].join("\n");res.writeHead(200,{"content-type":"text/csv; charset=utf-8","content-disposition":"attachment; filename=radarvoto-2026.csv","cache-control":"no-store"});res.end("\uFEFF"+csv);return true}
  if(url.pathname==="/admin"&&req.method==="GET"){if(!user||!["admin","superadmin"].includes(user.role)){json(res,{error:"Acesso negado."},403);return true}const u=await sql<any>("SELECT count(*)::int n FROM users");const a=await sql<any>("SELECT count(*)::int n FROM subscriptions WHERE status IN ('active','trialing')");const i=await sql<any>("SELECT count(*)::int n FROM import_runs WHERE status='ok'");html(res,adminPage(user,{users:u.rows[0].n,active:a.rows[0].n,imports:i.rows[0].n}));return true}
  return false;
}
