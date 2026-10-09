import type { IncomingMessage, ServerResponse } from "node:http";
import { URL } from "node:url";
import { currentUser, hasActiveAccess, sessionCookie, clearSessionCookie, revokeCurrentSession, audit, hashPassword, hashToken } from "../auth/security.js";
import { registerUser, loginUser } from "../auth/service.js";
import { createCheckout, handleStripeWebhook } from "../billing/stripe.js";
import { searchCandidates, compareCandidates, topTerritories, partyVotes, sourceStatus, sectionMap, sectionMetrics, candidateTerritoryOverview, territorialLevel, candidateVoteComparison, comparativeTerritories } from "../tools/queries.js";
import { sql } from "../db/index.js";
import { homePage, authPage, plansPage, appPage, adminPage, resetPasswordPage } from "./pages.js";

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
  res.writeHead(status,{"content-type":"text/html; charset=utf-8","content-security-policy":"default-src 'self'; style-src 'self' 'unsafe-inline' https://unpkg.com; script-src 'self' 'unsafe-inline' https://unpkg.com; img-src 'self' data: https://*.tile.openstreetmap.org https://unpkg.com https://services.arcgisonline.com https://server.arcgisonline.com; connect-src 'self' https://*.tile.openstreetmap.org https://services.arcgisonline.com https://server.arcgisonline.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://checkout.stripe.com","x-content-type-options":"nosniff","referrer-policy":"strict-origin-when-cross-origin","permissions-policy":"camera=(), microphone=(), geolocation=(self)"});
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
  if(url.pathname==="/redefinir-senha"&&req.method==="GET"){
    const token=url.searchParams.get("token")??"";
    if(!token){html(res,resetPasswordPage("", "Link inválido."),400);return true}
    const row=(await sql<any>("SELECT 1 FROM password_reset_tokens WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() LIMIT 1",[hashToken(token)])).rows[0];
    if(!row){html(res,resetPasswordPage("", "Link inválido ou expirado."),400);return true}
    html(res,resetPasswordPage(token));return true
  }
  if(url.pathname==="/redefinir-senha"&&req.method==="POST"){
    const d=await readBody(req) as any;
    const token=String(d.token??"");
    try{
      const password=String(d.password??"");
      const confirm=String(d.confirm??"");
      if(password!==confirm) throw new Error("As senhas não conferem.");
      const reset=(await sql<any>("SELECT id,user_id FROM password_reset_tokens WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() LIMIT 1",[hashToken(token)])).rows[0];
      if(!reset) throw new Error("Link inválido ou expirado.");
      const passwordHash=await hashPassword(password);
      await sql("UPDATE users SET password_hash=$1,updated_at=now() WHERE id=$2",[passwordHash,Number(reset.user_id)]);
      await sql("UPDATE password_reset_tokens SET used_at=now() WHERE id=$1",[Number(reset.id)]);
      await sql("UPDATE user_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL",[Number(reset.user_id)]);
      html(res,resetPasswordPage("", "", true));return true
    }catch(e:any){
      html(res,resetPasswordPage(token,e.message),400);return true
    }
  }
  if(url.pathname==="/cadastro"&&req.method==="POST"){try{const d=await readBody(req) as any;const x=await registerUser(req,d);redirect(res,"/planos",sessionCookie(x.token,process.env.NODE_ENV==="production"));}catch(e:any){html(res,authPage("cadastro",e.message),400)}return true}
  if(url.pathname==="/login"&&req.method==="POST"){try{const d=await readBody(req) as any;const x=await loginUser(req,d);redirect(res,"/app",sessionCookie(x.token,process.env.NODE_ENV==="production"));}catch(e:any){html(res,authPage("login",e.message),401)}return true}
  if(url.pathname==="/logout"&&req.method==="POST"){await revokeCurrentSession(req);redirect(res,"/",clearSessionCookie());return true}
  if(url.pathname==="/webhooks/stripe"&&req.method==="POST"){try{const raw=await readBody(req,true) as Buffer;const sig=String(req.headers["stripe-signature"]??"");const event=await handleStripeWebhook(raw,sig);json(res,{received:true,event});}catch(e:any){json(res,{error:e.message},400)}return true}
  const user=await currentUser(req);
  if(url.pathname==="/planos"&&req.method==="GET"){if(!user){redirect(res,"/login");return true}html(res,plansPage(user));return true}
  if(url.pathname==="/checkout"&&req.method==="POST"){if(!user){redirect(res,"/login");return true}try{const d=await readBody(req) as any;const plan=d.plan==="lifetime"?"lifetime":"monthly";const target=await createCheckout({id:Number(user.id),email:user.email},plan);await audit(req,"CHECKOUT_STARTED",Number(user.id),{plan});if(!target)throw new Error("Checkout indisponível.");redirect(res,target);}catch(e:any){html(res,plansPage(user),400)}return true}
  if(url.pathname==="/app"&&req.method==="GET"){if(!user){redirect(res,"/login");return true}const active=await hasActiveAccess(Number(user.id));html(res,appPage(user,active));return true}
  if(url.pathname==="/ops/merge-section-batch"&&req.method==="POST"){
    const key=String(req.headers["x-ops-key"]??"");
    if(!process.env.OPS_MERGE_TOKEN||key!==process.env.OPS_MERGE_TOKEN){json(res,{error:"Negado."},403);return true}
    const d=await readBody(req) as any;
    const offset=Math.max(0,Number(d.offset||0));
    const limit=Math.max(1,Math.min(10,Number(d.limit||5)));
    const ms=(await sql<any>("SELECT DISTINCT municipality_code FROM section_vote_raw WHERE uf='ES' ORDER BY municipality_code OFFSET $1 LIMIT $2",[offset,limit])).rows;
    let affected=0;
    for(const m of ms){
      const r=await sql<any>(`
        INSERT INTO vote_facts (
          election_id,round,office_code,candidate_id,uf,municipality_code,municipality_name,
          neighborhood,zone,section,polling_place_code,votes,source_kind,source_file,source_updated_at
        )
        SELECT
          r.election_id,r.round,r.office_code,c.id,r.uf,r.municipality_code,r.municipality_name,
          COALESCE(p.neighborhood,''),r.zone,r.section,r.polling_place_code,r.votes,
          'tse_section_bu',r.source_file,now()
        FROM section_vote_raw r
        JOIN LATERAL (
          SELECT c0.id FROM candidates c0
          WHERE c0.election_id=r.election_id AND c0.office_code=r.office_code
            AND c0.number=r.candidate_number
            AND ((r.office_code=1 AND c0.uf='BR') OR (r.office_code<>1 AND c0.uf=r.uf))
          ORDER BY c0.id LIMIT 1
        ) c ON true
        LEFT JOIN places p ON p.uf=r.uf AND p.municipality_code=r.municipality_code
          AND p.zone=r.zone AND p.section=r.section AND p.polling_place_code=r.polling_place_code
        WHERE r.uf='ES' AND r.municipality_code=$1
        ON CONFLICT (
          election_id,round,office_code,candidate_id,uf,municipality_code,neighborhood,
          zone,section,polling_place_code,source_kind
        )
        DO UPDATE SET votes=EXCLUDED.votes,source_file=EXCLUDED.source_file,source_updated_at=now()
        RETURNING 1
      `,[m.municipality_code]);
      affected+=r.rowCount??0;
    }
    json(res,{ok:true,offset,limit,municipalities:ms.map((x:any)=>x.municipality_code),affected});return true
  }
  if(url.pathname==="/ops/section-status"&&req.method==="GET"){
    const key=String(req.headers["x-ops-key"]??"");
    if(!process.env.OPS_MERGE_TOKEN||key!==process.env.OPS_MERGE_TOKEN){json(res,{error:"Negado."},403);return true}
    const counts=(await sql<any>(`
      SELECT
        (SELECT COUNT(*)::bigint FROM section_vote_raw WHERE uf='ES') AS raw,
        (SELECT COUNT(*)::bigint FROM vote_facts WHERE uf='ES' AND source_kind='tse_section_bu') AS merged,
        (SELECT COUNT(*)::bigint FROM places WHERE uf='ES') AS places,
        (SELECT COUNT(DISTINCT neighborhood)::int FROM places WHERE uf='ES' AND neighborhood<>'') AS neighborhoods,
        (SELECT COUNT(DISTINCT polling_place_code)::int FROM places WHERE uf='ES' AND polling_place_code<>'') AS locations
    `)).rows[0];
    const candidate=(await sql<any>(`
      SELECT c.id,c.ballot_name,c.number,
        COUNT(*)::int AS rows,
        COUNT(DISTINCT (v.municipality_code,v.zone,v.section))::int AS sections,
        COALESCE(SUM(v.votes),0)::int AS votes,
        COUNT(DISTINCT NULLIF(v.neighborhood,''))::int AS neighborhoods,
        COUNT(DISTINCT NULLIF(v.polling_place_code,''))::int AS locations
      FROM vote_facts v JOIN candidates c ON c.id=v.candidate_id
      WHERE v.uf='ES' AND v.source_kind='tse_section_bu'
        AND c.office_code=7 AND c.number='22190'
      GROUP BY c.id,c.ballot_name,c.number
    `)).rows;
    json(res,{counts,candidate});return true
  }
  if(url.pathname==="/api/candidates"&&req.method==="GET"){if(!user){json(res,{error:"Não autenticado."},401);return true}if(!await hasActiveAccess(Number(user.id))){json(res,{error:"Assinatura inativa."},402);return true}const q=url.searchParams.get("q")??"";const office=Number(url.searchParams.get("office")||0)||undefined;const uf=url.searchParams.get("uf")?.toUpperCase()||undefined;const rows=await searchCandidates({query:q,officeCode:office,uf,limit:50});await sql("INSERT INTO search_history(user_id,query,filters) VALUES($1,$2,$3)",[Number(user.id),q,JSON.stringify({office,uf})]);await audit(req,"SEARCH_CANDIDATE",Number(user.id),{q,office,uf});json(res,{rows});return true}
  if(url.pathname==="/api/candidate-overview"&&req.method==="GET"){
    if(!user){json(res,{error:"Não autenticado."},401);return true}
    if(!await hasActiveAccess(Number(user.id))){json(res,{error:"Assinatura inativa."},402);return true}
    const candidateId=Number(url.searchParams.get("candidateId"));
    if(!candidateId){json(res,{error:"Candidato inválido."},400);return true}
    const data=await candidateTerritoryOverview(candidateId);
    if(!data){json(res,{error:"Candidato não encontrado."},404);return true}
    json(res,data);return true
  }
  if(url.pathname==="/api/comparison-export.csv"&&req.method==="GET"){
    if(!user){json(res,{error:"Não autenticado."},401);return true}
    if(!await hasActiveAccess(Number(user.id))){json(res,{error:"Assinatura inativa."},402);return true}
    const rawIds=(url.searchParams.get("ids")??"").split(",");
    const ids=rawIds.map(Number);
    const level=url.searchParams.get("level")??"municipality";
    if(ids.length<2||ids.length>3||new Set(ids).size!==ids.length||
       !ids.every(x=>Number.isSafeInteger(x)&&x>0)||
       !["municipality","neighborhood","zone","polling_place","section"].includes(level)){
      json(res,{error:"Parâmetros de exportação inválidos."},400);return true
    }
    try{
      const data=await comparativeTerritories({
        candidateIds:ids,level:level as any,
        municipalityCode:url.searchParams.get("municipality")||undefined,
        territoryKey:url.searchParams.get("territory_key")||undefined,
        exportAll:true
      });
      // Generate the export before sending headers, so errors cannot produce broken CSV files.
      const safeCell=(value:unknown)=>{
        let valueText=String(value??"");
        // Prevent spreadsheet formulas when a field comes from user-supplied source data.
        if(/^[\\s]*[=+@]/.test(valueText)||/^[\\s]*-(?=[^0-9])/ .test(valueText))valueText="'"+valueText;
        return '"'+valueText.replace(/"/g,'""')+'"';
      };
      const candidates=data.candidates as any[];
      const headings=["Eleição","Turno","Cargo (código)","UF","Nível",
        "Município (código)","Município","Bairro","Zona","Local (código)",
        "Local de votação","Endereço","Seção","Latitude","Longitude",
        ...candidates.map(c=>"Votos - "+c.ballot_name+" ("+c.number+" / "+(c.party_abbr??"")+")"),
        "Diferença de votos (1º candidato - 2º candidato)"];
      const csvLines=[headings.map(safeCell).join(";")];
      for(const row of data.rows){
        const cells=[data.scope.election_id,data.scope.round,data.scope.office_code,
          data.scope.uf,level,row.municipality_code,row.municipality_name,
          row.neighborhood,row.zone,row.polling_place_code,row.polling_place_name,
          row.address,row.section,row.latitude,row.longitude,
          ...candidates.map(c=>{
            const entry=row.candidates.find((v:any)=>String(v.number)===String(c.number));
            return entry?.votes??"";
          }),
          row.comparison_difference??""];
        csvLines.push(cells.map(safeCell).join(";"));
      }
      const csv="\uFEFF"+csvLines.join("\r\n")+"\r\n";
      res.writeHead(200,{"content-type":"text/csv; charset=utf-8",
        "content-disposition":'attachment; filename="comparacao-siga-o-voto-2026-'+level+'-completo.csv"',
        "cache-control":"private, no-store","x-content-type-options":"nosniff",
        "x-exported-territories":String(data.rows.length)});
      res.end(csv);return true
    }catch(e:any){json(res,{error:e?.message||"Falha ao exportar comparação."},400);return true}
  }
  if(url.pathname==="/api/comparison-territories"&&req.method==="GET"){
    if(!user){json(res,{error:"Não autenticado."},401);return true}
    if(!await hasActiveAccess(Number(user.id))){json(res,{error:"Assinatura inativa."},402);return true}
    const raw=(url.searchParams.get("ids")||"").split(",");
    const ids=raw.map(Number);
    const level=url.searchParams.get("level")||"municipality";
    if(ids.length<2||ids.length>3||!ids.every(x=>Number.isSafeInteger(x)&&x>0)||
       !["municipality","neighborhood","zone","polling_place","section"].includes(level)){
       json(res,{error:"Parâmetros inválidos para comparação."},400);return true
    }
    try{
      const data=await comparativeTerritories({candidateIds:ids,level:level as any,
        municipalityCode:url.searchParams.get("municipality")||undefined,
        territoryKey:url.searchParams.get("territory_key")||undefined});
      json(res,data);
    }catch(e:any){json(res,{error:e.message||"Falha na comparação territorial."},400)}
    return true
  }
  if(url.pathname==="/api/vote-comparison"&&req.method==="GET"){
    if(!user){json(res,{error:"Não autenticado."},401);return true}
    if(!await hasActiveAccess(Number(user.id))){json(res,{error:"Assinatura inativa."},402);return true}
    const candidateId=Number(url.searchParams.get("candidateId"));
    if(!Number.isSafeInteger(candidateId)||candidateId<=0){json(res,{error:"Candidato inválido."},400);return true}
    const parseOptional=(key:string)=>{
      const value=url.searchParams.get(key);
      if(value===null||value==="")return undefined;
      const n=Number(value);
      if(!Number.isSafeInteger(n)||n<0)throw new Error("Filtro "+key+" inválido.");
      return n;
    };
    try{
      const data=await candidateVoteComparison({
        candidateId,
        municipalityCode:url.searchParams.get("municipality")||undefined,
        neighborhood:url.searchParams.get("neighborhood")||undefined,
        pollingPlaceCode:url.searchParams.get("polling_place")||undefined,
        zone:parseOptional("zone"),
        section:parseOptional("section")
      });
      if(!data){json(res,{error:"Candidato não encontrado."},404);return true}
      json(res,data);
    }catch(e:any){json(res,{error:e?.message||"Falha ao carregar comparação."},400)}
    return true
  }
  if(url.pathname==="/api/territory"&&req.method==="GET"){
    if(!user){json(res,{error:"Não autenticado."},401);return true}
    if(!await hasActiveAccess(Number(user.id))){json(res,{error:"Assinatura inativa."},402);return true}
    const candidateId=Number(url.searchParams.get("candidateId"));
    const level=(url.searchParams.get("level")??"municipality") as any;
    const allowed=["municipality","zone","neighborhood","polling_place","section"];
    if(!candidateId||!allowed.includes(level)){json(res,{error:"Consulta territorial inválida."},400);return true}
    const rows=await territorialLevel({
      candidateId,level,
      municipalityCode:url.searchParams.get("municipality")||undefined,
      neighborhood:url.searchParams.get("neighborhood")||undefined,
      pollingPlaceCode:url.searchParams.get("polling_place")||undefined,
      zone:Number(url.searchParams.get("zone")||0)||undefined,
      limit:Number(url.searchParams.get("limit")||500)
    });
    json(res,{rows});return true
  }
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
