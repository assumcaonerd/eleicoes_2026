import { writeFile, mkdir, readdir, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
const url="https://cdn.tse.jus.br/estatistica/sead/odsele/eleitorado_locais_votacao/eleitorado_local_votacao_2026.zip";
const r=await fetch(url,{headers:{"user-agent":"Mozilla/5.0"}});
console.log("ZIP_STATUS="+r.status);
if(!r.ok) process.exit(1);
await writeFile("/tmp/locais2026.zip",Buffer.from(await r.arrayBuffer()));
await mkdir("/tmp/locais2026",{recursive:true});
execFileSync("unzip",["-o","/tmp/locais2026.zip","-d","/tmp/locais2026"],{stdio:"inherit"});
const files=await readdir("/tmp/locais2026");
console.log("FILES="+JSON.stringify(files));
for(const f of files.slice(0,5)){
 const p="/tmp/locais2026/"+f;
 const data=await readFile(p,"latin1");
 console.log("FILE="+f);
 console.log("HEAD="+data.split(/\r?\n/).slice(0,4).join("\n"));
}
