const url = "https://resultados.tse.jus.br/oficial/ele2026/6259/config/mun-e006259-cm.json";
const r = await fetch(url);
if (!r.ok) throw new Error(`HTTP ${r.status}`);
const data = await r.json() as any;

function summarize(value:any, depth=0):any {
  if (depth > 3) return typeof value;
  if (Array.isArray(value)) return {
    type:"array",
    length:value.length,
    sample:value.slice(0,3).map(v=>summarize(v, depth+1))
  };
  if (value && typeof value === "object") {
    const out:any={};
    for (const [k,v] of Object.entries(value).slice(0,20)) out[k]=summarize(v, depth+1);
    return out;
  }
  return value;
}
console.log(JSON.stringify(summarize(data), null, 2));
