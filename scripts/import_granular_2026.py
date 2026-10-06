#!/usr/bin/env python3
import csv, io, json, os, sys, time, urllib.request, zipfile, threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any
import asn1tools
import psycopg

BASE="https://resultados.tse.jus.br/oficial/ele2026/arquivo-urna/3220"
PLACES_URL="https://cdn.tse.jus.br/estatistica/sead/odsele/eleitorado_locais_votacao/eleitorado_local_votacao_2026.zip"
UF_LIST=[x.strip().upper() for x in os.getenv("IMPORT_UFS","ES").split(",") if x.strip()]
IMPORT_PLACES=os.getenv("IMPORT_PLACES","true").lower()=="true"
IMPORT_SECTIONS=os.getenv("IMPORT_SECTIONS","true").lower()=="true"
RPS=max(1,float(os.getenv("TSE_RPS","8")))
SLEEP=1.0/RPS
SECTION_CONCURRENCY=max(1,int(os.getenv("SECTION_CONCURRENCY","12")))
_rate_lock=threading.Lock()
_next_request=[0.0]
SECTION_LIMIT=max(0,int(os.getenv("SECTION_LIMIT","0")))
SPEC=os.getenv("BU_SPEC","spec/bu-v2.asn1")
CORE_DATABASE_URL=os.environ["DATABASE_URL"]
SECTIONS_DATABASE_URL=os.environ.get("SECTIONS_DATABASE_URL",CORE_DATABASE_URL)

CARGO_MAP={
 "presidente":1,"vicePresidente":2,"governador":3,"viceGovernador":4,
 "senador":5,"deputadoFederal":6,"deputadoEstadual":7,"deputadoDistrital":8,
 "primeiroSuplenteSenador":9,"segundoSuplenteSenador":10,
 "prefeito":11,"vicePrefeito":12,"vereador":13
}

def fetch(url:str, binary=False):
    last=None
    for attempt in range(5):
        with _rate_lock:
            now=time.monotonic()
            when=max(now,_next_request[0])
            _next_request[0]=when+SLEEP
        if when>now:
            time.sleep(when-now)
        try:
            req=urllib.request.Request(url,headers={"User-Agent":"siga-o-voto/1.0"})
            with urllib.request.urlopen(req, timeout=60) as r:
                data=r.read()
                return data if binary else data.decode("utf-8")
        except Exception as e:
            last=e
            if "HTTP Error 404" in str(e):
                return None
            time.sleep(min(5,attempt+1))
    raise last

def as_int(v, default=0):
    try:return int(v)
    except:return default

def choice_value(v):
    if isinstance(v,tuple) and len(v)==2:return v[1]
    return v

def cargo_code(v):
    v=choice_value(v)
    if isinstance(v,str): return CARGO_MAP.get(v,0)
    return as_int(v)

def tipo_nome(v):
    v=choice_value(v)
    return str(v)

def norm_num(v):
    s=str(v or "").strip()
    try:return str(int(s))
    except:return s.lstrip("0") or "0"

def ensure_schema(conn):
    ddl="""
    CREATE TABLE IF NOT EXISTS places (
      id BIGSERIAL PRIMARY KEY,
      uf CHAR(2) NOT NULL,
      municipality_code TEXT NOT NULL,
      municipality_name TEXT NOT NULL,
      zone INTEGER NOT NULL DEFAULT -1,
      section INTEGER NOT NULL DEFAULT -1,
      polling_place_code TEXT NOT NULL DEFAULT '',
      polling_place_name TEXT,
      address TEXT,
      neighborhood TEXT NOT NULL DEFAULT '',
      cep TEXT,
      latitude NUMERIC(9,6),
      longitude NUMERIC(9,6),
      UNIQUE (uf, municipality_code, zone, section, polling_place_code)
    );
    CREATE INDEX IF NOT EXISTS places_municipality_idx ON places(uf, municipality_code);
    CREATE INDEX IF NOT EXISTS places_neighborhood_idx ON places(uf, municipality_name, neighborhood);
    CREATE INDEX IF NOT EXISTS places_section_idx ON places(uf, municipality_code, zone, section);
    CREATE TABLE IF NOT EXISTS section_votes (
      id BIGSERIAL PRIMARY KEY,
      election_id INTEGER NOT NULL,
      round INTEGER NOT NULL DEFAULT 1,
      office_code INTEGER NOT NULL,
      uf CHAR(2) NOT NULL,
      municipality_code TEXT NOT NULL,
      municipality_name TEXT,
      zone INTEGER NOT NULL,
      section INTEGER NOT NULL,
      polling_place_code TEXT NOT NULL DEFAULT '',
      candidate_number TEXT NOT NULL,
      party_number TEXT,
      votes INTEGER NOT NULL CHECK(votes>=0),
      source_file TEXT,
      source_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(election_id,round,office_code,uf,municipality_code,zone,section,polling_place_code,candidate_number)
    );
    CREATE INDEX IF NOT EXISTS sv_candidate_idx ON section_votes(uf,office_code,candidate_number);
    CREATE INDEX IF NOT EXISTS sv_municipality_idx ON section_votes(uf,office_code,candidate_number,municipality_code);
    CREATE INDEX IF NOT EXISTS sv_section_idx ON section_votes(uf,municipality_code,zone,section);
    """
    with conn.cursor() as cur:
        cur.execute(ddl)
    conn.commit()

