const api="https://dadosabertos.tse.jus.br/api/3/action/resource_show?id=300626b4-2b24-4d2e-b4fc-46b569cfffe5";
const r=await fetch(api,{headers:{"user-agent":"Mozilla/5.0","accept":"application/json"}});
console.log("RESOURCE_STATUS="+r.status);
const t=await r.text();
console.log("RESOURCE_BODY="+t.slice(0,12000));
