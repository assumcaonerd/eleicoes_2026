import csv, io, json, os, sys, time, urllib.request, zipfile, tempfile, threading
from concurrent.futures import ThreadPoolExecutor, as_completed
import asn1tools
import psycopg

UF=os.environ.get("TSE_IMPORT_UF","ES").upper()
PLEITO=3220
BASE=f"https://resultados.tse.jus.br/oficial/ele2026/arquivo-urna/{PLEITO}"
LOC_URL="https://cdn.tse.jus.br/estatistica/sead/odsele/eleitorado_locais_votacao/eleitorado_local_votacao_2026.zip"
SPEC="/tmp/tse2026/spec/bu.asn1"
CONCURRENCY=max(1,int(os.environ.get("TSE_SECTION_CONCURRENCY","10")))
DB=os.environ["DATABASE_URL"]
OFFICE_MAP={"presidente":1,"governador":3,"senador":5,"deputadoFederal":6,"deputadoEstadual":7,"deputadoDistrital":8}
UA={"User-Agent":"Mozilla/5.0"}

def fetch_bytes(url, retries=3):
    last=None
    for attempt in range(retries):
        try:
            req=urllib.request.Request(url,headers=UA)
            with urllib.request.urlopen(req,timeout=40) as r: return r.read()
        except Exception as e:
            last=e; time.sleep(min(1.5*(attempt+1),4))
    raise last

def fetch_json(url):
    return json.loads(fetch_bytes(url).decode("utf-8"))

def dec(v):
    if v is None or v=="": return None
    s=str(v).strip().replace(",",".")
    if s.startswith("-."): s="-0"+s[1:]
    if s.startswith("."): s="0"+s
    try: return float(s)
    except: return None

def load_places(conn):
    print("PLACES_DOWNLOAD="+UF,flush=True)
    data=fetch_bytes(LOC_URL)
    z=zipfile.ZipFile(io.BytesIO(data))
    name=f"eleitorado_local_votacao_2026_{UF}.csv"
    raw=z.read(name).decode("latin1")
    reader=csv.DictReader(io.StringIO(raw),delimiter=";",quotechar='"')
    rows=[]
    for r in reader:
        if r.get("SG_UF","").upper()!=UF: continue
        rows.append((
            UF, r["CD_MUNICIPIO"].strip(), r["NM_MUNICIPIO"].strip(), int(r["NR_ZONA"]), int(r["NR_SECAO"]),
            r["NR_LOCAL_VOTACAO"].strip(), r["NM_LOCAL_VOTACAO"].strip(), r["DS_ENDERECO"].strip(),
            (r.get("NM_BAIRRO") or "").strip(), (r.get("NR_CEP") or "").strip(), dec(r.get("NR_LATITUDE")), dec(r.get("NR_LONGITUDE"))
        ))
    with conn.cursor() as cur:
        cur.execute("DELETE FROM places WHERE uf=%s",(UF,))
        with cur.copy("""COPY places (uf,municipality_code,municipality_name,zone,section,polling_place_code,polling_place_name,address,neighborhood,cep,latitude,longitude) FROM STDIN""") as cp:
            for row in rows: cp.write_row(row)
    conn.commit()
    print("PLACES_IMPORTED="+str(len(rows)),flush=True)
    return { (r[1],r[3],r[4]): r[5] for r in rows }

def cargo_code(value):
    if isinstance(value,(list,tuple)) and len(value)>1: return OFFICE_MAP.get(str(value[1]))
    if isinstance(value,str): return OFFICE_MAP.get(value)
    return None

def section_job(conv, municipality_code, municipality_name, zone, section):
    m=str(municipality_code).zfill(5); z=str(zone).zfill(4); s=str(section).zfill(4); uf=UF.lower()
    aux_url=f"{BASE}/dados/{uf}/{m}/{z}/{s}/p{PLEITO:06d}-{uf}-m{m}-z{z}-s{s}-aux.json"
    try: aux=fetch_json(aux_url)
    except Exception as e: return ("skip",municipality_code,zone,section,str(e),[])
    hashes=aux.get("hashes") or []
    chosen=None
    for h in hashes:
        if any((a.get("tp")=="bu") for a in (h.get("arq") or [])): chosen=h; break
    if not chosen: return ("skip",municipality_code,zone,section,"sem BU",[])
    bu=next(a for a in chosen.get("arq",[]) if a.get("tp")=="bu")
    bu_url=f"{BASE}/dados/{uf}/{m}/{z}/{s}/{chosen['hash']}/{bu['nm']}"
    try:
        raw=fetch_bytes(bu_url)
        env=conv.decode("EntidadeEnvelopeGenerico",raw)
        decoded=conv.decode("EntidadeBoletimUrna",env["conteudo"])
    except Exception as e: return ("skip",municipality_code,zone,section,"decode "+str(e),[])
    ident_sec=decoded.get("identificacaoSecao") or {}
    local=str(ident_sec.get("local") or "")
    out=[]
    for eleicao in decoded.get("resultadosVotacaoPorEleicao",[]) or []:
        for resultado in eleicao.get("resultadosVotacao",[]) or []:
            for total in resultado.get("totaisVotosCargo",[]) or []:
                office=cargo_code(total.get("codigoCargo"))
                if office not in (1,3,5,6,7,8): continue
                election=6257 if office==1 else 6259
                for voto in total.get("votosVotaveis",[]) or []:
                    if voto.get("tipoVoto")!="nominal": continue
                    ident=voto.get("identificacaoVotavel") or {}
                    num=ident.get("codigo")
                    q=int(voto.get("quantidadeVotos") or 0)
                    if num is None or q<=0: continue
                    out.append((election,1,office,UF,str(municipality_code),municipality_name,int(zone),int(section),local,str(num),str(ident.get("partido") or ""),q,bu.get("nm")))
    return ("ok",municipality_code,zone,section,local,out)