def load_candidate_map(conn):
    out={}
    with conn.cursor() as cur:
        cur.execute("""SELECT election_id,office_code,uf,number,party_number FROM candidates
                       WHERE uf = ANY(%s)""",(UF_LIST,))
        for eid,office,uf,num,party in cur.fetchall():
            out[(int(eid),int(office),str(uf).upper(),norm_num(num))]=str(party or "")
    return out

def import_places(conn):
    print("PLACES_DOWNLOAD_START")
    raw=fetch(PLACES_URL,True)
    if not raw: raise RuntimeError("Falha ao baixar locais de votação")
    z=zipfile.ZipFile(io.BytesIO(raw))
    names=[n for n in z.namelist() if n.lower().endswith(".csv")]
    if not names: raise RuntimeError("ZIP sem CSV")
    total=0
    batch=[]
    sql="""INSERT INTO places
      (uf,municipality_code,municipality_name,zone,section,polling_place_code,
       polling_place_name,address,neighborhood,cep,latitude,longitude)
      VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
      ON CONFLICT (uf,municipality_code,zone,section,polling_place_code)
      DO UPDATE SET municipality_name=EXCLUDED.municipality_name,
        polling_place_name=EXCLUDED.polling_place_name,address=EXCLUDED.address,
        neighborhood=EXCLUDED.neighborhood,cep=EXCLUDED.cep,
        latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude"""
    with z.open(names[0]) as f:
        wrapper=io.TextIOWrapper(f,encoding="latin-1",newline="")
        reader=csv.DictReader(wrapper,delimiter=";")
        for row in reader:
            uf=(row.get("SG_UF") or "").strip().upper()
            if uf not in UF_LIST: continue
            def val(k): return (row.get(k) or "").strip().strip('"')
            lat=val("NR_LATITUDE").replace(",",".")
            lon=val("NR_LONGITUDE").replace(",",".")
            batch.append((
                uf,val("CD_MUNICIPIO"),val("NM_MUNICIPIO"),as_int(val("NR_ZONA"),-1),
                as_int(val("NR_SECAO"),-1),val("NR_LOCAL_VOTACAO"),val("NM_LOCAL_VOTACAO"),
                val("DS_ENDERECO"),val("NM_BAIRRO"),val("NR_CEP"),
                float(lat) if lat not in ("","#NULO","#NE","-1","-3") else None,
                float(lon) if lon not in ("","#NULO","#NE","-1","-3") else None
            ))
            if len(batch)>=1000:
                with conn.cursor() as cur: cur.executemany(sql,batch)
                conn.commit(); total+=len(batch); batch=[]
                if total%10000==0: print("PLACES_PROGRESS="+str(total),flush=True)
    if batch:
        with conn.cursor() as cur: cur.executemany(sql,batch)
        conn.commit(); total+=len(batch)
    print("PLACES_DONE="+str(total),flush=True)
    return total

def sections_for_uf(uf):
    lower=uf.lower()
    url=f"{BASE}/config/{lower}/{lower}-p003220-cs.json"
    data=json.loads(fetch(url))
    out=[]
    for coverage in data.get("abr",[]):
        for m in coverage.get("mu",[]):
            for z in m.get("zon",[]):
                for s in z.get("sec",[]):
                    if s.get("nsp"): continue
                    out.append({
                        "uf":uf,
                        "municipality":str(m.get("cd","")).zfill(5),
                        "municipality_name":m.get("nm",""),
                        "zone":str(z.get("cd","")).zfill(4),
                        "section":str(s.get("ns","")).zfill(4),
                        "aggregated":s.get("nsa",[]) or []
                    })
    return out

