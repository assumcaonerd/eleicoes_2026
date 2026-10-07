const css = "*{box-sizing:border-box}body{margin:0;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f4f6f8;color:#151515}a{color:inherit}.wrap{max-width:1100px;margin:auto;padding:28px}.nav{display:flex;justify-content:space-between;align-items:center;padding:20px 0}.brand{font-weight:900;font-size:21px}.card{background:#fff;border:1px solid #e7e7e7;border-radius:20px;padding:24px;box-shadow:0 10px 35px rgba(0,0,0,.05)}.hero{padding:70px 0}.hero h1{font-size:52px;line-height:1;margin:0 0 18px;max-width:750px}.muted{color:#68717a}.btn{display:inline-block;border:0;border-radius:12px;padding:12px 18px;background:#111;color:#fff;text-decoration:none;font-weight:750;cursor:pointer}.btn.secondary{background:#fff;color:#111;border:1px solid #ddd}.row{display:flex;gap:12px;flex-wrap:wrap}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:16px}.field{display:flex;flex-direction:column;gap:6px;margin:12px 0}input,select{padding:13px;border:1px solid #d7dce0;border-radius:10px;font:inherit}.auth{max-width:460px;margin:55px auto}.error{background:#fff1f0;color:#9d1717;padding:12px;border-radius:10px;margin:12px 0}.metric{font-size:34px;font-weight:900}.tag{display:inline-flex;padding:5px 9px;border-radius:999px;background:#edf0f3;font-size:12px}.footer{padding:35px 0;color:#777;font-size:12px}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:12px;border-bottom:1px solid #eee}th{font-size:12px;text-transform:uppercase;color:#68717a}@media(max-width:700px){.hero h1{font-size:38px}.wrap{padding:18px}}";

function esc(v:unknown){return String(v??"").replace(/[&<>"']/g,function(c){return ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"} as any)[c]})}

