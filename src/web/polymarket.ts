const source = 'https://polymarket.com/event/brazil-presidential-election';
const endpoint = 'https://gamma-api.polymarket.com/events/slug/brazil-presidential-election';
export function parseEvent(event:any){
  if(event?.slug!=='brazil-presidential-election'||!Array.isArray(event.markets)) throw new Error('Evento inválido');
  const list=(v:any):any[]=>Array.isArray(v)?v:JSON.parse(v||'[]');
  const candidates=event.markets.filter((m:any)=>event.closed||(!m.closed&&m.active!==false)).map((m:any)=>{
    const outcomes=list(m.outcomes), prices=list(m.outcomePrices);
    const i=outcomes.findIndex((v:any)=>String(v).toLowerCase()==='yes');
    const p=Number(prices[i]);
    if(i<0||prices[i]==null||!Number.isFinite(p)||p<0||p>1||!m.groupItemTitle) throw new Error('Cotação inválida');
    const name=String(m.groupItemTitle);
    const photo=name==='Flávio Bolsonaro'?'flavio':name==='Luiz Inácio Lula da Silva'?'lula':null;
    return {name,probability:p*100,photo:photo?'/assets/siga-voto/polymarket/'+photo+'.webp':null};
  }).sort((a:any,b:any)=>b.probability-a.probability);
  if(!candidates.length) throw new Error('Sem cotações');
  return {source,candidates,closed:Boolean(event.closed),sourceUpdatedAt:event.updatedAt||null};
}
let cached:ReturnType<typeof parseEvent>&{fetchedAt:string}|undefined;
let pending:Promise<void>|undefined;
let retryAt=0;
export async function readPolymarket(){
  if(!cached||Date.now()-Date.parse(cached.fetchedAt)>=15000){
    if(Date.now()>=retryAt&&!pending){
      pending=(async()=>{try{
        const res=await fetch(endpoint,{signal:AbortSignal.timeout(8000),headers:{accept:'application/json'}});
        if(!res.ok) throw new Error('Fonte indisponível');
        cached={...parseEvent(await res.json()),fetchedAt:new Date().toISOString()};retryAt=0;
      }catch{retryAt=Date.now()+15000;}finally{pending=undefined;}})();
    }
    if(pending) await pending;
  }
  if(!cached||Date.now()-Date.parse(cached.fetchedAt)>300000) throw new Error('Polymarket temporariamente indisponível');
  return {...cached,stale:retryAt>Date.now()||Date.now()-Date.parse(cached.fetchedAt)>30000,refreshSeconds:15};
}
export function polymarketPanel(){return `<section class="poly-panel" aria-labelledby="poly-title"><style>
.poly-panel{background:#121d30;color:#fff;border:1px solid #34425b;border-radius:16px;padding:22px;margin:20px 0}.poly-panel h2{color:#ffdc35!important;font-size:22px;margin:0 0 8px}.poly-panel p{color:#bdc9db;font-size:13px}.poly-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}.poly-item{padding:16px;background:#17263b;border-radius:12px}.poly-heading{display:flex;align-items:center;gap:12px;min-height:48px}.poly-photo{width:48px;height:48px;object-fit:cover;border-radius:50%;flex:none;border:1px solid #53627a}.poly-item strong{display:block;font-size:32px;color:#ffdc35}.poly-panel a{color:#9ddcff}.poly-track{height:6px;background:#34425b;border-radius:4px;margin-top:10px;overflow:hidden}.poly-fill{height:100%;background:#31c987}
</style><h2 id="poly-title">PRESIDÊNCIA 2026 · POLYMARKET</h2><p>Probabilidades de vitória no mercado de previsões. Não representam intenção de voto nem resultado oficial do TSE.</p><div class="poly-grid" id="poly-candidates"></div><p id="poly-status" role="status">Consultando probabilidades…</p><a href="${source}" target="_blank" rel="noopener noreferrer">Fonte: Polymarket</a><script src="/assets/siga-voto/polymarket.js?v=2" defer></script></section>`;}