def fetch_bu(sec):
    uf=sec["uf"].lower(); m=sec["municipality"]; z=sec["zone"]; s=sec["section"]
    base=f"{BASE}/dados/{uf}/{m}/{z}/{s}"
    aux_name=f"p003220-{uf}-m{m}-z{z}-s{s}-aux.json"
    aux_raw=fetch(f"{base}/{aux_name}")
    if not aux_raw:return None,None
    aux=json.loads(aux_raw)
    entries=aux.get("hashes",[]) or []
    entries.sort(key=lambda x:(x.get("dr",""),x.get("hr","")), reverse=True)
    for e in entries:
        files=e.get("arq",[]) or []
        bu=next((x for x in files if x.get("tp") in ("bu","busa")),None)
        if bu:
            raw=fetch(f"{base}/{e.get('hash')}/{bu.get('nm')}",True)
            if raw:return raw,bu.get("nm")
    return None,None

def decode_bu(codec, raw):
    env=codec.decode("EntidadeEnvelopeGenerico",raw)
    bu=codec.decode("EntidadeBoletimUrna",env["conteudo"])
    return env,bu

def import_sections(conn, candidate_map):
    codec=asn1tools.compile_files(SPEC,codec="ber")
    insert_sql="""INSERT INTO section_votes
      (election_id,office_code,uf,municipality_code,municipality_name,
       zone,section,polling_place_code,candidate_number,party_number,votes,source_file,source_updated_at)
      VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,now())
      ON CONFLICT (election_id,round,office_code,uf,municipality_code,zone,section,polling_place_code,candidate_number)
      DO UPDATE SET votes=EXCLUDED.votes,party_number=EXCLUDED.party_number,
        source_file=EXCLUDED.source_file,source_updated_at=now()"""

    def process_one(sec):
        try:
            raw,filename=fetch_bu(sec)
            if not raw:
                return {"missing":1,"unknown":0,"rows":[]}
            env,bu=decode_bu(codec,raw)
            ident=bu.get("identificacaoSecao",{}) or {}
            local=str(ident.get("localVotacao") or "")
            rows=[]; unknown=0
            for election in bu.get("resultadosVotacaoPorEleicao",[]) or []:
                eid=as_int(election.get("idEleicao"))
                for rv in election.get("resultadosVotacao",[]) or []:
                    for totals in rv.get("totaisVotosCargo",[]) or []:
                        office=cargo_code(totals.get("codigoCargo"))
                        app_office=7 if office==8 else office
                        if app_office not in (1,3,5,6,7): continue
                        for vv in totals.get("votosVotaveis",[]) or []:
                            t=tipo_nome(vv.get("tipoVoto")).lower()
                            if "nominal" not in t and t!="1": continue
                            identv=vv.get("identificacaoVotavel",{}) or {}
                            num=norm_num(identv.get("codigo"))
                            votes=as_int(vv.get("quantidadeVotos"))
                            key=(eid,app_office,sec["uf"],num)
                            party=candidate_map.get(key)
                            if party is None:
                                unknown+=1
                                party=norm_num(identv.get("partido")) if identv.get("partido") is not None else ""
                            rows.append((eid,app_office,sec["uf"],sec["municipality"],sec["municipality_name"],
                                         as_int(sec["zone"]),as_int(sec["section"]),local,num,party,votes,filename))
            return {"missing":0,"unknown":unknown,"rows":rows}
        except Exception as e:
            return {"missing":1,"unknown":0,"rows":[],"error":str(e),"sec":sec}

    total_sections=0; total_rows=0; missing=0; unknown=0
    for uf in UF_LIST:
        sections=sections_for_uf(uf)
        if SECTION_LIMIT: sections=sections[:SECTION_LIMIT]
        print(f"SECTIONS_INDEX_{uf}={len(sections)} concurrency={SECTION_CONCURRENCY} rps={RPS}",flush=True)
        with ThreadPoolExecutor(max_workers=SECTION_CONCURRENCY) as executor:
            futures={executor.submit(process_one,sec):sec for sec in sections}
            pending_rows=[]
            for idx,future in enumerate(as_completed(futures),1):
                result=future.result()
                missing+=result.get("missing",0)
                unknown+=result.get("unknown",0)
                if result.get("error"):
                    sec=result.get("sec",{})
                    print("SECTION_ERROR="+json.dumps({"uf":uf,"m":sec.get("municipality"),"z":sec.get("zone"),"s":sec.get("section"),"error":result["error"]},ensure_ascii=False),flush=True)
                rows=result.get("rows",[])
                if rows:
                    pending_rows.extend(rows)
                    total_rows+=len(rows)
                total_sections+=1
                if len(pending_rows)>=5000 or idx%100==0 or idx==len(sections):
                    if pending_rows:
                        with conn.cursor() as cur: cur.executemany(insert_sql,pending_rows)
                        pending_rows=[]
                    conn.commit()
                if idx%100==0 or idx==len(sections):
                    print(f"SECTION_PROGRESS_{uf}={idx}/{len(sections)} rows={total_rows} missing={missing} unknown={unknown}",flush=True)
    print("SECTIONS_DONE="+json.dumps({"sections":total_sections,"rows":total_rows,"missing":missing,"unknown":unknown}),flush=True)
    return total_rows

