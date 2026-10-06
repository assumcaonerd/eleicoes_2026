const api="https://dadosabertos.tse.jus.br/api/3/action/package_show?id=eleitorado-2026";
const r=await fetch(api,{headers:{"user-agent":"siga-o-voto/1.0"}});
console.log("CKAN_STATUS="+r.status);
if(!r.ok) process.exit(0);
const data=await r.json() as any;
const resources=data?.result?.resources??[];
for(const x of resources){
  const name=String(x.name??"");
  if(/local de vota/i.test(name)){
    console.log("LOCAL_RESOURCE="+JSON.stringify({name,url:x.url,format:x.format,mimetype:x.mimetype,id:x.id}));
  }
}
