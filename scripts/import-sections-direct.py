import csv, io, json, os, time, urllib.request, zipfile, threading
from concurrent.futures import ThreadPoolExecutor, as_completed
import asn1tools
import psycopg

UF=os.environ.get("TSE_IMPORT_UF","ES").upper()
PLEITO=3220
BASE=f"https://resultados.tse.jus.br/oficial/ele2026/arquivo-urna/{PLEITO}"
LOC_URL="https://cdn.tse.jus.br/estatistica/sead/odsele/eleitorado_locais_votacao/eleitorado_local_votacao_2026.zip"
SPEC="/app/spec/bu.asn1"
CONCURRENCY=max(1,int(os.environ.get("TSE_SECTION_CONCURRENCY","10")))
DB=os.environ["SECTIONS_DATABASE_URL"]
OFFICE_MAP={"presidente":1,"governador":3,"senador":5,"deputadoFederal":6,"deputadoEstadual":7,"deputadoDistrital":8}
UA={"User-Agent":"Mozilla/5.0"}

def fetch_bytes(url,retries=4):
    last=None
    for attempt in range(retries):
        try:
            req=urllib.request.Request(url,headers=UA)
            with urllib.request.urlopen(req,timeout=40) as r:return r.read()
        except Exception as e:
            last=e;time.sleep(min(1.5*(attempt+1),5))
    raise last

def fetch_json(url): return json.loads(fetch_bytes(url).decode("utf-8"))
def dec(v):
    if v is None or v=="": return None
    try:return float(str(v).strip().replace(",","."))
    except:return None

def load_places(conn):
    data=fetch_bytes(LOC_URL)
    z=zipfile.ZipFile(io.BytesIO(data))
    name=f"eleitorado_local_votacao_2026_{UF}.csv"
    raw=z.read(name).decode("latin1")
    reader=csv.DictReader(io.StringIO(raw),delimiter=";",quotechar='"')
    rows=[]
    for r in reader:
        if r.get("SG_UF","").upper()!=UF: continue
        rows.append((UF,r["CD_MUNICIPIO"].strip(),r["NM_MUNICIPIO"].strip(),int(r["NR_ZONA"]),int(r["NR_SECAO"]),
          r["NR_LOCAL_VOTACAO"].strip(),r["NM_LOCAL_VOTACAO"].strip(),r["DS_ENDERECO"].strip(),
          (r.get("NM_BAIRRO") or "").strip(),(r.get("NR_CEP") or "").strip(),dec(r.get("NR_LATITUDE")),dec(r.get("NR_LONGITUDE"))))
    with conn.cursor() as cur:
        cur.execute("DELETE FROM places WHERE uf=%s",(UF,))
        with cur.copy("""COPY places (uf,municipality_code,municipality_name,zone,section,polling_place_code,polling_place_name,address,neighborhood,cep,latitude,longitude) FROM STDIN""") as cp:
            for row in rows: cp.write_row(row)
    conn.commit()
    print("PLACES_IMPORTED="+str(len(rows)),flush=True)

def cargo_code(value):
    if isinstance(value,(list,tuple)) and len(value)>1:return OFFICE_MAP.get(str(value[1]))
    if isinstance(value,str):return OFFICE_MAP.get(value)
    return None

def section_job(conv,municipality_code,municipality_name,zone,section):
    m=str(municipality_code).zfill(5);z=str(zone).zfill(4);s=str(section).zfill(4);uf=UF.lower()
    aux_url=f"{BASE}/dados/{uf}/{m}/{z}/{s}/p{PLEITO:06d}-{uf}-m{m}-z{z}-s{s}-aux.json"
    try:aux=fetch_json(aux_url)
    except Exception:return ("skip",[])
    chosen=None
    for h in aux.get("hashes") or []:
        if any(a.get("tp")=="bu" for a in (h.get("arq") or [])):chosen=h;break
    if not chosen:return ("skip",[])
    bu=next(a for a in chosen.get("arq",[]) if a.get("tp")=="bu")
    bu_url=f"{BASE}/dados/{uf}/{m}/{z}/{s}/{chosen['hash']}/{bu['nm']}"
    try:
        raw=fetch_bytes(bu_url)
        env=conv.decode("EntidadeEnvelopeGenerico",raw)
        decoded=conv.decode("EntidadeBoletimUrna",env["conteudo"])
    except Exception:return ("skip",[])
    ident_sec=decoded.get("identificacaoSecao") or {}
    local=str(ident_sec.get("local") or "")
    out=[]
    for eleicao in decoded.get("resultadosVotacaoPorEleicao",[]) or []:
      for resultado in eleicao.get("resultadosVotacao",[]) or []:
       for total in resultado.get("totaisVotosCargo",[]) or []:
        office=cargo_code(total.get("codigoCargo"))
        if office not in (1,3,5,6,7,8):continue
        election=6257 if office==1 else 6259
        for voto in total.get("votosVotaveis",[]) or []:
            if voto.get("tipoVoto")!="nominal":continue
            ident=voto.get("identificacaoVotavel") or {}
            num=ident.get("codigo");q=int(voto.get("quantidadeVotos") or 0)
            if num is None or q<=0:continue
            out.append((election,1,office,UF,str(municipality_code),municipality_name,int(zone),int(section),local,str(num),str(ident.get("partido") or ""),q,bu.get("nm")))
    return ("ok",out)

def main():
    conv=asn1tools.compile_files(SPEC,codec="ber")
    conn=psycopg.connect(DB)
    load_places(conn)
    cfg=fetch_json(f"{BASE}/config/{UF.lower()}/{UF.lower()}-p{PLEITO:06d}-cs.json")
    tasks=[]
    for m in (cfg.get("abr") or [{}])[0].get("mu",[]) or []:
        mc=str(m.get("cd"));mn=str(m.get("nm") or "")
        for z in m.get("zon",[]) or []:
            zn=int(z.get("cd"))
            for sec in z.get("sec",[]) or []:tasks.append((mc,mn,zn,int(sec.get("ns"))))
    print("SECTIONS_TOTAL="+str(len(tasks)),flush=True)
    conn.execute("DELETE FROM section_votes WHERE uf=%s",(UF,));conn.commit()
    buffer=[];done=0;skipped=0;written=0
    def flush():
        nonlocal buffer,written
        if not buffer:return
        with conn.cursor() as cur:
            with cur.copy("""COPY section_votes (election_id,round,office_code,uf,municipality_code,municipality_name,zone,section,polling_place_code,candidate_number,party_number,votes,source_file) FROM STDIN""") as cp:
                for row in buffer:cp.write_row(row)
        written+=len(buffer);buffer=[];conn.commit()
    with ThreadPoolExecutor(max_workers=CONCURRENCY) as ex:
        futures=[ex.submit(section_job,conv,*t) for t in tasks]
        for fut in as_completed(futures):
            status,rows=fut.result();done+=1
            if status=="ok":buffer.extend(rows)
            else:skipped+=1
            if len(buffer)>=20000:flush()
            if done%250==0:print(f"PROGRESS={done}/{len(tasks)} rows={written+len(buffer)} skipped={skipped}",flush=True)
    flush()
    print(json.dumps({"sections":len(tasks),"rows":written,"skipped":skipped},ensure_ascii=False),flush=True)
    conn.close()

if __name__=="__main__":main()
