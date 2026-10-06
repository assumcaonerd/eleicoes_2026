const css = "*{box-sizing:border-box}body{margin:0;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f4f6f8;color:#151515}a{color:inherit}.wrap{max-width:1100px;margin:auto;padding:28px}.nav{display:flex;justify-content:space-between;align-items:center;padding:20px 0}.brand{font-weight:900;font-size:21px}.card{background:#fff;border:1px solid #e7e7e7;border-radius:20px;padding:24px;box-shadow:0 10px 35px rgba(0,0,0,.05)}.hero{padding:70px 0}.hero h1{font-size:52px;line-height:1;margin:0 0 18px;max-width:750px}.muted{color:#68717a}.btn{display:inline-block;border:0;border-radius:12px;padding:12px 18px;background:#111;color:#fff;text-decoration:none;font-weight:750;cursor:pointer}.btn.secondary{background:#fff;color:#111;border:1px solid #ddd}.row{display:flex;gap:12px;flex-wrap:wrap}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:16px}.field{display:flex;flex-direction:column;gap:6px;margin:12px 0}input,select{padding:13px;border:1px solid #d7dce0;border-radius:10px;font:inherit}.auth{max-width:460px;margin:55px auto}.error{background:#fff1f0;color:#9d1717;padding:12px;border-radius:10px;margin:12px 0}.metric{font-size:34px;font-weight:900}.tag{display:inline-flex;padding:5px 9px;border-radius:999px;background:#edf0f3;font-size:12px}.footer{padding:35px 0;color:#777;font-size:12px}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:12px;border-bottom:1px solid #eee}th{font-size:12px;text-transform:uppercase;color:#68717a}@media(max-width:700px){.hero h1{font-size:38px}.wrap{padding:18px}}";

function esc(v:unknown){return String(v??"").replace(/[&<>"']/g,function(c){return ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"} as any)[c]})}

export function layout(title:string,body:string,user?:any){
  var actions = user ? '<a class="btn secondary" href="/app">Painel</a><form method="post" action="/logout"><button class="btn secondary">Sair</button></form>' : '<a class="btn secondary" href="/login">Entrar</a><a class="btn" href="/cadastro">Assinar</a>';
  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(title)+' | Votos por Seção</title><style>'+css+'</style></head><body><div class="wrap"><div class="nav"><a href="/" class="brand" style="text-decoration:none">Votos por Seção <span class="tag">2026</span></a><div class="row">'+actions+'</div></div>'+body+'<div class="footer">Fonte original dos dados eleitorais: Tribunal Superior Eleitoral. Plataforma independente.</div></div></body></html>';
}

export function homePage(user?:any){
  var buttons = user ? '<a class="btn" href="/app">Abrir aplicativo</a>' : '<a class="btn" href="/cadastro">Criar acesso</a><a class="btn secondary" href="/login">Já sou assinante</a>';
  return layout("Início",'<section class="hero"><h1>Seu resultado eleitoral de 2026, do estado até a seção.</h1><p class="muted" style="font-size:19px;max-width:730px">Consulte candidatos, municípios, bairros, zonas, locais de votação e seções em uma base própria construída a partir dos dados oficiais da Justiça Eleitoral.</p><div class="row" style="margin-top:24px">'+buttons+'</div></section><div class="grid"><div class="card"><b>Base 2026</b><p class="muted">Dados oficiais preservados localmente.</p></div><div class="card"><b>Detalhamento</b><p class="muted">Município, bairro, zona, local e seção conforme disponibilidade oficial.</p></div><div class="card"><b>Acesso privado</b><p class="muted">Conta individual e assinatura ativa.</p></div></div>',user);
}

export function authPage(kind:"login"|"cadastro",error=""){
  var extra = kind==="cadastro" ? '<label class="field">Nome<input name="name" autocomplete="name"></label>' : '';
  var err = error ? '<div class="error">'+esc(error)+'</div>' : '';
  return layout(kind==="login"?"Entrar":"Criar conta",'<div class="auth card"><h1>'+(kind==="login"?"Entrar":"Criar conta")+'</h1>'+err+'<form method="post" action="/'+kind+'">'+extra+'<label class="field">E-mail<input type="email" name="email" required autocomplete="email"></label><label class="field">Senha<input type="password" name="password" required minlength="12"></label><button class="btn" style="width:100%">'+(kind==="login"?"Entrar":"Continuar")+'</button></form></div>');
}