def main():
    conv=asn1tools.compile_files(SPEC,codec="ber")
    conn=psycopg.connect(DB)
    conn.execute("""CREATE TABLE IF NOT EXISTS section_vote_raw (election_id INTEGER NOT NULL,round INTEGER NOT NULL DEFAULT 1,office_code INTEGER NOT NULL,uf CHAR(2) NOT NULL,municipality_code TEXT NOT NULL,municipality_name TEXT,zone INTEGER NOT NULL,section INTEGER NOT NULL,polling_place_code TEXT NOT NULL DEFAULT '',candidate_number TEXT NOT NULL,party_number TEXT,votes INTEGER NOT NULL,source_file TEXT,source_updated_at TIMESTAMPTZ NOT NULL DEFAULT now())""")
    conn.execute("CREATE INDEX IF NOT EXISTS section_vote_raw_scope_idx ON section_vote_raw(uf,municipality_code,zone,section)")
    conn.commit()
    load_places(conn)
    cfg=fetch_json(f"{BASE}/config/{UF.lower()}/{UF.lower()}-p{PLEITO:06d}-cs.json")
    root=(cfg.get("abr") or [{}])[0]
    tasks=[]
    for m in root.get("mu",[]) or []:
        mc=str(m.get("cd")); mn=str(m.get("nm") or "")
        for z in m.get("zon",[]) or []:
            zn=int(z.get("cd"))
            for sec in z.get("sec",[]) or []:
                sn=int(sec.get("ns"))
                tasks.append((mc,mn,zn,sn))
    print("SECTIONS_TOTAL="+str(len(tasks)),flush=True)
    conn.execute("DELETE FROM section_vote_raw WHERE uf=%s",(UF,))
    conn.execute("DELETE FROM vote_facts WHERE uf=%s AND source_kind='tse_section_bu'",(UF,))
    conn.commit()
    buffer=[]; done=0; skipped=0; vote_rows=0
    lock=threading.Lock()
    def flush():
        nonlocal buffer,vote_rows
        if not buffer: return
        with conn.cursor() as cur:
            with cur.copy("""COPY section_vote_raw (election_id,round,office_code,uf,municipality_code,municipality_name,zone,section,polling_place_code,candidate_number,party_number,votes,source_file) FROM STDIN""") as cp:
                for row in buffer: cp.write_row(row)
        vote_rows += len(buffer); buffer=[]; conn.commit()
    with ThreadPoolExecutor(max_workers=CONCURRENCY) as ex:
        futures=[ex.submit(section_job,conv,*t) for t in tasks]
        for fut in as_completed(futures):
            res=fut.result(); done+=1
            if res[0]=="ok": buffer.extend(res[5])
            else: skipped+=1
            if len(buffer)>=25000: flush()
            if done%100==0: print(f"PROGRESS={done}/{len(tasks)} raw={vote_rows+len(buffer)} skipped={skipped}",flush=True)
    flush()
    print("RAW_ROWS="+str(vote_rows)+" SKIPPED="+str(skipped),flush=True)
    with conn.cursor() as cur:
        cur.execute("""
          INSERT INTO vote_facts (election_id,round,office_code,candidate_id,uf,municipality_code,municipality_name,neighborhood,zone,section,polling_place_code,votes,source_kind,source_file,source_updated_at)
          SELECT r.election_id,r.round,r.office_code,c.id,r.uf,r.municipality_code,r.municipality_name,COALESCE(p.neighborhood,''),r.zone,r.section,r.polling_place_code,r.votes,'tse_section_bu',r.source_file,now()
          FROM section_vote_raw r
          JOIN LATERAL (
            SELECT c0.id FROM candidates c0
            WHERE c0.election_id=r.election_id AND c0.office_code=r.office_code AND c0.number=r.candidate_number
              AND ((r.office_code=1 AND c0.uf='BR') OR (r.office_code<>1 AND c0.uf=r.uf))
            ORDER BY c0.id LIMIT 1
          ) c ON true
          LEFT JOIN places p ON p.uf=r.uf AND p.municipality_code=r.municipality_code AND p.zone=r.zone AND p.section=r.section AND p.polling_place_code=r.polling_place_code
          ON CONFLICT (election_id,round,office_code,candidate_id,uf,municipality_code,neighborhood,zone,section,polling_place_code,source_kind)
          DO UPDATE SET votes=EXCLUDED.votes,source_file=EXCLUDED.source_file,source_updated_at=now()
        """)
        merged=cur.rowcount
    conn.commit()
    print("MERGED_ROWS="+str(merged),flush=True)
    with conn.cursor() as cur:
        cur.execute("""SELECT c.number,c.ballot_name,COUNT(*) AS sections,SUM(v.votes) AS votes FROM vote_facts v JOIN candidates c ON c.id=v.candidate_id WHERE v.uf=%s AND v.source_kind='tse_section_bu' AND c.office_code=7 AND c.number='22190' GROUP BY c.number,c.ballot_name""",(UF,))
        print("CHECK_22190="+json.dumps(cur.fetchall(),ensure_ascii=False,default=str),flush=True)
    conn.close()

if __name__=="__main__": main()
