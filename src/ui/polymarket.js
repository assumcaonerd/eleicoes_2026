(function(){
 const box=document.getElementById('poly-candidates'),status=document.getElementById('poly-status');
 if(!box||!status)return;
 let busy=false;
 async function refresh(){
  if(busy||document.hidden)return;busy=true;
  try{
   const res=await fetch('/api/polymarket',{signal:AbortSignal.timeout(12000)});
   if(!res.ok)throw Error();const data=await res.json();
   const items=data.candidates.map(c=>{
    const item=document.createElement('div');item.className='poly-item';
    const name=document.createElement('span');name.textContent=c.name;
    const value=document.createElement('strong');value.textContent=c.probability.toLocaleString('pt-BR',{maximumFractionDigits:1})+'%';
    const track=document.createElement('div');track.className='poly-track';track.setAttribute('aria-hidden','true');
    const fill=document.createElement('div');fill.className='poly-fill';fill.style.width=c.probability+'%';track.append(fill);
    item.append(name,value,track);return item;
   });box.replaceChildren(...items);
   status.textContent=(data.closed?'Mercado encerrado. ':data.stale?'Atualização indisponível. Última consulta válida: ':'Atualização automática a cada 15 segundos. Consultado em ')+new Date(data.fetchedAt).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})+' (Brasília).';
  }catch{status.textContent='Polymarket temporariamente indisponível. Aguardando nova consulta.';box.replaceChildren();}
  finally{busy=false;}
 }
 refresh();setInterval(refresh,15000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
})();
