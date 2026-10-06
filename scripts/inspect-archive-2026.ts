import { writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

const url="https://www.tse.jus.br/eleicoes/eleicoes-2026-content/arquivos/formato-arquivos-de-bu-rdv-e-assinatura-digital";
const r=await fetch(url);
console.log("ZIP_STATUS="+r.status+" TYPE="+r.headers.get("content-type"));
if(!r.ok) process.exit(1);
const buf=Buffer.from(await r.arrayBuffer());
writeFileSync("/tmp/tse2026.zip",buf);
console.log("ZIP_BYTES="+buf.length);
try{
  const out=execFileSync("python3",["-c",`
import zipfile, json
z=zipfile.ZipFile('/tmp/tse2026.zip')
print('ZIP_FILES='+json.dumps(z.namelist(),ensure_ascii=False))
for n in z.namelist():
    if n.lower().endswith('.asn1') and 'bu' in n.lower():
        data=z.read(n).decode('utf-8','replace')
        print('BU_SPEC_NAME='+n)
        print('BU_SPEC_LEN='+str(len(data)))
        print('BU_SPEC_HEAD='+data[:4000].replace('\\n','\\\\n'))
`],{encoding:"utf8"});
  console.log(out);
}catch(e:any){console.error(String(e.stdout||e.message));process.exit(1)}
