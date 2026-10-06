import os,urllib.request,zipfile,io,psycopg,traceback
try:
 print("START",flush=True)
 db=os.environ.get("SECTIONS_DATABASE_URL")
 print("HAS_DB="+str(bool(db)),flush=True)
 conn=psycopg.connect(db,connect_timeout=20)
 print("DB_OK",flush=True)
 with conn.cursor() as cur:
  cur.execute("SELECT current_database()")
  print("DB_NAME="+str(cur.fetchone()[0]),flush=True)
 conn.close()
 url="https://cdn.tse.jus.br/estatistica/sead/odsele/eleitorado_locais_votacao/eleitorado_local_votacao_2026.zip"
 print("FETCH="+url,flush=True)
 req=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0"})
 with urllib.request.urlopen(req,timeout=60) as r:
  data=r.read()
 print("ZIP_BYTES="+str(len(data)),flush=True)
 z=zipfile.ZipFile(io.BytesIO(data))
 names=z.namelist()
 print("ZIP_FILES="+str(len(names)),flush=True)
 print("ES_MATCH="+str([n for n in names if n.lower().endswith("_es.csv")][:10]),flush=True)
except Exception:
 traceback.print_exc()
 raise