export function layout(title:string,body:string,user?:any){
  var actions = user ? '<a class="btn secondary" href="/app">Painel</a><form method="post" action="/logout"><button class="btn secondary">Sair</button></form>' : '<a class="btn secondary" href="/login">Entrar</a><a class="btn" href="/cadastro">Assinar</a>';
  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(title)+' | Siga o Voto</title><style>'+css+'</style></head><body><div class="wrap"><div class="nav"><a href="/" class="brand" style="text-decoration:none">Siga o Voto <span class="tag">2026</span></a><div class="row">'+actions+'</div></div>'+body+'<div class="footer">Fonte original dos dados eleitorais: Tribunal Superior Eleitoral. Plataforma independente.</div></div></body></html>';
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
.searchbox{margin-bottom:22px}.candidate-list{display:grid;gap:10px;margin-top:18px}.candidate-item{width:100%;text-align:left;border:1px solid #e2e6ea;background:#fff;border-radius:14px;padding:16px;cursor:pointer}.candidate-item:hover{border-color:#111;background:#fafafa}.candidate-name{font-size:18px;font-weight:850}.candidate-meta{color:#68717a;font-size:14px;margin-top:4px}.dash{display:none}.dash-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap;margin-bottom:18px}.dash-title h2{margin:0 0 4px;font-size:28px}.metrics{display:grid;grid-template-columns:repeat(4,minmax(140px,1fr));gap:12px;margin:18px 0}.metric-card{background:#fff;border:1px solid #e5e8eb;border-radius:16px;padding:18px}.metric-card .n{font-size:28px;font-weight:900;margin-top:5px}.tabs{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0}.tab{border:1px solid #d9dde1;background:#fff;border-radius:999px;padding:10px 14px;font-weight:800;cursor:pointer}.tab.active{background:#111;color:#fff;border-color:#111}.scopebar{display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin:12px 0 18px}.scopebar .field{min-width:260px;margin:0}.territory-card{overflow:hidden}.strength{display:inline-block;border-radius:999px;padding:5px 9px;background:#edf0f3;font-size:12px;font-weight:800}.empty{padding:28px;text-align:center;border:1px dashed #ccd2d7;border-radius:14px;color:#68717a;background:#fafbfc}.topline{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.rank{font-weight:900;color:#68717a}.map-wrap{display:none;margin-top:14px}.map-filters{display:grid;grid-template-columns:repeat(5,minmax(150px,1fr));gap:10px;margin-bottom:12px}.map-filters .field{margin:0}.map-toolbar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}.map-canvas{height:620px;border:1px solid #dfe3e6;border-radius:16px;overflow:hidden}.map-note{font-size:13px;color:#68717a;margin-top:8px}.leaflet-popup-content{min-width:250px}.popup-title{font-weight:900;font-size:15px;margin-bottom:5px}.popup-meta{font-size:12px;color:#68717a;margin-bottom:8px}.popup-total{font-weight:900;margin-bottom:8px}.popup-sections{max-height:180px;overflow:auto;border-top:1px solid #eee;padding-top:6px}.popup-section{display:flex;justify-content:space-between;gap:12px;padding:4px 0;font-size:12px;border-bottom:1px solid #f1f1f1}@media(max-width:760px){.map-filters{grid-template-columns:1fr 1fr}.metrics{grid-template-columns:repeat(2,1fr)}.metric-card .n{font-size:24px}.territory-card{overflow-x:auto}table{min-width:650px}}
</style>
<h1>Siga o Voto 2026</h1>
<p class="muted">Escolha um candidato e descubra onde a votação foi forte, média ou fraca.</p>
<div class="card searchbox">
<form id="search"><div class="grid">
<label class="field">Candidato<input name="q" placeholder="Digite o nome ou número" required autocomplete="off"></label>
<label class="field">Cargo<select name="office"><option value="">Todos</option><option value="1">Presidente</option><option value="3">Governador</option><option value="5">Senador</option><option value="6">Deputado Federal</option><option value="7">Deputado Estadual/Distrital</option></select></label>
<label class="field">Estado<input name="uf" maxlength="2" placeholder="ES"></label>
</div><button class="btn">Encontrar candidato</button></form>
<div id="searchResults" class="candidate-list"></div>
</div>
<section id="dashboard" class="dash"><div class="card">
<div class="dash-head"><div class="dash-title"><div class="tag">Raio-X eleitoral</div><h2 id="candName"></h2><div class="muted" id="candMeta"></div></div><button class="btn secondary" type="button" id="newSearch">Trocar candidato</button></div>
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
<button class="tab" data-level="map">Mapa</button>
</div>
<div class="scopebar" id="scopebar" style="display:none"><label class="field">Município<select id="municipalitySelect"></select></label></div>
<div id="territoryTitle" class="topline"><h3 style="margin:0">Ranking por município</h3></div>
<div id="territoryContent" class="territory-card" style="margin-top:12px"></div>
<div id="mapWrap" class="map-wrap">
  <div class="map-filters">
    <label class="field">Município<select id="mapMunicipality"><option value="">Todos os municípios</option></select></label>
    <label class="field">Zona<select id="mapZone" disabled><option value="">Todas as zonas</option></select></label>
    <label class="field">Bairro<select id="mapNeighborhood" disabled><option value="">Todos os bairros</option></select></label>
    <label class="field">Rua / Local<select id="mapPlace" disabled><option value="">Todas as ruas / locais</option></select></label>
    <label class="field">Seção<select id="mapSection" disabled><option value="">Todas as seções</option></select></label>
  </div>
  <div class="map-toolbar">
    <button class="btn secondary" type="button" id="locateMe">Minha localização</button>
    <button class="btn secondary" type="button" id="fitBrazil">Ver Brasil</button>
    <span class="muted" id="mapCount"></span>
  </div>
  <div id="map" class="map-canvas"></div>
  <div class="map-note">Cada pino representa um local de votação onde o candidato recebeu votos. Abra o pino para ver as seções e os votos em cada urna.</div>
</div>
</div></section>
<script>
var currentCandidate=null,overview=null,currentLevel="municipality",voteMap=null,mapLayer=null,userMarker=null,mapRows=[];
function fmt(n){return new Intl.NumberFormat("pt-BR").format(Number(n||0))}
function pct(n){return Number(n||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})+"%"}
function escHtml(s){return String(s==null?"":s).replace(/[&<>"']/g,function(m){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]})}
function strength(rank,total){if(!total)return "";var p=rank/total;if(p<=.10)return "Muito forte";if(p<=.30)return "Forte";if(p<=.70)return "Médio";return "Fraco"}
function candidateButtons(rows){
 if(!rows.length)return '<div class="empty">Nenhum candidato encontrado com esses filtros.</div>';
 return rows.map(function(x){
  return '<button class="candidate-item" type="button" data-id="'+x.id+'"><div class="candidate-name">'+escHtml(x.ballot_name)+'</div><div class="candidate-meta">Nº '+escHtml(x.number)+' · '+escHtml(x.party_abbr||"")+' · '+escHtml(x.office_name)+' · '+escHtml(x.uf)+'</div></button>';
 }).join("");
}
document.getElementById("search").addEventListener("submit",async function(e){
 e.preventDefault();var f=new FormData(e.target),p=new URLSearchParams();for(var pair of f.entries())if(pair[1])p.set(pair[0],String(pair[1]));
 var box=document.getElementById("searchResults");box.innerHTML='<div class="muted">Buscando...</div>';
 var r=await fetch("/api/candidates?"+p.toString()),d=await r.json();if(!r.ok){box.innerHTML='<div class="error">'+escHtml(d.error)+'</div>';return}
 box.innerHTML=candidateButtons(d.rows||[]);box.querySelectorAll(".candidate-item").forEach(function(b){b.addEventListener("click",function(){openCandidate(Number(b.dataset.id))})});
});
async function openCandidate(id){
 var r=await fetch("/api/candidate-overview?candidateId="+id),d=await r.json();if(!r.ok){document.getElementById("searchResults").innerHTML='<div class="error">'+escHtml(d.error)+'</div>';return}
 currentCandidate=d.candidate;overview=d;
 document.getElementById("candName").textContent=d.candidate.ballot_name;
 document.getElementById("candMeta").textContent="Nº "+d.candidate.number+" · "+(d.candidate.party_abbr||"")+" · "+d.candidate.office_name+" · "+d.candidate.uf;
 document.getElementById("totalVotes").textContent=fmt(d.total_votes);
 document.getElementById("municipalitiesCount").textContent=fmt(d.municipalities_count);
 document.getElementById("bestCity").textContent=(d.strongest&&d.strongest[0]?d.strongest[0].municipality_name:"-");
 document.getElementById("bestPct").textContent=pct(d.strongest&&d.strongest[0]?d.strongest[0].pct_total:0);
 var sel=document.getElementById("municipalitySelect");sel.innerHTML='<option value="">Selecione um município</option>'+d.municipalities.map(function(x){return '<option value="'+escHtml(x.municipality_code)+'">'+escHtml(x.municipality_name)+'</option>'}).join("");
 var mapSel=document.getElementById("mapMunicipality");mapSel.innerHTML='<option value="">Todos os municípios</option>'+d.municipalities.map(function(x){return '<option value="'+escHtml(x.municipality_code)+'">'+escHtml(x.municipality_name)+'</option>'}).join("");
 document.getElementById("dashboard").style.display="block";document.getElementById("searchResults").innerHTML="";await showLevel("municipality");document.getElementById("dashboard").scrollIntoView({behavior:"smooth",block:"start"});
}
function municipalityTable(rows){
 var total=rows.length;
 return '<table><thead><tr><th>Posição</th><th>Município</th><th>Votos</th><th>% dos seus votos</th><th>Força</th></tr></thead><tbody>'+rows.map(function(x){return '<tr class="municipality-row" data-code="'+escHtml(x.municipality_code)+'" style="cursor:pointer"><td class="rank">#'+x.rank+'</td><td><b>'+escHtml(x.municipality_name)+'</b></td><td>'+fmt(x.votes)+'</td><td>'+pct(x.pct_total)+'</td><td><span class="strength">'+strength(x.rank,total)+'</span></td></tr>'}).join("")+'</tbody></table>';
}
function genericTable(rows,level){
 if(!rows.length){
  if(level==="neighborhood"||level==="polling_place"||level==="section")return '<div class="empty">Nenhum dado encontrado neste nível para o município selecionado.</div>';
  return '<div class="empty">Ainda não há dados deste nível para o município selecionado.</div>';
 }
 var total=rows.length,label="Território";if(level==="zone")label="Zona";if(level==="neighborhood")label="Bairro";if(level==="polling_place")label="Local";if(level==="section")label="Seção";
 return '<table><thead><tr><th>Posição</th><th>'+label+'</th><th>Votos</th><th>% dos seus votos</th><th>Força</th></tr></thead><tbody>'+rows.map(function(x){var name="";if(level==="zone")name="Zona "+x.zone;else if(level==="neighborhood")name=x.neighborhood||"Sem bairro informado";else if(level==="polling_place")name=(x.polling_place_name||x.polling_place_code||"Local de votação")+(x.address?" · "+x.address:"")+(x.neighborhood?" · "+x.neighborhood:"");else name="Seção "+x.section+(x.zone>=0?" · Zona "+x.zone:"")+(x.polling_place_name?" · "+x.polling_place_name:"")+(x.neighborhood?" · "+x.neighborhood:"");return '<tr><td class="rank">#'+x.rank+'</td><td><b>'+escHtml(name)+'</b></td><td>'+fmt(x.votes)+'</td><td>'+pct(x.pct_total)+'</td><td><span class="strength">'+strength(x.rank,total)+'</span></td></tr>'}).join("")+'</tbody></table>';
}
async function showLevel(level){
 currentLevel=level;document.querySelectorAll(".tab").forEach(function(t){t.classList.toggle("active",t.dataset.level===level)});
 var scope=document.getElementById("scopebar"),title=document.getElementById("territoryTitle"),content=document.getElementById("territoryContent"),mapWrap=document.getElementById("mapWrap");
 mapWrap.style.display="none";content.style.display="block";
 if(level==="map"){
  scope.style.display="none";
  title.innerHTML="<h3 style='margin:0'>Mapa da votação</h3><span class='muted'>Filtre por município, zona, bairro, rua/local ou seção</span>";
  content.style.display="none";mapWrap.style.display="block";
  var generalMunicipality=document.getElementById("municipalitySelect").value;
  if(generalMunicipality)document.getElementById("mapMunicipality").value=generalMunicipality;
  await loadMap();
  return;
 }
 if(level==="municipality"){
  scope.style.display="none";title.innerHTML="<h3 style='margin:0'>Onde sua votação foi mais forte</h3><span class='muted'>Clique em um município para aprofundar</span>";content.innerHTML=municipalityTable(overview.municipalities||[]);
  content.querySelectorAll(".municipality-row").forEach(function(r){r.addEventListener("click",async function(){document.getElementById("municipalitySelect").value=r.dataset.code;await showLevel("zone")})});return;
 }
 scope.style.display="flex";var labels={zone:"Zonas eleitorais",neighborhood:"Bairros",polling_place:"Ruas e locais de votação",section:"Seções eleitorais"};title.innerHTML="<h3 style='margin:0'>"+labels[level]+"</h3>";await loadTerritory();
}

function loadLeaflet(){
 return new Promise(function(resolve,reject){
  if(window.L){resolve(window.L);return}
  if(!document.getElementById("leaflet-css")){
    var link=document.createElement("link");link.id="leaflet-css";link.rel="stylesheet";link.href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";document.head.appendChild(link);
  }
  var existing=document.getElementById("leaflet-js");
  if(existing){existing.addEventListener("load",function(){resolve(window.L)});existing.addEventListener("error",reject);return}
  var script=document.createElement("script");script.id="leaflet-js";script.src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";script.onload=function(){resolve(window.L)};script.onerror=reject;document.head.appendChild(script);
 });
}
function popupHtml(x){
 var sections=Array.isArray(x.sections)?x.sections:[];
 var sectionHtml=sections.map(function(s){return '<div class="popup-section"><span>Zona '+escHtml(s.zone)+' · Seção '+escHtml(s.section)+'</span><b>'+fmt(s.votes)+' votos</b></div>'}).join("");
 return '<div class="popup-title">'+escHtml(x.polling_place_name||"Local de votação")+'</div>'+
  '<div class="popup-meta">'+escHtml(x.address||"")+(x.neighborhood?" · "+escHtml(x.neighborhood):"")+(x.municipality_name?" · "+escHtml(x.municipality_name):"")+'</div>'+
  '<div class="popup-total">'+fmt(x.votes)+' votos neste local</div>'+
  '<div class="popup-sections">'+sectionHtml+'</div>';
}
function uniqueSorted(values,numeric){
 var seen={},out=[];
 values.forEach(function(v){if(v===null||v===undefined||v==="")return;var k=String(v);if(!seen[k]){seen[k]=1;out.push(v)}});
 return out.sort(function(a,b){return numeric?Number(a)-Number(b):String(a).localeCompare(String(b),"pt-BR")});
}
function currentMapSelections(){
 return {
  municipality:document.getElementById("mapMunicipality").value,
  zone:document.getElementById("mapZone").value,
  neighborhood:document.getElementById("mapNeighborhood").value,
  place:document.getElementById("mapPlace").value,
  section:document.getElementById("mapSection").value
 };
}
function rowMatchesMapFilters(x,ignore){
 var f=currentMapSelections(),sections=Array.isArray(x.sections)?x.sections:[];
 if(ignore!=="neighborhood"&&f.neighborhood&&String(x.neighborhood||"")!==f.neighborhood)return false;
 if(ignore!=="place"&&f.place&&String(x.polling_place_code||"")!==f.place)return false;
 if(ignore!=="zone"&&f.zone&&!sections.some(function(s){return String(s.zone)===f.zone}))return false;
 if(ignore!=="section"&&f.section&&!sections.some(function(s){
   if(String(s.section)!==f.section)return false;
   return !f.zone||String(s.zone)===f.zone;
 }))return false;
 return true;
}
function setSelectOptions(id,label,items,valueFn,labelFn,keep){
 var el=document.getElementById(id),old=keep?el.value:"";
 el.innerHTML='<option value="">'+label+'</option>'+items.map(function(x){return '<option value="'+escHtml(valueFn(x))+'">'+escHtml(labelFn(x))+'</option>'}).join("");
 if(old&&items.some(function(x){return String(valueFn(x))===old}))el.value=old;
 el.disabled=items.length===0;
}
function rebuildMapFilters(changed){
 var zoneRows=mapRows.filter(function(x){return rowMatchesMapFilters(x,"zone")});
 var zones=uniqueSorted([].concat.apply([],zoneRows.map(function(x){return (x.sections||[]).map(function(s){return s.zone})})),true);
 setSelectOptions("mapZone","Todas as zonas",zones,function(x){return x},function(x){return "Zona "+x},changed!=="municipality");

 var neighborhoodRows=mapRows.filter(function(x){return rowMatchesMapFilters(x,"neighborhood")});
 var neighborhoods=uniqueSorted(neighborhoodRows.map(function(x){return x.neighborhood||""}),false);
 setSelectOptions("mapNeighborhood","Todos os bairros",neighborhoods,function(x){return x},function(x){return x},changed!=="municipality"&&changed!=="zone");

 var placeRows=mapRows.filter(function(x){return rowMatchesMapFilters(x,"place")});
 var places=[],seen={};
 placeRows.forEach(function(x){var k=String(x.polling_place_code||"");if(!k||seen[k])return;seen[k]=1;places.push(x)});
 places.sort(function(a,b){return String(a.address||a.polling_place_name||"").localeCompare(String(b.address||b.polling_place_name||""),"pt-BR")});
 setSelectOptions("mapPlace","Todas as ruas / locais",places,function(x){return x.polling_place_code},function(x){return (x.address||x.polling_place_name||"Local")+(x.polling_place_name&&x.address?" · "+x.polling_place_name:"")},changed!=="municipality"&&changed!=="zone"&&changed!=="neighborhood");

 var sectionRows=mapRows.filter(function(x){return rowMatchesMapFilters(x,"section")});
 var sectionPairs=[],pairSeen={};
 sectionRows.forEach(function(x){(x.sections||[]).forEach(function(s){
   var f=currentMapSelections();if(f.zone&&String(s.zone)!==f.zone)return;
   var k=String(s.zone)+"-"+String(s.section);if(pairSeen[k])return;pairSeen[k]=1;sectionPairs.push(s);
 })});
 sectionPairs.sort(function(a,b){return Number(a.zone)-Number(b.zone)||Number(a.section)-Number(b.section)});
 setSelectOptions("mapSection","Todas as seções",sectionPairs,function(x){return x.section},function(x){return "Seção "+x.section+" · Zona "+x.zone},changed!=="municipality"&&changed!=="zone"&&changed!=="neighborhood"&&changed!=="place");
}
function renderMapRows(){
 if(!voteMap||!mapLayer)return;
 mapLayer.clearLayers();
 var L=window.L,f=currentMapSelections(),bounds=[],shown=0;
 mapRows.forEach(function(x){
  if(!rowMatchesMapFilters(x,""))return;
  var lat=Number(x.latitude),lng=Number(x.longitude);if(!Number.isFinite(lat)||!Number.isFinite(lng))return;
  var filteredSections=(x.sections||[]).filter(function(s){
    if(f.zone&&String(s.zone)!==f.zone)return false;
    if(f.section&&String(s.section)!==f.section)return false;
    return true;
  });
  if((f.zone||f.section)&&!filteredSections.length)return;
  var copy=Object.assign({},x,{sections:filteredSections.length?filteredSections:x.sections});
  if(f.zone||f.section)copy.votes=filteredSections.reduce(function(sum,s){return sum+Number(s.votes||0)},0);
  var radius=Math.max(6,Math.min(18,5+Math.sqrt(Number(copy.votes||0))));
  var marker=L.circleMarker([lat,lng],{radius:radius,weight:1,fillOpacity:.72});
  marker.bindPopup(popupHtml(copy),{maxWidth:360});marker.addTo(mapLayer);bounds.push([lat,lng]);shown++;
 });
 document.getElementById("mapCount").textContent=fmt(shown)+" locais com votos";
 if(bounds.length){
  if(f.municipality||f.zone||f.neighborhood||f.place||f.section)voteMap.fitBounds(bounds,{padding:[25,25],maxZoom:15});
 } else if(f.municipality)document.getElementById("mapCount").textContent="Nenhum local encontrado com esses filtros";
}
async function loadMap(){
 if(!currentCandidate)return;
 var L;
 try{L=await loadLeaflet()}catch(e){document.getElementById("map").innerHTML='<div class="error">Não foi possível carregar o mapa.</div>';return}
 if(!voteMap){
  voteMap=L.map("map",{preferCanvas:true}).setView([-14.235,-51.9253],4);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"&copy; OpenStreetMap"}).addTo(voteMap);
 } else {setTimeout(function(){voteMap.invalidateSize()},50)}
 if(!mapLayer)mapLayer=L.layerGroup().addTo(voteMap);
 var code=document.getElementById("mapMunicipality").value;
 var p=new URLSearchParams({candidateId:String(currentCandidate.id),limit:"10000"});if(code)p.set("municipality",code);
 document.getElementById("mapCount").textContent="Carregando pinos...";
 var r=await fetch("/api/map?"+p.toString()),d=await r.json();
 if(!r.ok){document.getElementById("mapCount").textContent=d.error||"Falha ao carregar mapa";return}
 mapRows=d.rows||[];
 ["mapZone","mapNeighborhood","mapPlace","mapSection"].forEach(function(id){var el=document.getElementById(id);el.value="";});
 rebuildMapFilters("municipality");renderMapRows();
 if(!code)voteMap.setView([-14.235,-51.9253],4);
 setTimeout(function(){voteMap.invalidateSize()},100);
}
function applyMapFilter(changed){
 rebuildMapFilters(changed);renderMapRows();
}
document.querySelectorAll(".tab").forEach(function(t){t.addEventListener("click",function(){showLevel(t.dataset.level)})});
document.getElementById("municipalitySelect").addEventListener("change",loadTerritory);
document.getElementById("mapMunicipality").addEventListener("change",loadMap);
document.getElementById("mapZone").addEventListener("change",function(){applyMapFilter("zone")});
document.getElementById("mapNeighborhood").addEventListener("change",function(){applyMapFilter("neighborhood")});
document.getElementById("mapPlace").addEventListener("change",function(){applyMapFilter("place")});
document.getElementById("mapSection").addEventListener("change",function(){applyMapFilter("section")});
document.getElementById("fitBrazil").addEventListener("click",function(){if(voteMap)voteMap.setView([-14.235,-51.9253],4)});
document.getElementById("locateMe").addEventListener("click",function(){
 if(!navigator.geolocation){alert("Geolocalização não disponível neste navegador.");return}
 navigator.geolocation.getCurrentPosition(async function(pos){
  var L=await loadLeaflet();if(!voteMap)await loadMap();
  if(userMarker)voteMap.removeLayer(userMarker);
  userMarker=L.marker([pos.coords.latitude,pos.coords.longitude]).addTo(voteMap).bindPopup("Sua localização");
  voteMap.setView([pos.coords.latitude,pos.coords.longitude],12);userMarker.openPopup();
 },function(){alert("Não foi possível acessar sua localização. Verifique a permissão do navegador.")},{enableHighAccuracy:true,timeout:10000});
});
document.getElementById("newSearch").addEventListener("click",function(){document.getElementById("dashboard").style.display="none";document.querySelector("input[name=q]").focus();window.scrollTo({top:0,behavior:"smooth"})});
</script>`;
  return layout("Aplicativo",body,user);
}

export function adminPage(user:any,stats:any){
  return layout("Administração",'<h1>Painel administrativo</h1><div class="grid"><div class="card"><div class="muted">Usuários</div><div class="metric">'+esc(stats.users)+'</div></div><div class="card"><div class="muted">Assinaturas ativas</div><div class="metric">'+esc(stats.active)+'</div></div><div class="card"><div class="muted">Importações concluídas</div><div class="metric">'+esc(stats.imports)+'</div></div></div>',user);
}


export function resetPasswordPage(token:string,error="",done=false){
  if(done) return layout("Senha redefinida",'<div class="auth card"><h1>Senha redefinida</h1><p class="muted">Sua senha foi atualizada com sucesso.</p><a class="btn" href="/login">Entrar</a></div>');
  var err=error?'<div class="error">'+esc(error)+'</div>':'';
  return layout("Redefinir senha",'<div class="auth card"><h1>Redefinir senha</h1>'+err+'<form method="post" action="/redefinir-senha"><input type="hidden" name="token" value="'+esc(token)+'"><label class="field">Nova senha<input type="password" name="password" required minlength="12" autocomplete="new-password"></label><label class="field">Confirmar nova senha<input type="password" name="confirm" required minlength="12" autocomplete="new-password"></label><button class="btn" style="width:100%">Salvar nova senha</button></form></div>');
}
