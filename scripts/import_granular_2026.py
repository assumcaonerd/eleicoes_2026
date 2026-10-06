#!/usr/bin/env python3
import csv, io, json, os, sys, time, urllib.request, zipfile
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
SPEC=os.getenv("BU_SPEC","spec/bu-v2.asn1")
DATABASE_URL=os.environ["DATABASE_URL"]

CARGO_MAP={
 "presidente":1,"vicePresidente":2,"governador":3,"viceGovernador":4,
 "senador":5,"deputadoFederal":6,"deputadoEstadual":7,"deputadoDistrital":8,
 "primeiroSuplenteSenador":9,"segundoSuplenteSenador":10,
 "prefeito":11,"vicePrefeito":12,"vereador":13
}

def fetch(url:str, binary=False):
    last=None
    for attempt in range(5):
        try:
            req=urllib.request.Request(url,headers={"User-Agent":"siga-o-voto/1.0"})
            with urllib.request.urlopen(req, timeout=60) as r:
                data=r.read()
                time.sleep(SLEEP)
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

def load_candidate_map(conn):
    out={}
    with conn.cursor() as cur:
        cur.execute("""SELECT id,election_id,office_code,uf,number FROM candidates
                       WHERE uf = ANY(%s)""",(UF_LIST,))
        for cid,eid,office,uf,num in cur.fetchall():
            out[(int(eid),int(office),str(uf).upper(),norm_num(num))]=int(cid)
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

def import_sections(conn):
    codec=asn1tools.compile_files(SPEC,codec="ber")
    cmap=load_candidate_map(conn)
    insert_sql="""INSERT INTO vote_facts
      (election_id,office_code,candidate_id,uf,municipality_code,municipality_name,
       zone,section,polling_place_code,votes,source_kind,source_file,source_updated_at)
      VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'tse_section_bu',%s,now())
      ON CONFLICT (election_id,round,office_code,candidate_id,uf,
        municipality_code,neighborhood,zone,section,polling_place_code,source_kind)
      DO UPDATE SET votes=EXCLUDED.votes,source_file=EXCLUDED.source_file,source_updated_at=now()"""
    total_sections=0; total_rows=0; missing=0; unknown=0
    for uf in UF_LIST:
        sections=sections_for_uf(uf)
        print(f"SECTIONS_INDEX_{uf}={len(sections)}",flush=True)
        for idx,sec in enumerate(sections,1):
            try:
                raw,filename=fetch_bu(sec)
                if not raw:
                    missing+=1; continue
                env,bu=decode_bu(codec,raw)
                ident=bu.get("identificacaoSecao",{}) or {}
                local=str(ident.get("localVotacao") or "")
                rows=[]
                for election in bu.get("resultadosVotacaoPorEleicao",[]) or []:
                    eid=as_int(election.get("idEleicao"))
                    for rv in election.get("resultadosVotacao",[]) or []:
                        for totals in rv.get("totaisVotosCargo",[]) or []:
                            office=cargo_code(totals.get("codigoCargo"))
                            if office not in (1,3,5,6,7,8): continue
                            for vv in totals.get("votosVotaveis",[]) or []:
                                t=tipo_nome(vv.get("tipoVoto")).lower()
                                if "nominal" not in t and t not in ("1","tipoVoto.nominal"): continue
                                identv=vv.get("identificacaoVotavel",{}) or {}
                                num=norm_num(identv.get("codigo"))
                                votes=as_int(vv.get("quantidadeVotos"))
                                cid=cmap.get((eid,office,uf,num))
                                if not cid:
                                    unknown+=1; continue
                                rows.append((eid,office,cid,uf,sec["municipality"],sec["municipality_name"],
                                             as_int(sec["zone"]),as_int(sec["section"]),local,votes,filename))
                if rows:
                    with conn.cursor() as cur: cur.executemany(insert_sql,rows)
                    total_rows+=len(rows)
                total_sections+=1
                if idx%100==0:
                    conn.commit()
                    print(f"SECTION_PROGRESS_{uf}={idx}/{len(sections)} rows={total_rows} missing={missing} unknown={unknown}",flush=True)
            except Exception as e:
                missing+=1
                print("SECTION_ERROR="+json.dumps({"uf":uf,"m":sec["municipality"],"z":sec["zone"],"s":sec["section"],"error":str(e)},ensure_ascii=False),flush=True)
        conn.commit()
    print("SECTIONS_DONE="+json.dumps({"sections":total_sections,"rows":total_rows,"missing":missing,"unknown":unknown}),flush=True)
    return total_rows

def main():
    print("GRANULAR_IMPORT_START="+json.dumps({"ufs":UF_LIST,"places":IMPORT_PLACES,"sections":IMPORT_SECTIONS}),flush=True)
    with psycopg.connect(DATABASE_URL) as conn:
        places=import_places(conn) if IMPORT_PLACES else 0
        rows=import_sections(conn) if IMPORT_SECTIONS else 0
        print("GRANULAR_IMPORT_DONE="+json.dumps({"places":places,"vote_rows":rows}),flush=True)

if __name__=="__main__":
    main()
