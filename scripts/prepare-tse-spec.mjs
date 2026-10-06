import { writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
const url="https://www.tse.jus.br/eleicoes/eleicoes-2026-content/arquivos/formato-arquivos-de-bu-rdv-e-assinatura-digital";
const r=await fetch(url,{headers:{"user-agent":"Mozilla/5.0"}});
if(!r.ok) throw new Error("TSE spec HTTP "+r.status);
await writeFile("/tmp/tse2026.zip",Buffer.from(await r.arrayBuffer()));
await mkdir("/tmp/tse2026",{recursive:true});
execFileSync("unzip",["-o","/tmp/tse2026.zip","spec/bu.asn1","-d","/tmp/tse2026"],{stdio:"inherit"});
console.log("SPEC_READY=/tmp/tse2026/spec/bu.asn1");