export function plansPage(user:any){
  return layout("Planos",'<h1>Escolha seu acesso</h1><div class="grid"><div class="card"><div class="tag">Mensal</div><h2>Assinatura mensal</h2><p class="muted">Acesso enquanto a assinatura estiver ativa.</p><form method="post" action="/checkout"><input type="hidden" name="plan" value="monthly"><button class="btn">Assinar mensal</button></form></div><div class="card"><div class="tag">Pagamento único</div><h2>Acesso permanente</h2><p class="muted">Um único pagamento para manter o acesso.</p><form method="post" action="/checkout"><input type="hidden" name="plan" value="lifetime"><button class="btn">Comprar acesso</button></form></div></div>',user);
}

export function appPage(user:any,active:boolean){
  if(!active) return layout("Aplicativo",'<div class="card"><h1>Assinatura necessária</h1><p class="muted">Sua conta está autenticada, mas ainda não possui uma assinatura ativa.</p><a class="btn" href="/planos">Escolher plano</a></div>',user);
  var body = `
<style>
  .searchbox{margin-bottom:22px}
  .candidate-list{display:grid;gap:10px;margin-top:18px}
  .candidate-item{width:100%;text-align:left;border:1px solid #e2e6ea;background:#fff;border-radius:14px;padding:16px;cursor:pointer}
  .candidate-item:hover{border-color:#111;background:#fafafa}
  .candidate-name{font-size:18px;font-weight:850}
  .candidate-meta{color:#68717a;font-size:14px;margin-top:4px}
  .dash{display:none}
  .dash-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap;margin-bottom:18px}
  .dash-title h2{margin:0 0 4px;font-size:28px}
  .metrics{display:grid;grid-template-columns:repeat(4,minmax(140px,1fr));gap:12px;margin:18px 0}
  .metric-card{background:#fff;border:1px solid #e5e8eb;border-radius:16px;padding:18px}
  .metric-card .n{font-size:28px;font-weight:900;margin-top:5px}
  .tabs{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0}
  .tab{border:1px solid #d9dde1;background:#fff;border-radius:999px;padding:10px 14px;font-weight:800;cursor:pointer}
  .tab.active{background:#111;color:#fff;border-color:#111}
  .scopebar{display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin:12px 0 18px}
  .scopebar .field{min-width:260px;margin:0}
  .territory-card{overflow:hidden}
  .strength{display:inline-block;border-radius:999px;padding:5px 9px;background:#edf0f3;font-size:12px;font-weight:800}
  .empty{padding:28px;text-align:center;border:1px dashed #ccd2d7;border-radius:14px;color:#68717a;background:#fafbfc}
  .topline{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  .rank{font-weight:900;color:#68717a}
  @media(max-width:760px){
    .metrics{grid-template-columns:repeat(2,1fr)}
    .metric-card .n{font-size:24px}
    .territory-card{overflow-x:auto}
    table{min-width:650px}
  }
</style>

<h1>Siga o Voto 2026</h1>
<p class="muted">Escolha um candidato e descubra onde a votação foi forte, média ou fraca.</p>

<div class="card searchbox">
  <form id="search">
    <div class="grid">
      <label class="field">Candidato
        <input name="q" placeholder="Digite o nome ou número" required autocomplete="off">
      </label>
      <label class="field">Cargo
        <select name="office">
          <option value="">Todos</option>
          <option value="1">Presidente</option>
          <option value="3">Governador</option>
          <option value="5">Senador</option>
          <option value="6">Deputado Federal</option>
          <option value="7">Deputado Estadual/Distrital</option>
        </select>
      </label>
      <label class="field">Estado
        <input name="uf" maxlength="2" placeholder="ES">
      </label>
    </div>
    <button class="btn">Encontrar candidato</button>
  </form>
  <div id="searchResults" class="candidate-list"></div>
</div>

<section id="dashboard" class="dash">
  <div class="card">
    <div class="dash-head">
      <div class="dash-title">
        <div class="tag">Raio-X eleitoral</div>
        <h2 id="candName"></h2>
        <div class="muted" id="candMeta"></div>
      </div>
      <button class="btn secondary" type="button" id="newSearch">Trocar candidato</button>
    </div>

    <div class="metrics">
      <div class="metric-card"><div class="muted">Votos totais</div><div class="n" id="totalVotes">0</div></div>
      <div class="metric-card"><div class="muted">Municípios com votos</div><div class="n" id="municipalitiesCount">0</div></div>
      <div class="metric-card"><div class="muted">Melhor município</div><div class="n" style="font-size:19px" id="bestCity">-</div></div>
      <div class="metric-card"><div class="muted">% no melhor município</div><div class="n" id="bestPct">0%</div></div>
    </div>

    <div class="tabs" id="tabs">
      <button class="tab active" data-level="municipality">Municípios</button>
      <button class="tab" data-level="zone">Zonas</button>
      <button class="tab" data-level="neighborhood">Bairros</button>
      <button class="tab" data-level="polling_place">Rua / Local</button>
      <button class="tab" data-level="section">Seções</button>
    </div>

    <div class="scopebar" id="scopebar" style="display:none">
      <label class="field">Município
        <select id="municipalitySelect"></select>
      </label>
    </div>

    <div id="territoryTitle" class="topline"><h3 style="margin:0">Ranking por município</h3></div>
    <div id="territoryContent" class="territory-card" style="margin-top:12px"></div>
  </div>
</section>

<script>
let currentCandidate=null;
let overview=null;
let currentLevel="municipality";

const fmt=n=>new Intl.NumberFormat("pt-BR").format(Number(n||0));
const pct=n=>Number(n||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})+"%";
const escHtml=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));

function strength(rank,total){
  if(!total) return "";
  const p=rank/total;
  if(p<=.10) return "Muito forte";
  if(p<=.30) return "Forte";
  if(p<=.70) return "Médio";
  return "Fraco";
}

function candidateButtons(rows){
  if(!rows.length) return '<div class="empty">Nenhum candidato encontrado com esses filtros.</div>';
  return rows.map(x=>`
    <button class="candidate-item" type="button" data-id="${x.id}">
      <div class="candidate-name">${escHtml(x.ballot_name)}</div>
      <div class="candidate-meta">Nº ${escHtml(x.number)} · ${escHtml(x.party_abbr||"")} · ${escHtml(x.office_name)} · ${escHtml(x.uf)}</div>
    </button>`).join("");
}

document.getElementById("search").addEventListener("submit",async e=>{
  e.preventDefault();
  const f=new FormData(e.target),p=new URLSearchParams();
  for(const [k,v] of f.entries()) if(v) p.set(k,String(v));
  const box=document.getElementById("searchResults");
  box.innerHTML='<div class="muted">Buscando...</div>';
  const r=await fetch("/api/candidates?"+p.toString());
  const d=await r.json();
  if(!r.ok){box.innerHTML='<div class="error">'+escHtml(d.error)+'</div>';return}
  box.innerHTML=candidateButtons(d.rows||[]);
  box.querySelectorAll(".candidate-item").forEach(b=>b.addEventListener("click",()=>openCandidate(Number(b.dataset.id))));
});

async function openCandidate(id){
  const r=await fetch("/api/candidate-overview?candidateId="+id);
  const d=await r.json();
  if(!r.ok){document.getElementById("searchResults").innerHTML='<div class="error">'+escHtml(d.error)+'</div>';return}
  currentCandidate=d.candidate;
  overview=d;
  document.getElementById("candName").textContent=d.candidate.ballot_name;
  document.getElementById("candMeta").textContent="Nº "+d.candidate.number+" · "+(d.candidate.party_abbr||"")+" · "+d.candidate.office_name+" · "+d.candidate.uf;
  document.getElementById("totalVotes").textContent=fmt(d.total_votes);
  document.getElementById("municipalitiesCount").textContent=fmt(d.municipalities_count);
  document.getElementById("bestCity").textContent=d.strongest?.[0]?.municipality_name||"-";
  document.getElementById("bestPct").textContent=pct(d.strongest?.[0]?.pct_total||0);

  const sel=document.getElementById("municipalitySelect");
  sel.innerHTML='<option value="">Selecione um município</option>'+d.municipalities.map(x=>'<option value="'+escHtml(x.municipality_code)+'">'+escHtml(x.municipality_name)+'</option>').join("");

  document.getElementById("dashboard").style.display="block";
  document.getElementById("searchResults").innerHTML="";
  await showLevel("municipality");
  document.getElementById("dashboard").scrollIntoView({behavior:"smooth",block:"start"});
}

function municipalityTable(rows){
  const total=rows.length;
  return '<table><thead><tr><th>Posição</th><th>Município</th><th>Votos</th><th>% dos seus votos</th><th>Força</th></tr></thead><tbody>'+
    rows.map(x=>'<tr class="municipality-row" data-code="'+escHtml(x.municipality_code)+'" style="cursor:pointer"><td class="rank">#'+x.rank+'</td><td><b>'+escHtml(x.municipality_name)+'</b></td><td>'+fmt(x.votes)+'</td><td>'+pct(x.pct_total)+'</td><td><span class="strength">'+strength(x.rank,total)+'</span></td></tr>').join("")+
    '</tbody></table>';
}

function genericTable(rows,level){
  if(!rows.length){
    if(["neighborhood","polling_place","section"].includes(level)){
      return '<div class="empty"><b>O detalhamento de 2026 neste nível ainda não está disponível na base oficial consolidada do TSE.</b><br><br>Assim que o TSE liberar os resultados granulares por seção, esta área será preenchida com os votos do candidato.</div>';
    }
    return '<div class="empty">Ainda não há dados deste nível para o município selecionado.</div>';
  }
  const total=rows.length;
  let label="Território";
  if(level==="zone") label="Zona";
  if(level==="neighborhood") label="Bairro";
  if(level==="polling_place") label="Local";
  if(level==="section") label="Seção";
  return '<table><thead><tr><th>Posição</th><th>'+label+'</th><th>Votos</th><th>% dos seus votos</th><th>Força</th></tr></thead><tbody>'+
    rows.map(x=>{
      let name="";
      if(level==="zone") name="Zona "+x.zone;
      else if(level==="neighborhood") name=x.neighborhood||"Sem bairro informado";
      else if(level==="polling_place") name=x.polling_place_name||x.polling_place_code||"Local de votação";
      else name="Seção "+x.section+(x.zone>=0?" · Zona "+x.zone:"");
      return '<tr><td class="rank">#'+x.rank+'</td><td><b>'+escHtml(name)+'</b></td><td>'+fmt(x.votes)+'</td><td>'+pct(x.pct_total)+'</td><td><span class="strength">'+strength(x.rank,total)+'</span></td></tr>';
    }).join("")+'</tbody></table>';
}

async function showLevel(level){
  currentLevel=level;
  document.querySelectorAll(".tab").forEach(t=>t.classList.toggle("active",t.dataset.level===level));
  const scope=document.getElementById("scopebar");
  const title=document.getElementById("territoryTitle");
  const content=document.getElementById("territoryContent");

  if(level==="municipality"){
    scope.style.display="none";
    title.innerHTML="<h3 style='margin:0'>Onde sua votação foi mais forte</h3><span class='muted'>Clique em um município para aprofundar</span>";
    content.innerHTML=municipalityTable(overview.municipalities||[]);
    content.querySelectorAll(".municipality-row").forEach(r=>r.addEventListener("click",async()=>{
      document.getElementById("municipalitySelect").value=r.dataset.code;
      await showLevel("zone");
    }));
    return;
  }

  scope.style.display="flex";
  const labels={zone:"Zonas eleitorais",neighborhood:"Bairros",polling_place:"Ruas e locais de votação",section:"Seções eleitorais"};
  title.innerHTML="<h3 style='margin:0'>"+labels[level]+"</h3>";
  await loadTerritory();
}

async function loadTerritory(){
  if(!currentCandidate) return;
  const code=document.getElementById("municipalitySelect").value;
  const content=document.getElementById("territoryContent");
  if(currentLevel!=="municipality"&&!code){
    content.innerHTML='<div class="empty">Selecione um município para aprofundar a votação.</div>';return;
  }
  content.innerHTML='<div class="muted">Carregando...</div>';
  const p=new URLSearchParams({candidateId:String(currentCandidate.id),level:currentLevel});
  if(code) p.set("municipality",code);
  const r=await fetch("/api/territory?"+p.toString());
  const d=await r.json();
  if(!r.ok){content.innerHTML='<div class="error">'+escHtml(d.error)+'</div>';return}
  content.innerHTML=genericTable(d.rows||[],currentLevel);
}

document.querySelectorAll(".tab").forEach(t=>t.addEventListener("click",()=>showLevel(t.dataset.level)));
document.getElementById("municipalitySelect").addEventListener("change",loadTerritory);
document.getElementById("newSearch").addEventListener("click",()=>{
  document.getElementById("dashboard").style.display="none";
  document.querySelector("input[name=q]").focus();
  window.scrollTo({top:0,behavior:"smooth"});
});
</script>`;
  return layout("Aplicativo",body,user);
}

export function adminPage(user:any,stats:any){
  return layout("Administração",'<h1>Painel administrativo</h1><div class="grid"><div class="card"><div class="muted">Usuários</div><div class="metric">'+esc(stats.users)+'</div></div><div class="card"><div class="muted">Assinaturas ativas</div><div class="metric">'+esc(stats.active)+'</div></div><div class="card"><div class="muted">Importações concluídas</div><div class="metric">'+esc(stats.imports)+'</div></div></div>',user);
}
