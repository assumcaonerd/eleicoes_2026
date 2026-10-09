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
.searchbox{margin-bottom:22px}.candidate-list{display:grid;gap:10px;margin-top:18px}.candidate-item{width:100%;text-align:left;border:1px solid #e2e6ea;background:#fff;border-radius:14px;padding:16px;cursor:pointer}.candidate-item:hover{border-color:#111;background:#fafafa}.candidate-name{font-size:18px;font-weight:850}.candidate-meta{color:#68717a;font-size:14px;margin-top:4px}.dash{display:none}.dash-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap;margin-bottom:18px}.dash-title h2{margin:0 0 4px;font-size:28px}.vote-comparison{position:sticky;top:8px;z-index:950;background:#fff;border:1px solid #dbe2e8;border-radius:16px;padding:13px 16px;box-shadow:0 5px 18px rgba(0,0,0,.06);margin-bottom:14px}.comparison-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap}.comparison-head strong{font-size:15px}.comparison-head span{font-size:12px;color:#68717a}.comparison-rows{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:9px}.comparison-item{border:1px solid #e7ebef;border-radius:10px;padding:9px;background:#f9fafb;min-width:0}.comparison-item b{font-size:12px;display:block;overflow-wrap:anywhere}.comparison-item small{color:#68717a}.comparison-selected{margin-top:9px;border-top:1px solid #e7ebef;padding-top:9px;font-size:13px;font-weight:750}.comparison-current{border-color:#151515;background:#f0f2f4}.custom-compare{display:none;padding:12px 0}.compare-pickers{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}.compare-picker{border:1px solid #e3e7eb;border-radius:12px;padding:12px}.compare-search-results{max-height:190px;overflow:auto;background:white}.compare-choice{display:block;width:100%;background:white;border:0;border-bottom:1px solid #eee;padding:10px;text-align:left;cursor:pointer}.compare-choice:hover{background:#f3f5f7}.compare-remove{padding:6px 9px;font-size:12px;border:1px solid #dadfe4;border-radius:7px;background:white;cursor:pointer}.compare-bars{display:grid;gap:12px;margin-top:16px}.compare-track{height:15px;border-radius:999px;overflow:hidden;background:#e8ebef}.compare-bar{height:100%;background:#355d86;border-radius:999px}.compare-row-top{display:flex;justify-content:space-between;gap:12px;align-items:baseline;font-size:14px}.compare-tools{display:flex;gap:8px;flex-wrap:wrap;align-items:end;margin-top:18px}.compare-table-wrap{overflow:auto;max-height:520px;margin-top:14px}.compare-data-table{min-width:650px}.compare-data-table td,.compare-data-table th{padding:9px;font-size:12px}.compare-map{height:380px;border:1px solid #dfe3e6;border-radius:12px;margin-top:12px;display:none}.compare-help{font-size:12px;color:#68717a;margin-top:7px}@media print{.nav,.footer,.searchbox,.tabs,.map-wrap,.compare-tools,.compare-pickers,.scopebar,.map-note,.dash-head button{display:none!important}.wrap{max-width:none;padding:0}.card{border:0;box-shadow:none;padding:0}.custom-compare{display:block!important}.compare-table-wrap{max-height:none;overflow:visible}.vote-comparison{position:static}}@media(max-width:650px){.comparison-rows{grid-template-columns:1fr}.vote-comparison{position:relative;top:auto}}.metrics{display:grid;grid-template-columns:repeat(4,minmax(140px,1fr));gap:12px;margin:18px 0}.metric-card{background:#fff;border:1px solid #e5e8eb;border-radius:16px;padding:18px}.metric-card .n{font-size:28px;font-weight:900;margin-top:5px}.tabs{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0}.tab{border:1px solid #d9dde1;background:#fff;border-radius:999px;padding:10px 14px;font-weight:800;cursor:pointer}.tab.active{background:#111;color:#fff;border-color:#111}.scopebar{display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin:12px 0 18px}.scopebar .field{min-width:260px;margin:0}.territory-card{overflow:hidden}.strength{display:inline-block;border-radius:999px;padding:5px 9px;background:#edf0f3;font-size:12px;font-weight:800}.empty{padding:28px;text-align:center;border:1px dashed #ccd2d7;border-radius:14px;color:#68717a;background:#fafbfc}.topline{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.rank{font-weight:900;color:#68717a}.map-wrap{display:none;margin-top:14px}.map-filters{display:grid;grid-template-columns:repeat(6,minmax(130px,1fr));gap:10px;margin-bottom:12px}.map-filters .field{margin:0}.map-toolbar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;align-items:center}.map-style-switch{display:inline-flex;gap:3px;margin-left:auto;padding:3px;border:1px solid #d9dde1;border-radius:12px;background:#f4f6f8}.map-style-button{border:0;background:transparent;padding:8px 13px;border-radius:9px;font:inherit;font-size:13px;font-weight:800;cursor:pointer;color:#39434d}.map-style-button.active{background:#111;color:#fff}.map-style-button:focus-visible{outline:3px solid #3478f6;outline-offset:2px}.map-imagery-status{display:none;width:100%;font-size:13px;color:#875d11;background:#fff6df;border:1px solid #f1d898;border-radius:9px;padding:8px 12px}.map-imagery-status.visible{display:block}.map-canvas{height:620px;border:1px solid #dfe3e6;border-radius:16px;overflow:hidden}.map-note{font-size:13px;color:#68717a;margin-top:8px}.vote-pin-marker{background:transparent!important;border:0!important}.vote-pin{width:100%;height:100%;transform-origin:50% 96%;animation:pinDrop .34s cubic-bezier(.2,.75,.25,1.2);filter:drop-shadow(0 5px 4px rgba(0,0,0,.24));transition:transform .15s ease,filter .15s ease}.vote-pin svg{display:block;width:100%;height:100%}.vote-pin:hover{transform:translateY(-2px) scale(1.06);filter:drop-shadow(0 7px 5px rgba(0,0,0,.28))}.vote-pin.selected{transform:translateY(-4px) scale(1.16);filter:drop-shadow(0 9px 7px rgba(0,0,0,.32))}@keyframes pinDrop{0%{opacity:0;transform:translateY(-26px) scale(.78)}70%{opacity:1;transform:translateY(3px) scale(1.04)}100%{opacity:1;transform:translateY(0) scale(1)}}.leaflet-popup-content{min-width:250px}.popup-title{font-weight:900;font-size:15px;margin-bottom:5px}.popup-meta{font-size:12px;color:#68717a;margin-bottom:8px}.popup-total{font-weight:900;margin-bottom:8px}.popup-sections{max-height:180px;overflow:auto;border-top:1px solid #eee;padding-top:6px}.popup-section{display:flex;justify-content:space-between;gap:12px;padding:4px 0;font-size:12px;border-bottom:1px solid #f1f1f1}@media(max-width:760px){.map-filters{grid-template-columns:1fr 1fr}.metrics{grid-template-columns:repeat(2,1fr)}.metric-card .n{font-size:24px}.territory-card{overflow-x:auto}table{min-width:650px}}
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
<div class="vote-comparison" id="voteComparison" aria-live="polite"><span class="muted">Carregando comparação de votos...</span></div>
<div class="metrics">
<div class="metric-card"><div class="muted">Votos totais</div><div class="n" id="totalVotes">0</div></div>
<div class="metric-card"><div class="muted">Municípios com votos</div><div class="n" id="municipalitiesCount">0</div></div>
<div class="metric-card"><div class="muted">Melhor município</div><div class="n" style="font-size:19px" id="bestCity">-</div></div>
<div class="metric-card"><div class="muted">% no melhor município</div><div class="n" id="bestPct">0%</div></div>
</div>
<div class="tabs" id="tabs">
<button class="tab active" data-level="municipality">Municípios</button>
<button class="tab" data-level="neighborhood">Bairros</button>
<button class="tab" data-level="polling_place">Rua / Local</button>
<button class="tab" data-level="zone">Zonas</button>
<button class="tab" data-level="section">Seções</button>
<button class="tab" data-level="map">Mapa</button><button class="tab" data-level="compare">Comparar candidatos</button>
</div>
<div class="scopebar" id="scopebar" style="display:none"><label class="field">Município<select id="municipalitySelect"></select></label></div>
<div id="territoryTitle" class="topline"><h3 style="margin:0">Ranking por município</h3></div>
<div id="territoryContent" class="territory-card" style="margin-top:12px"></div>
<div id="customCompare" class="custom-compare">
 <p class="muted">Escolha até dois outros candidatos do mesmo cargo e estado. O recorte acompanha o território selecionado nas outras abas.</p>
 <div class="scopebar"><label class="field">Município<select id="compareMunicipality"><option value="">Estado inteiro</option></select></label></div>
 <div class="compare-pickers">
  <div class="compare-picker"><strong>Candidato consultado</strong><p id="compareMainName"></p></div>
  <div class="compare-picker"><label class="field">Comparar com<input id="compareSearch1" placeholder="Nome ou número" autocomplete="off"></label><div id="compareChosen1"></div><div class="compare-search-results" id="compareResults1"></div></div>
  <div class="compare-picker"><label class="field">Terceiro candidato (opcional)<input id="compareSearch2" placeholder="Nome ou número" autocomplete="off"></label><div id="compareChosen2"></div><div class="compare-search-results" id="compareResults2"></div></div>
 </div>
 <div id="compareTerritory" class="muted" style="margin-top:14px"></div>
 <div id="compareChart" class="compare-bars" aria-live="polite"></div>
 <div class="compare-tools">
  <label class="field">Detalhamento
   <select id="compareLevel"><option value="municipality">Municípios</option><option value="neighborhood">Bairros</option><option value="zone">Zonas</option><option value="polling_place">Locais de votação / mapa</option><option value="section">Seções</option></select>
  </label>
  <button class="btn secondary" type="button" id="compareExportCsv">Exportar CSV completo</button>
  <button class="btn secondary" type="button" id="compareExportPdf">Salvar PDF</button>
 </div>
 <div class="compare-help" id="compareHelp">Diferença de votos: candidato consultado menos o candidato escolhido para comparar.</div>
 <div id="compareGeoMap" class="compare-map"></div>
 <div id="compareBreakdown" class="compare-table-wrap"></div>
 <p class="map-note">Dados eleitorais do mesmo cargo, eleição, turno e território. Ausência de registro não é equivalente a zero votos.</p>
</div>
<div id="mapWrap" class="map-wrap">
  <div class="map-filters">
    <label class="field">Estado<select id="mapState" disabled><option value="">Estado</option></select></label>
    <label class="field">Município<select id="mapMunicipality"><option value="">Todos os municípios</option></select></label>
    <label class="field">Zona<select id="mapZone" disabled><option value="">Todas as zonas</option></select></label>
    <label class="field">Bairro<select id="mapNeighborhood" disabled><option value="">Todos os bairros</option></select></label>
    <label class="field">Rua / Local<select id="mapPlace" disabled><option value="">Todas as ruas / locais</option></select></label>
    <label class="field">Seção<select id="mapSection" disabled><option value="">Todas as seções</option></select></label>
  </div>
  <div class="map-toolbar">
    <strong id="mapScope">Estado inteiro</strong>
    <span class="muted" id="mapCount"></span>
    <div class="map-style-switch" role="group" aria-label="Tipo de mapa">
      <button class="map-style-button active" type="button" data-map-style="standard" aria-pressed="true">Padrão</button>
      <button class="map-style-button" type="button" data-map-style="satellite" aria-pressed="false">Satélite</button>
    </div>
    <div class="map-imagery-status" id="mapImageryStatus" role="status" aria-live="polite"></div>
  </div>
  <div id="map" class="map-canvas"></div>
  <div class="map-note">Em visões amplas, o mapa usa marcadores leves. Ao entrar em zona, bairro, rua/local ou seção, os locais aparecem como pinos desenhados com a ponta exatamente sobre a coordenada eleitoral.</div>
</div>
</div></section>
<script>
var currentCandidate=null,overview=null,currentLevel="municipality",voteMap=null,mapLayer=null,mapRows=[],baseMapLayers=null,currentMapStyle="standard",satelliteFallbackUsed=false,satelliteErrors=0;
var territoryScope={municipality:"",neighborhood:"",place:"",zone:"",section:""};
var comparisonRequest=0,customCompareRequest=0,compareChoices=[null,null],compareSearchRequest=[0,0],compareBreakdownData=null,compareBreakdownRequest=0,compareMap=null,compareMapLayer=null;
function fmt(n){return new Intl.NumberFormat("pt-BR").format(Number(n||0))}
function pct(n){return Number(n||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})+"%"}
function escHtml(s){return String(s==null?"":s).replace(/[&<>"']/g,function(m){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]})}
function strength(rank,total){if(!total)return "";var p=rank/total;if(p<=.10)return "Muito forte";if(p<=.30)return "Forte";if(p<=.70)return "Médio";return "Fraco"}
function comparisonScope(){
 var f=currentLevel==="map"?currentMapSelections():territoryScope;
 var p=new URLSearchParams({candidateId:String(currentCandidate.id)});
 var municipality=f.municipality||"";
 if(!municipality)return p;
 p.set("municipality",municipality);
 if(f.neighborhood)p.set("neighborhood",f.neighborhood);
 if(f.place)p.set("polling_place",f.place);
 if(f.zone!==""&&f.zone!=null)p.set("zone",f.zone);
 if(f.section!==""&&f.section!=null&&f.zone!==""&&f.zone!=null)p.set("section",f.section);
 return p;
}
async function refreshComparison(){
 if(!currentCandidate)return;
 var box=document.getElementById("voteComparison"),request=++comparisonRequest;
 box.innerHTML='<span class="muted">Consultando votos do mesmo cargo e turno...</span>';
 try{
  var r=await fetch("/api/vote-comparison?"+comparisonScope().toString()),d=await r.json();
  if(request!==comparisonRequest)return;
  if(!r.ok)throw new Error(d.error||"Falha ao consultar votos");
  var scope=d.scope||{},place=currentLevel==="map"?document.getElementById("mapScope").textContent:"";
  var location=place||(scope.section!=null?"Seção "+scope.section+" · Zona "+scope.zone:scope.polling_place_code?"Local de votação":scope.neighborhood?"Bairro "+scope.neighborhood:scope.zone!=null?"Zona "+scope.zone:scope.municipality?"Município selecionado":"Estado "+scope.uf);
  var top=d.top_three||[];
  var items=top.map(function(x){return '<div class="comparison-item '+(d.selected&&String(x.number)===String(d.selected.number)?"comparison-current":"")+'"><b>'+x.position+'º · '+escHtml(x.ballot_name)+'</b><small>Nº '+escHtml(x.number)+' · '+escHtml(x.party_abbr||"")+'</small><div><strong>'+fmt(x.votes)+' votos</strong></div></div>'}).join("");
  var chosen=d.selected?d.selected.position+"º lugar · "+fmt(d.selected.votes)+" votos":"Posição indisponível neste recorte";
  box.innerHTML='<div class="comparison-head"><strong>Três maiores votações</strong><span>'+escHtml(location)+' · mesmo cargo e turno</span></div>'+
   (items?'<div class="comparison-rows">'+items+'</div>':'<div class="muted">Sem dados de votação disponíveis para esta área.</div>')+
   '<div class="comparison-selected">Candidato consultado: '+escHtml(currentCandidate.ballot_name)+' · '+escHtml(chosen)+'</div>';
 }catch(e){if(request===comparisonRequest)box.innerHTML='<div class="muted">Comparação indisponível: '+escHtml(e.message||"Tente novamente")+'</div>'}
}

function compareScopeParams(id){
 var p=comparisonScope();
 p.set("candidateId",String(id));
 return p;
}
function updateCompareLabels(){
 if(!currentCandidate)return;
 document.getElementById("compareMainName").textContent=currentCandidate.ballot_name+" · "+currentCandidate.number+" · "+(currentCandidate.party_abbr||"");
 for(var i=0;i<2;i++){
  var chosen=compareChoices[i],el=document.getElementById("compareChosen"+(i+1));
  el.innerHTML=chosen?'<div class="topline"><b>'+escHtml(chosen.ballot_name)+' · '+escHtml(chosen.number)+'</b><button class="compare-remove" type="button">Remover</button></div>':"";
  if(chosen){(function(ix){el.querySelector("button").addEventListener("click",function(){
   compareChoices[ix]=null;document.getElementById("compareSearch"+(ix+1)).value="";
   updateCompareLabels();renderCustomComparison();
  })})(i)}
 }
}
async function lookupCompareCandidates(index){
 var input=document.getElementById("compareSearch"+(index+1)),box=document.getElementById("compareResults"+(index+1)),query=input.value.trim(),request=++compareSearchRequest[index];
 if(!currentCandidate||query.length<2){box.innerHTML="";return}
 box.innerHTML='<span class="muted">Buscando...</span>';
 try{
  var params=new URLSearchParams({q:query,office:String(currentCandidate.office_code),uf:String(currentCandidate.uf)});
  var response=await fetch("/api/candidates?"+params.toString()),data=await response.json();
  if(request!==compareSearchRequest[index])return;
  if(!response.ok)throw new Error(data.error||"Busca indisponível");
  var rows=(data.rows||[]).filter(function(row){
   return Number(row.id)!==Number(currentCandidate.id)&&
    Number(row.election_id)===Number(currentCandidate.election_id)&&
    Number(row.round)===Number(currentCandidate.round)&&
    !compareChoices.some(function(x){return x&&Number(x.id)===Number(row.id)});
  }).slice(0,12);
  box.innerHTML=rows.length?rows.map(function(row,i){return '<button type="button" class="compare-choice" data-index="'+i+'">'+escHtml(row.ballot_name)+' · '+escHtml(row.number)+' · '+escHtml(row.party_abbr||"")+'</button>'}).join(""):'<span class="muted">Nenhum candidato correspondente.</span>';
  box.querySelectorAll("button").forEach(function(button){button.addEventListener("click",function(){
   compareChoices[index]=rows[Number(button.dataset.index)];input.value="";
   box.innerHTML="";updateCompareLabels();renderCustomComparison();
  })});
 }catch(e){if(request===compareSearchRequest[index])box.textContent=e.message||"Falha na busca"}
}
async function renderCustomComparison(){
 if(currentLevel!=="compare"||!currentCandidate)return;
 var chart=document.getElementById("compareChart"),request=++customCompareRequest;
 var choices=[currentCandidate].concat(compareChoices.filter(Boolean));
 document.getElementById("compareTerritory").textContent="Recorte: "+(territoryScope.section?"Seção "+territoryScope.section+" · ":"")+(territoryScope.zone?"Zona "+territoryScope.zone+" · ":"")+(territoryScope.neighborhood?"Bairro "+territoryScope.neighborhood+" · ":"")+(territoryScope.municipality?document.getElementById("compareMunicipality").selectedOptions[0]?.text||territoryScope.municipality:"Estado "+currentCandidate.uf);
 if(choices.length<2){chart.innerHTML='<div class="empty">Busque um candidato para iniciar a comparação.</div>';return}
 chart.innerHTML='<div class="muted">Calculando votos...</div>';
 try{
  var results=await Promise.all(choices.map(async function(candidate){
    var response=await fetch("/api/vote-comparison?"+compareScopeParams(candidate.id).toString());
    var data=await response.json();
    if(!response.ok)throw new Error(data.error||"Consulta indisponível");
    if(Number(data.scope.election_id)!==Number(currentCandidate.election_id)||Number(data.scope.round)!==Number(currentCandidate.round)||Number(data.scope.office_code)!==Number(currentCandidate.office_code)||String(data.scope.uf)!==String(currentCandidate.uf))throw new Error("Candidatos de eleições ou turnos diferentes.");
    return {candidate:candidate,selected:data.selected};
  }));
  if(request!==customCompareRequest)return;
  var max=Math.max(1,...results.map(function(x){return Number(x.selected?.votes||0)}));
  chart.innerHTML=results.map(function(x){
    var votes=x.selected?Number(x.selected.votes):null;
    return '<div><div class="compare-row-top"><strong>'+escHtml(x.candidate.ballot_name)+' · '+escHtml(x.candidate.number)+'</strong><b>'+(votes===null?"Sem dados":fmt(votes)+" votos")+'</b></div><div class="compare-track"><div class="compare-bar" style="width:'+(votes===null?0:100*votes/max)+'%"></div></div><div class="muted" style="font-size:12px">'+(x.selected?"Posição no recorte: "+x.selected.position+"º"+(x.selected.party_position?" · No partido: "+x.selected.party_position+"º":""):"Posição não disponível")+'</div></div>';
  }).join("");
  var denominator=results.reduce(function(sum,x){return sum+Number(x.selected?.votes||0)},0);
  if(denominator>0){
    chart.innerHTML+= '<p class="compare-help">Participação entre os candidatos comparados: '+results.map(function(x){return escHtml(x.candidate.ballot_name)+': '+pct(100*Number(x.selected?.votes||0)/denominator)}).join(' · ')+' (não corresponde ao percentual oficial de votos válidos).</p>';
  }
  await loadComparisonBreakdown();
 }catch(e){if(request===customCompareRequest)chart.innerHTML='<div class="error">'+escHtml(e.message||"Falha ao comparar")+'</div>'}
}

function comparisonTerritoryName(row,level){
 if(level==="municipality")return row.municipality_name||row.municipality_code;
 if(level==="zone")return "Zona "+row.zone+" · "+(row.municipality_name||"");
 if(level==="neighborhood")return row.neighborhood||"Bairro não informado";
 if(level==="section")return "Seção "+row.section+" · Zona "+row.zone;
 return row.polling_place_name||row.address||("Local "+row.polling_place_code);
}
function comparisonCSV(){
 if(!compareBreakdownData||!compareBreakdownData.rows.length)return "";
 var data=compareBreakdownData;
 var header=["Território",...data.candidates.map(function(x){return x.ballot_name+" ("+x.number+") votos"}),"Diferença de votos (1º menos 2º)"];
 var records=data.rows.map(function(row){
  return [comparisonTerritoryName(row,data.level),...data.candidates.map(function(c){
   var result=row.candidates.find(function(x){return String(x.number)===String(c.number)});
   return result&&result.votes!=null?String(result.votes):"Sem dados";
  }),row.comparison_difference==null?"":String(row.comparison_difference)];
 });
 var esc=function(x){return '"'+String(x??"").replace(/"/g,'""')+'"';};
 return "\\uFEFF"+[header,...records].map(function(row){return row.map(esc).join(";")}).join("\\r\\n");
}
async function drawCompareMap(data){
 var el=document.getElementById("compareGeoMap");
 if(compareMap){compareMap.remove();compareMap=null;compareMapLayer=null}
 el.style.display="none";
 if(data.level!=="polling_place"||!data.rows.some(function(r){return Number.isFinite(Number(r.latitude))&&Number.isFinite(Number(r.longitude))&&r.latitude!=null&&r.longitude!=null}))return;
 try{
  var L=await loadLeaflet();
  if(currentLevel!=="compare")return;
  el.style.display="block";
  compareMap=L.map(el,{preferCanvas:true}).setView([-20.3,-40.3],11);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"&copy; OpenStreetMap contributors"}).addTo(compareMap);
  compareMapLayer=L.layerGroup().addTo(compareMap);
  var bounds=[];
  data.rows.forEach(function(row){
   var lat=Number(row.latitude),lng=Number(row.longitude);
   if(row.latitude==null||row.longitude==null||!Number.isFinite(lat)||!Number.isFinite(lng))return;
   var total=Number(row.total_reported||0);
   var marker=L.circleMarker([lat,lng],{radius:Math.max(5,Math.min(17,5+Math.sqrt(total)/3)),fillOpacity:.65,weight:1});
   var candidateLines=row.candidates.map(function(c){return escHtml(c.name)+": "+(c.votes==null?"Sem dados":fmt(c.votes)+" votos")}).join("<br>");
   marker.bindPopup("<strong>"+escHtml(comparisonTerritoryName(row,data.level))+"</strong><div>"+candidateLines+"</div>");
   marker.addTo(compareMapLayer);bounds.push([lat,lng]);
  });
  if(bounds.length)compareMap.fitBounds(bounds,{padding:[25,25],maxZoom:15});
  setTimeout(function(){if(compareMap)compareMap.invalidateSize()},80);
 }catch(e){el.style.display="none";document.getElementById("compareHelp").textContent="Mapa geográfico indisponível; a tabela comparativa continua disponível."}
}
async function loadComparisonBreakdown(){
 var box=document.getElementById("compareBreakdown"),help=document.getElementById("compareHelp");
 var request=++compareBreakdownRequest;
 var candidates=[currentCandidate].concat(compareChoices.filter(Boolean));
 if(candidates.length<2){box.innerHTML="";compareBreakdownData=null;return}
 var level=document.getElementById("compareLevel").value,municipality=territoryScope.municipality||"";
 if(level!=="municipality"&&!municipality){
  box.innerHTML='<div class="empty">Selecione um município para consultar zonas e locais de votação.</div>';
  compareBreakdownData=null;
  document.getElementById("compareGeoMap").style.display="none";
  return;
 }
 box.innerHTML='<div class="muted">Consultando resultados por território...</div>';
 try{
  var p=new URLSearchParams({ids:candidates.map(function(x){return x.id}).join(","),level:level});
  if(municipality)p.set("municipality",municipality);
  var response=await fetch("/api/comparison-territories?"+p.toString()),data=await response.json();
  if(!response.ok)throw new Error(data.error||"Consulta indisponível.");
  if(request!==compareBreakdownRequest||currentLevel!=="compare")return;
  compareBreakdownData=data;
  var cols='<th>Território</th>'+data.candidates.map(function(c){return '<th>'+escHtml(c.ballot_name)+'</th>'}).join("")+'<th>Diferença (1º − 2º)</th>';
  var body=data.rows.map(function(row){
   var cells=data.candidates.map(function(c){
    var found=row.candidates.find(function(x){return String(x.number)===String(c.number)});
    return '<td>'+(found&&found.votes!==null?fmt(found.votes):"Sem dados")+'</td>';
   }).join("");
   var difference=row.comparison_difference==null?"Indisponível":(row.comparison_difference>0?"+":"")+fmt(row.comparison_difference);
   return '<tr><td>'+escHtml(comparisonTerritoryName(row,data.level))+'</td>'+cells+'<td>'+difference+'</td></tr>';
  }).join("");
  box.innerHTML=data.rows.length?'<table class="compare-data-table"><thead><tr>'+cols+'</tr></thead><tbody>'+body+'</tbody></table>':'<div class="empty">Não há dados territoriais para este filtro.</div>';
  help.textContent="Diferença em votos: candidato consultado menos o primeiro candidato adicional. "+data.total_territories+" territórios com registros."+(data.truncated?" A tela mostra os primeiros 300; o botão Exportar CSV completo inclui todos os "+data.total_territories+" territórios.":"");
  await drawCompareMap(data);
 }catch(e){if(request===compareBreakdownRequest){compareBreakdownData=null;box.innerHTML='<div class="error">'+escHtml(e.message||"Falha na consulta")+'</div>'}}
}
function candidateButtons(rows){
 if(!rows.length)return '<div class="empty">Nenhum candidato encontrado com esses filtros.</div>';
 return rows.map(function(x){
  return '<button class="candidate-item" type="button" data-id="'+x.id+'"><div class="candidate-name">'+escHtml(x.ballot_name)+'</div><div class="candidate-meta">Nº '+escHtml(x.number)+' · '+escHtml(x.party_abbr||"")+' · '+escHtml(x.office_name)+' · '+escHtml(x.uf)+'</div></button>';
 }).join("");
}
document.getElementById("search").addEventListener("submit",async function(e){
 e.preventDefault();
 var box=document.getElementById("searchResults"),button=e.target.querySelector("button[type=submit],button:not([type])");
 box.innerHTML='<div class="muted" role="status">Buscando candidatos...</div>';
 if(button)button.disabled=true;
 try{
  var f=new FormData(e.target),p=new URLSearchParams();
  for(var pair of f.entries())if(pair[1])p.set(pair[0],String(pair[1]));
  if(!p.get("q")||!p.get("q").trim())throw new Error("Informe o nome ou número do candidato.");
  var response=await fetch("/api/candidates?"+p.toString(),{cache:"no-store"});
  if(!response.ok){
   var errorResult=await response.json().catch(function(){return {}});
   throw new Error(errorResult.error||"A consulta não respondeu corretamente (HTTP "+response.status+").");
  }
  var data=await response.json();
  box.innerHTML=candidateButtons(Array.isArray(data.rows)?data.rows:[]);
  box.querySelectorAll(".candidate-item").forEach(function(b){
   b.addEventListener("click",function(){openCandidate(Number(b.dataset.id))})
  });
 }catch(error){
  box.innerHTML='<div class="error" role="alert">Não foi possível concluir a busca: '+escHtml(error.message||"Tente novamente.")+'</div>';
 }finally{
  if(button)button.disabled=false;
 }
});
async function openCandidate(id){
 var r=await fetch("/api/candidate-overview?candidateId="+id),d=await r.json();if(!r.ok){document.getElementById("searchResults").innerHTML='<div class="error">'+escHtml(d.error)+'</div>';return}
 currentCandidate=d.candidate;overview=d;territoryScope={municipality:"",neighborhood:"",place:"",zone:"",section:""};
 document.getElementById("candName").textContent=d.candidate.ballot_name;
 document.getElementById("candMeta").textContent="Nº "+d.candidate.number+" · "+(d.candidate.party_abbr||"")+" · "+d.candidate.office_name+" · "+d.candidate.uf;
 document.getElementById("totalVotes").textContent=fmt(d.total_votes);
 document.getElementById("municipalitiesCount").textContent=fmt(d.municipalities_count);
 document.getElementById("bestCity").textContent=(d.strongest&&d.strongest[0]?d.strongest[0].municipality_name:"-");
 document.getElementById("bestPct").textContent=pct(d.strongest&&d.strongest[0]?d.strongest[0].pct_total:0);
 var sel=document.getElementById("municipalitySelect");sel.innerHTML='<option value="">Selecione um município</option>'+d.municipalities.map(function(x){return '<option value="'+escHtml(x.municipality_code)+'">'+escHtml(x.municipality_name)+'</option>'}).join("");
 var stateSel=document.getElementById("mapState");stateSel.innerHTML='<option value="'+escHtml(d.candidate.uf)+'">'+escHtml(d.candidate.uf)+'</option>';stateSel.value=d.candidate.uf;
 var compSel=document.getElementById("compareMunicipality");compSel.innerHTML='<option value="">Estado inteiro</option>'+d.municipalities.map(function(x){return '<option value="'+escHtml(x.municipality_code)+'">'+escHtml(x.municipality_name)+'</option>'}).join("");
 compareChoices=[null,null];updateCompareLabels();
 var mapSel=document.getElementById("mapMunicipality");mapSel.innerHTML='<option value="">Todos os municípios</option>'+d.municipalities.map(function(x){return '<option value="'+escHtml(x.municipality_code)+'">'+escHtml(x.municipality_name)+'</option>'}).join("");
 document.getElementById("dashboard").style.display="block";document.getElementById("searchResults").innerHTML="";await showLevel("municipality");document.getElementById("dashboard").scrollIntoView({behavior:"smooth",block:"start"});
}
function municipalityTable(rows){
 var total=rows.length;
 return '<table><thead><tr><th>Posição</th><th>Município</th><th>Votos</th><th>% dos seus votos</th><th>Força</th></tr></thead><tbody>'+rows.map(function(x){return '<tr class="municipality-row" data-code="'+escHtml(x.municipality_code)+'" style="cursor:pointer"><td class="rank">#'+x.rank+'</td><td><b>'+escHtml(x.municipality_name)+'</b></td><td>'+fmt(x.votes)+'</td><td>'+pct(x.pct_total)+'</td><td><span class="strength">'+strength(x.rank,total)+'</span></td></tr>'}).join("")+'</tbody></table>';
}
function genericTable(rows,level){
 if(!rows.length)return '<div class="empty">Nenhum dado encontrado neste nível para o recorte selecionado.</div>';
 var total=rows.length,label="Território";
 if(level==="zone")label="Zona";
 if(level==="neighborhood")label="Bairro";
 if(level==="polling_place")label="Rua / Local";
 if(level==="section")label="Seção";
 return '<table><thead><tr><th>Posição</th><th>'+label+'</th><th>Votos</th><th>% dos seus votos</th><th>Força</th></tr></thead><tbody>'+
 rows.map(function(x){
   var name="";
   if(level==="zone")name="Zona "+x.zone+(x.municipality_name?" · "+x.municipality_name:"");
   else if(level==="neighborhood")name=(x.neighborhood||"Sem bairro informado")+(x.municipality_name?" · "+x.municipality_name:"");
   else if(level==="polling_place")name=(x.address||x.polling_place_name||x.polling_place_code||"Local de votação")+(x.neighborhood?" · "+x.neighborhood:"")+(x.municipality_name?" · "+x.municipality_name:"");
   else name="Seção "+x.section+(x.zone>=0?" · Zona "+x.zone:"")+(x.polling_place_name?" · "+x.polling_place_name:"")+(x.municipality_name?" · "+x.municipality_name:"");
   return '<tr class="territory-row" style="cursor:pointer"'+
     ' data-municipality="'+escHtml(x.municipality_code||"")+'"'+
     ' data-neighborhood="'+escHtml(x.neighborhood||"")+'"'+
     ' data-place="'+escHtml(x.polling_place_code||"")+'"'+
     ' data-zone="'+escHtml(x.zone==null?"":x.zone)+'"'+
     ' data-section="'+escHtml(x.section==null?"":x.section)+'">'+
     '<td class="rank">#'+x.rank+'</td><td><b>'+escHtml(name)+'</b></td><td>'+fmt(x.votes)+'</td><td>'+pct(x.pct_total)+'</td><td><span class="strength">'+strength(x.rank,total)+'</span></td></tr>';
 }).join("")+'</tbody></table>';
}
function syncMapScopeFromTerritory(){
 var m=document.getElementById("mapMunicipality");
 if(m&&territoryScope.municipality)m.value=territoryScope.municipality;
}
var territoryRequestId=0;
async function loadTerritory(){
 if(!currentCandidate)return;
 var request=++territoryRequestId;
 var content=document.getElementById("territoryContent");
 content.innerHTML='<div class="muted" role="status">Carregando territórios...</div>';
 var p=new URLSearchParams({candidateId:String(currentCandidate.id),level:currentLevel,limit:"1000"});
 if(territoryScope.municipality)p.set("municipality",territoryScope.municipality);
 if(territoryScope.neighborhood)p.set("neighborhood",territoryScope.neighborhood);
 if(territoryScope.place)p.set("polling_place",territoryScope.place);
 if(territoryScope.zone)p.set("zone",territoryScope.zone);
 var controller=new AbortController();
 var timer=setTimeout(function(){controller.abort()},20000);
 try{
  var response=await fetch("/api/territory?"+p.toString(),{signal:controller.signal,cache:"no-store"});
  if(!response.ok){
   var failure=await response.json().catch(function(){return {}});
   throw new Error(failure.error||"Servidor respondeu HTTP "+response.status);
  }
  var d=await response.json();
  if(request!==territoryRequestId)return;
  if(!d||!Array.isArray(d.rows))throw new Error("A resposta da consulta não contém uma lista de territórios.");
  content.innerHTML=genericTable(d.rows,currentLevel);
  refreshComparison();
  content.querySelectorAll(".territory-row").forEach(function(row){
   row.addEventListener("click",async function(){
     var level=currentLevel;
     if(row.dataset.municipality)territoryScope.municipality=row.dataset.municipality;
     if(level==="neighborhood"){
       territoryScope.neighborhood=row.dataset.neighborhood||"";
       territoryScope.place="";territoryScope.zone="";territoryScope.section="";
       document.getElementById("municipalitySelect").value=territoryScope.municipality;
       await showLevel("polling_place");
     }else if(level==="polling_place"){
       territoryScope.neighborhood=row.dataset.neighborhood||territoryScope.neighborhood;
       territoryScope.place=row.dataset.place||"";
       territoryScope.zone="";territoryScope.section="";
       document.getElementById("municipalitySelect").value=territoryScope.municipality;
       await showLevel("zone");
     }else if(level==="zone"){
       territoryScope.zone=row.dataset.zone||"";
       territoryScope.section="";
       document.getElementById("municipalitySelect").value=territoryScope.municipality;
       await showLevel("section");
     }else if(level==="section"){
       territoryScope.zone=row.dataset.zone||territoryScope.zone;
       territoryScope.section=row.dataset.section||"";
       document.getElementById("municipalitySelect").value=territoryScope.municipality;
       await showLevel("map");
     }
   });
  });
 }catch(error){
  if(request!==territoryRequestId)return;
  var message=error&&error.name==="AbortError"?"A consulta excedeu 20 segundos.":error.message||"Erro ao consultar territórios.";
  content.innerHTML='<div class="error" role="alert">Não foi possível carregar os dados: '+escHtml(message)+'</div><button class="btn secondary" type="button" id="retryTerritory">Tentar novamente</button>';
  document.getElementById("retryTerritory").addEventListener("click",function(){loadTerritory()});
 }finally{clearTimeout(timer)}
}
async function showLevel(level){
 currentLevel=level;
 document.querySelectorAll(".tab").forEach(function(t){t.classList.toggle("active",t.dataset.level===level)});
 var scope=document.getElementById("scopebar"),title=document.getElementById("territoryTitle"),content=document.getElementById("territoryContent"),mapWrap=document.getElementById("mapWrap"),customCompare=document.getElementById("customCompare");
 mapWrap.style.display="none";content.style.display="block";customCompare.style.display="none";
 if(level==="compare"){
  scope.style.display="none";content.style.display="none";customCompare.style.display="block";
  title.innerHTML="<h3 style='margin:0'>Comparar candidatos</h3>";
  document.getElementById("compareMunicipality").value=territoryScope.municipality||"";
  refreshComparison();updateCompareLabels();await renderCustomComparison();return;
 }

 if(level==="map"){
   scope.style.display="none";
   title.innerHTML="<h3 style='margin:0'>Mapa da votação</h3><span class='muted'>O mapa acompanha o recorte escolhido nos outros níveis</span>";
   content.style.display="none";mapWrap.style.display="block";
   syncMapScopeFromTerritory();
   await loadMap(true);
   refreshComparison();
   return;
 }

 if(level==="municipality"){
   scope.style.display="none";
   title.innerHTML="<h3 style='margin:0'>Onde sua votação foi mais forte</h3><span class='muted'>Clique em um município para aprofundar</span>";
   content.innerHTML=municipalityTable(overview.municipalities||[]);
   refreshComparison();
   content.querySelectorAll(".municipality-row").forEach(function(r){
     r.addEventListener("click",async function(){
       territoryScope={municipality:r.dataset.code||"",neighborhood:"",place:"",zone:"",section:""};
       document.getElementById("municipalitySelect").value=territoryScope.municipality;
       await showLevel("neighborhood");
     });
   });
   return;
 }

 scope.style.display="flex";
 var labels={neighborhood:"Bairros",polling_place:"Ruas e locais de votação",zone:"Zonas eleitorais",section:"Seções eleitorais"};
 title.innerHTML="<h3 style='margin:0'>"+labels[level]+"</h3>";
 await loadTerritory();
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
function mapScopeLabel(){
 var f=currentMapSelections();
 if(f.section){
   var st=document.getElementById("mapSection"),txt=st.options[st.selectedIndex]?st.options[st.selectedIndex].text:"Seção";
   return txt;
 }
 if(f.place){
   var pl=document.getElementById("mapPlace"),pt=pl.options[pl.selectedIndex]?pl.options[pl.selectedIndex].text:"Rua / Local";
   return pt;
 }
 if(f.neighborhood)return "Bairro "+f.neighborhood;
 if(f.zone)return "Zona "+f.zone;
 if(f.municipality){
   var m=document.getElementById("mapMunicipality"),mt=m.options[m.selectedIndex]?m.options[m.selectedIndex].text:"Município";
   return mt;
 }
 return currentCandidate&&currentCandidate.uf==="BR"?"Brasil":"Estado "+(currentCandidate?currentCandidate.uf:"");
}
function pushPinSvg(){
 return '<div class="vote-pin"><svg viewBox="0 0 64 92" aria-hidden="true" focusable="false">'+
   '<defs><linearGradient id="pinRed" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff6767"/><stop offset=".58" stop-color="#e83f43"/><stop offset="1" stop-color="#c92f34"/></linearGradient><linearGradient id="pinNeedle" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#eeeeee"/><stop offset="1" stop-color="#aeb4bb"/></linearGradient></defs>'+
   '<g transform="rotate(12 32 44)">'+
     '<path d="M28 55 L35 55 L32 89 Z" fill="url(#pinNeedle)"/>'+
     '<ellipse cx="31.5" cy="50" rx="22" ry="15.5" fill="url(#pinRed)" stroke="#b9282d" stroke-width="1.2"/>'+
     '<path d="M27 18 C28 31 25 39 21 48 C25 55 33 58 40 53 C43 43 44 31 42 18 Z" fill="url(#pinRed)"/>'+
     '<ellipse cx="35" cy="17" rx="16.5" ry="9.5" fill="#ff6264" stroke="#d7393d" stroke-width="1.2"/>'+
     '<ellipse cx="35" cy="15.5" rx="13.2" ry="6.8" fill="#ff7b7c" opacity=".55"/>'+
     '<ellipse cx="18" cy="46" rx="3.2" ry="5.5" fill="#ffb1b2" opacity=".65"/>'+
   '</g>'+
 '</svg></div>';
}
function pushPinIcon(votes){
 var v=Math.max(1,Number(votes||1));
 var scale=Math.max(.82,Math.min(1.18,.82+Math.log10(v+1)*.08));
 var w=Math.round(38*scale),h=Math.round(56*scale);
 return window.L.divIcon({
   className:"vote-pin-marker",
   html:pushPinSvg(),
   iconSize:[w,h],
   iconAnchor:[Math.round(w*.5),Math.round(h*.95)],
   popupAnchor:[0,-Math.round(h*.68)]
 });
}

function popupForNearbyLocations(items){
 if(items.length===1)return popupHtml(items[0]);
 return '<div class="popup-title">'+fmt(items.length)+' locais próximos</div>'+
  '<div class="popup-meta">Os pinos destes locais se sobrepõem no mapa. Confira os registros:</div>'+
  items.map(function(x){
   return '<div style="padding:9px 0;border-top:1px solid #ddd"><b>'+escHtml(x.polling_place_name||"Local de votação")+'</b>'+
    '<div class="popup-meta">'+escHtml(x.address||"Endereço não informado")+'</div>'+
    '<div><strong>'+fmt(x.votes)+' votos</strong></div>'+
    '<div class="popup-sections">'+(x.sections||[]).map(function(sec){
     return '<div class="popup-section"><span>Zona '+escHtml(sec.zone)+' · Seção '+escHtml(sec.section)+'</span><b>'+fmt(sec.votes)+' votos</b></div>';
    }).join("")+'</div></div>';
  }).join("");
}
function renderMapRows(){
 if(!voteMap||!mapLayer)return;
 mapLayer.clearLayers();
 var L=window.L,f=currentMapSelections(),bounds=[],onlyPoint=null,locations=[];
 mapRows.forEach(function(x){
  if(!rowMatchesMapFilters(x,""))return;
  var lat=Number(x.latitude),lng=Number(x.longitude);
  if(!Number.isFinite(lat)||!Number.isFinite(lng))return;
  var filteredSections=(x.sections||[]).filter(function(sec){
   if(f.zone&&String(sec.zone)!==f.zone)return false;
   if(f.section&&String(sec.section)!==f.section)return false;
   return true;
  });
  if((f.zone||f.section)&&!filteredSections.length)return;
  var copy=Object.assign({},x,{sections:filteredSections.length?filteredSections:x.sections});
  if(f.zone||f.section)copy.votes=filteredSections.reduce(function(sum,sec){return sum+Number(sec.votes||0)},0);
  locations.push({lat:lat,lng:lng,data:copy});
 });
 // Agrupa coordenadas próximas (aproximadamente 10 m); mantém os dados individuais no popup.
 var groups=new Map();
 locations.forEach(function(item){
  var key=item.lat.toFixed(4)+"|"+item.lng.toFixed(4);
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push(item);
 });
 var detailed=Boolean(f.zone||f.neighborhood||f.place||f.section);
 groups.forEach(function(entries){
  var first=entries[0],items=entries.map(function(entry){return entry.data});
  var lat=first.lat,lng=first.lng;
  var votes=items.reduce(function(sum,x){return sum+Number(x.votes||0)},0);
  var marker;
  if(detailed){
   marker=L.marker([lat,lng],{icon:pushPinIcon(votes),riseOnHover:true});
   marker.on("click",function(){
    document.querySelectorAll(".vote-pin.selected").forEach(function(el){el.classList.remove("selected")});
    var node=marker.getElement();if(node){var pin=node.querySelector(".vote-pin");if(pin)pin.classList.add("selected")}
   });
  }else{
   marker=L.circleMarker([lat,lng],{radius:Math.max(6,Math.min(18,5+Math.sqrt(votes))),weight:1,fillOpacity:.78});
  }
  marker.bindPopup(popupForNearbyLocations(items),{maxWidth:400});
  if(items.length>1)marker.bindTooltip(fmt(items.length)+" locais neste ponto",{direction:"top"});
  marker.addTo(mapLayer);
  bounds.push([lat,lng]);onlyPoint=[lat,lng];
 });
 var count=locations.length,points=groups.size;
 document.getElementById("mapCount").textContent=fmt(count)+" locais com votos"+(points<count?" em "+fmt(points)+" pontos do mapa (locais próximos agrupados)":"");
 document.getElementById("mapScope").textContent=mapScopeLabel();
 if(!bounds.length){
  document.getElementById("mapCount").textContent="Nenhum local encontrado com esses filtros";
  return;
 }
 voteMap.setMaxBounds(null);
 voteMap.options.minZoom=3;
 var leafletBounds=L.latLngBounds(bounds);
 if(f.place||f.section||bounds.length===1){
  voteMap.setView(onlyPoint,17,{animate:true});
  var tight=L.latLngBounds([onlyPoint[0]-.01,onlyPoint[1]-.01],[onlyPoint[0]+.01,onlyPoint[1]+.01]);
  voteMap.setMaxBounds(tight.pad(.35));
  voteMap.options.minZoom=15;
  return;
 }
 var maxZoom=f.neighborhood?15:(f.zone?14:(f.municipality?13:9));
 voteMap.fitBounds(leafletBounds,{padding:[28,28],maxZoom:maxZoom,animate:true});
 var pad=f.neighborhood?.12:(f.zone?.16:(f.municipality?.22:.35));
 voteMap.setMaxBounds(leafletBounds.pad(pad));
 voteMap.options.minZoom=Math.max(3,voteMap.getZoom()-1);
}
function imageryMessage(message){
 var node=document.getElementById("mapImageryStatus");if(!node)return;
 node.textContent=message||"";node.classList.toggle("visible",Boolean(message));
}
function satelliteTileLayer(fallback){
 var host=fallback?"server.arcgisonline.com":"services.arcgisonline.com";
 return window.L.tileLayer("https://"+host+"/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",{
   maxZoom:19,maxNativeZoom:19,updateWhenIdle:false,keepBuffer:3,
   attribution:"Imagery &copy; Esri, Maxar, Earthstar Geographics and the GIS User Community"
 });
}
function attachSatelliteMonitoring(layer){
 layer.on("tileload",function(){satelliteErrors=0;imageryMessage("")});
 layer.on("tileerror",function(){
   satelliteErrors++;
   if(satelliteErrors<3||currentMapStyle!=="satellite")return;
   if(!satelliteFallbackUsed){
     satelliteFallbackUsed=true;satelliteErrors=0;
     imageryMessage("Carregando imagens por uma conexão alternativa...");
     var alternate=satelliteTileLayer(true);attachSatelliteMonitoring(alternate);
     if(voteMap&&voteMap.hasLayer(baseMapLayers.satellite))voteMap.removeLayer(baseMapLayers.satellite);
     baseMapLayers.satellite=alternate;
     if(voteMap){alternate.addTo(voteMap);alternate.bringToBack()}
   }else{
     imageryMessage("Não foi possível carregar as imagens do provedor de satélite. Pode ser uma falha de conexão ou de disponibilidade do serviço. O mapa Padrão continua funcionando.");
   }
 });
}
function selectMapStyle(style){
 if(style!=="standard"&&style!=="satellite")return;
 currentMapStyle=style;
 imageryMessage("");
 document.querySelectorAll(".map-style-button").forEach(function(button){
   var active=button.dataset.mapStyle===style;
   button.classList.toggle("active",active);
   button.setAttribute("aria-pressed",String(active));
 });
 if(!voteMap||!baseMapLayers)return;
 Object.keys(baseMapLayers).forEach(function(key){if(voteMap.hasLayer(baseMapLayers[key]))voteMap.removeLayer(baseMapLayers[key])});
 baseMapLayers[style].addTo(voteMap);
 baseMapLayers[style].bringToBack();
}
async function loadMap(preserveScope){
 if(!currentCandidate)return;
 var L;
 try{L=await loadLeaflet()}catch(e){document.getElementById("map").innerHTML='<div class="error">Não foi possível carregar o mapa.</div>';return}
 if(!voteMap){
  voteMap=L.map("map",{preferCanvas:true}).setView([-14.235,-51.9253],4);
  baseMapLayers={
   standard:L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"&copy; OpenStreetMap contributors"}),
   satellite:satelliteTileLayer(false)
  };
  attachSatelliteMonitoring(baseMapLayers.satellite);
  selectMapStyle(currentMapStyle);
 } else {setTimeout(function(){voteMap.invalidateSize()},50)}
 if(!mapLayer)mapLayer=L.layerGroup().addTo(voteMap);
 var code=document.getElementById("mapMunicipality").value||territoryScope.municipality;
 if(code)document.getElementById("mapMunicipality").value=code;
 voteMap.setMaxBounds(null);voteMap.options.minZoom=3;
 var p=new URLSearchParams({candidateId:String(currentCandidate.id),limit:"50000"});if(code)p.set("municipality",code);
 document.getElementById("mapCount").textContent="Carregando pinos...";
 var r=await fetch("/api/map?"+p.toString()),d=await r.json();
 if(!r.ok){document.getElementById("mapCount").textContent=d.error||"Falha ao carregar mapa";return}
 mapRows=d.rows||[];
 var wanted=preserveScope?{
   zone:String(territoryScope.zone||""),
   neighborhood:String(territoryScope.neighborhood||""),
   place:String(territoryScope.place||""),
   section:String(territoryScope.section||"")
 }:null;
 ["mapZone","mapNeighborhood","mapPlace","mapSection"].forEach(function(id){var el=document.getElementById(id);el.value="";});
 rebuildMapFilters("municipality");
 if(wanted){
   if(wanted.zone){document.getElementById("mapZone").value=wanted.zone;rebuildMapFilters("zone");}
   if(wanted.neighborhood){document.getElementById("mapNeighborhood").value=wanted.neighborhood;rebuildMapFilters("neighborhood");}
   if(wanted.place){document.getElementById("mapPlace").value=wanted.place;rebuildMapFilters("place");}
   if(wanted.section){document.getElementById("mapSection").value=wanted.section;rebuildMapFilters("section");}
 }
 renderMapRows();
 setTimeout(function(){voteMap.invalidateSize()},100);
}
function applyMapFilter(changed){
 rebuildMapFilters(changed);renderMapRows();refreshComparison();
}
document.querySelectorAll(".tab").forEach(function(t){t.addEventListener("click",function(){showLevel(t.dataset.level)})});
[0,1].forEach(function(i){document.getElementById("compareSearch"+(i+1)).addEventListener("input",function(){lookupCompareCandidates(i)})});
document.getElementById("compareMunicipality").addEventListener("change",function(){territoryScope={municipality:this.value,neighborhood:"",place:"",zone:"",section:""};refreshComparison();renderCustomComparison()});
document.getElementById("compareLevel").addEventListener("change",function(){loadComparisonBreakdown()});
document.getElementById("compareExportCsv").addEventListener("click",function(){
 if(!currentCandidate||currentLevel!=="compare")return;
 var candidates=[currentCandidate].concat(compareChoices.filter(Boolean));
 if(candidates.length<2){alert("Selecione pelo menos dois candidatos para exportar.");return}
 var level=document.getElementById("compareLevel").value;
 var municipality=territoryScope.municipality||"";
 if(level!=="municipality"&&!municipality){alert("Selecione um município para exportar bairros, zonas, locais ou seções.");return}
 var params=new URLSearchParams({ids:candidates.map(function(c){return c.id}).join(","),level:level});
 if(municipality)params.set("municipality",municipality);
 window.location.href="/api/comparison-export.csv?"+params.toString();
});
document.getElementById("compareExportPdf").addEventListener("click",function(){window.print()});
document.getElementById("municipalitySelect").addEventListener("change",async function(){
 territoryScope.municipality=this.value;
 territoryScope.neighborhood="";territoryScope.place="";territoryScope.zone="";territoryScope.section="";
 if(currentLevel!=="municipality"&&currentLevel!=="map")await loadTerritory();
 refreshComparison();
});
document.getElementById("mapMunicipality").addEventListener("change",function(){
 territoryScope.municipality=this.value;
 territoryScope.neighborhood="";territoryScope.place="";territoryScope.zone="";territoryScope.section="";
 loadMap(false).then(refreshComparison);
});
document.getElementById("mapZone").addEventListener("change",function(){applyMapFilter("zone")});
document.getElementById("mapNeighborhood").addEventListener("change",function(){applyMapFilter("neighborhood")});
document.getElementById("mapPlace").addEventListener("change",function(){applyMapFilter("place")});
document.getElementById("mapSection").addEventListener("change",function(){applyMapFilter("section")});
document.querySelectorAll(".map-style-button").forEach(function(button){button.addEventListener("click",function(){selectMapStyle(button.dataset.mapStyle)})});
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
