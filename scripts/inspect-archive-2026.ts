const base="https://resultados.tse.jus.br/oficial/ele2026/arquivo-urna/3220";
const csUrl=base+"/config/es/es-p003220-cs.json";
const r=await fetch(csUrl);
console.log("CS_STATUS="+r.status);
if(!r.ok) process.exit(0);
const data=await r.json() as any;
const root=data?.abr?.[0];
const mus=Array.isArray(root?.mu)?root.mu:[];
let zones=0, sections=0, sample:any=null;
for(const m of mus){
  const zon=Array.isArray(m?.zon)?m.zon:[];
  zones+=zon.length;
  for(const z of zon){
    const sec=Array.isArray(z?.sec)?z.sec:[];
    sections+=sec.length;
    if(!sample && sec[0]) sample={municipio:m.cd,municipioNome:m.nm,zone:z.cd,section:sec[0].ns};
  }
}
console.log("CS_SUMMARY="+JSON.stringify({ufs:root?.cd,municipalities:mus.length,zones,sections,sample}));
if(sample){
  const auxUrl=base+"/dados/es/"+sample.municipio+"/"+sample.zone+"/"+sample.section+
    "/p003220-es-m"+sample.municipio+"-z"+sample.zone+"-s"+sample.section+"-aux.json";
  const a=await fetch(auxUrl);
  console.log("AUX_STATUS="+a.status);
  if(a.ok){
    const aux=await a.json() as any;
    console.log("AUX_SUMMARY="+JSON.stringify({
      status:aux?.st,
      hashes:Array.isArray(aux?.hashes)?aux.hashes.length:0,
      files:aux?.hashes?.[0]?.nmarq??[]
    }));
  }
}
