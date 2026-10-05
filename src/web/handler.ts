import type { IncomingMessage, ServerResponse } from "node:http";
import { URL } from "node:url";
import { currentUser, hasActiveAccess, sessionCookie, clearSessionCookie, revokeCurrentSession, audit } from "../auth/security.js";
import { registerUser, loginUser } from "../auth/service.js";
import { createCheckout, handleStripeWebhook } from "../billing/stripe.js";
import { searchCandidates } from "../tools/queries.js";
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
  if(url.pathname==="/api/candidates"&&req.method==="GET"){if(!user){json(res,{error:"Não autenticado."},401);return true}if(!await hasActiveAccess(Number(user.id))){json(res,{error:"Assinatura inativa."},402);return true}const q=url.searchParams.get("q")??"";const office=Number(url.searchParams.get("office")||0)||undefined;const uf=url.searchParams.get("uf")?.toUpperCase()||undefined;const rows=await searchCandidates({query:q,officeCode:office,uf,limit:50});await audit(req,"SEARCH_CANDIDATE",Number(user.id),{q,office,uf});json(res,{rows});return true}
  if(url.pathname==="/admin"&&req.method==="GET"){if(!user||!["admin","superadmin"].includes(user.role)){json(res,{error:"Acesso negado."},403);return true}const u=await sql<any>("SELECT count(*)::int n FROM users");const a=await sql<any>("SELECT count(*)::int n FROM subscriptions WHERE status IN ('active','trialing')");const i=await sql<any>("SELECT count(*)::int n FROM import_runs WHERE status='ok'");html(res,adminPage(user,{users:u.rows[0].n,active:a.rows[0].n,imports:i.rows[0].n}));return true}
  return false;
}
