const urls=[
"https://resultados.tse.jus.br/oficial/ele2026/6259/dados/es/es56006-z0046-s0059-c0007-e006259-u.json",
"https://resultados.tse.jus.br/oficial/ele2026/6259/dados/es/es56006-z0046-se0059-c0007-e006259-u.json",
"https://resultados.tse.jus.br/oficial/ele2026/6259/dados/es/es56006-s0059-c0007-e006259-u.json",
"https://resultados.tse.jus.br/oficial/ele2026/6259/dados/es/es56006-z0046-c0007-e006259-u.json"
];
for(const url of urls){
 const r=await fetch(url);
 console.log("TEST="+r.status+" "+url);
 if(r.ok){
   const j=await r.json() as any;
   console.log("KEYS="+JSON.stringify(Object.keys(j||{})));
   console.log("HEAD="+JSON.stringify(j).slice(0,1800));
 }
}