def verify_granular(conn):
    with conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM places WHERE uf='ES'")
        places_count=cur.fetchone()[0]
        cur.execute("SELECT count(*) FROM section_votes WHERE uf='ES'")
        votes_count=cur.fetchone()[0]
        cur.execute("""
          SELECT count(*) FROM section_votes sv
          JOIN places p ON p.uf=sv.uf AND p.municipality_code=sv.municipality_code
            AND p.zone=sv.zone AND p.section=sv.section
        """)
        joined_loose=cur.fetchone()[0]
        cur.execute("""
          SELECT count(*) FROM section_votes sv
          JOIN places p ON p.uf=sv.uf AND p.municipality_code=sv.municipality_code
            AND p.zone=sv.zone AND p.section=sv.section
            AND p.polling_place_code=sv.polling_place_code
        """)
        joined_exact=cur.fetchone()[0]
        cur.execute("""
          SELECT count(*) FROM section_votes
          WHERE uf='ES' AND office_code=7 AND candidate_number='22190'
        """)
        cand_rows=cur.fetchone()[0]
        cur.execute("""
          SELECT COALESCE(sum(votes),0) FROM section_votes
          WHERE uf='ES' AND office_code=7 AND candidate_number='22190'
        """)
        cand_votes=cur.fetchone()[0]
        cur.execute("""
          SELECT sv.municipality_name,sv.zone,sv.section,sv.polling_place_code,sv.candidate_number,sv.votes,
                 p.polling_place_code,p.polling_place_name,p.address,p.neighborhood
          FROM section_votes sv
          LEFT JOIN places p ON p.uf=sv.uf AND p.municipality_code=sv.municipality_code
            AND p.zone=sv.zone AND p.section=sv.section
            AND p.polling_place_code=sv.polling_place_code
          WHERE sv.uf='ES' AND sv.office_code=7 AND sv.candidate_number='22190'
          ORDER BY sv.votes DESC LIMIT 1
        """)
        sample=cur.fetchone()
    print("GRANULAR_VERIFY="+json.dumps({
      "places":places_count,"vote_rows":votes_count,
      "joined_loose":joined_loose,"joined_exact":joined_exact,
      "candidate_22190_rows":cand_rows,"candidate_22190_votes":cand_votes,
      "sample_22190":sample
    },ensure_ascii=False,default=str),flush=True)

def main():
    print("GRANULAR_IMPORT_START="+json.dumps({"ufs":UF_LIST,"places":IMPORT_PLACES,"sections":IMPORT_SECTIONS}),flush=True)
    with psycopg.connect(CORE_DATABASE_URL) as core_conn:
        candidate_map=load_candidate_map(core_conn)
        print("CANDIDATE_MAP="+str(len(candidate_map)),flush=True)
    with psycopg.connect(SECTIONS_DATABASE_URL) as sections_conn:
        ensure_schema(sections_conn)
        places=import_places(sections_conn) if IMPORT_PLACES else 0
        rows=import_sections(sections_conn,candidate_map) if IMPORT_SECTIONS else 0
        print("GRANULAR_IMPORT_DONE="+json.dumps({"places":places,"vote_rows":rows}),flush=True)
        verify_granular(sections_conn)

if __name__=="__main__":
    main()
