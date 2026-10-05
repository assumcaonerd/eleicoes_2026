const url = "https://resultados.tse.jus.br/oficial/ele2026/6259/config/mun-e006259-cm.json";
const r = await fetch(url);
if (!r.ok) throw new Error(`HTTP ${r.status}`);
const data = await r.json() as any;
console.log(JSON.stringify({
  keys:Object.keys(data),
  firstUf:data?.abr?.[0],
  secondUf:data?.abr?.[1],
  firstMunicipios:data?.abr?.[0]?.mu?.slice?.(0,5)
}, null, 2));
