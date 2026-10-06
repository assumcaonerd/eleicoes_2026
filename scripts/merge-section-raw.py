import os, time, json
import psycopg

DB=os.environ["DATABASE_URL"]
UF=os.environ.get("TSE_IMPORT_UF","ES").upper()

SQL="""
INSERT INTO vote_facts (
  election_id,round,office_code,candidate_id,uf,municipality_code,municipality_name,
  neighborhood,zone,section,polling_place_code,votes,source_kind,source_file,source_updated_at
)
SELECT
  r.election_id,r.round,r.office_code,c.id,r.uf,r.municipality_code,r.municipality_name,
  COALESCE(p.neighborhood,''),r.zone,r.section,r.polling_place_code,r.votes,
  'tse_section_bu',r.source_file,now()
FROM section_vote_raw r
JOIN LATERAL (
  SELECT c0.id
  FROM candidates c0
  WHERE c0.election_id=r.election_id
    AND c0.office_code=r.office_code
    AND c0.number=r.candidate_number
    AND ((r.office_code=1 AND c0.uf='BR') OR (r.office_code<>1 AND c0.uf=r.uf))
  ORDER BY c0.id
  LIMIT 1
) c ON true
LEFT JOIN places p
  ON p.uf=r.uf
 AND p.municipality_code=r.municipality_code
 AND p.zone=r.zone
 AND p.section=r.section
 AND p.polling_place_code=r.polling_place_code
WHERE r.uf=%s AND r.municipality_code=%s
ON CONFLICT (
  election_id,round,office_code,candidate_id,uf,municipality_code,neighborhood,
  zone,section,polling_place_code,source_kind
)
DO UPDATE SET
  votes=EXCLUDED.votes,
  source_file=EXCLUDED.source_file,
  source_updated_at=now()
"""

def connect():
    return psycopg.connect(DB, connect_timeout=30)

def main():
    conn=connect()
    with conn.cursor() as cur:
        cur.execute("SELECT DISTINCT municipality_code FROM section_vote_raw WHERE uf=%s ORDER BY municipality_code",(UF,))
        municipalities=[r[0] for r in cur.fetchall()]
        cur.execute("SELECT COUNT(*) FROM section_vote_raw WHERE uf=%s",(UF,))
        raw=cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM places WHERE uf=%s",(UF,))
        places=cur.fetchone()[0]
    conn.close()
    print("MERGE_START="+json.dumps({"uf":UF,"municipalities":len(municipalities),"raw":raw,"places":places}),flush=True)

    merged=0
    for i,mc in enumerate(municipalities,1):
        ok=False
        for attempt in range(1,5):
            conn=None
            try:
                conn=connect()
                with conn.cursor() as cur:
                    cur.execute(SQL,(UF,mc))
                    n=cur.rowcount
                conn.commit()
                merged += max(n,0)
                ok=True
                break
            except Exception as e:
                if conn:
                    try: conn.rollback()
                    except: pass
                print(f"RETRY municipality={mc} attempt={attempt} error={e}",flush=True)
                time.sleep(min(attempt*2,8))
            finally:
                if conn:
                    try: conn.close()
                    except: pass
        if not ok:
            raise RuntimeError(f"Falha ao consolidar município {mc}")
        if i%10==0 or i==len(municipalities):
            print(f"MERGE_PROGRESS={i}/{len(municipalities)} affected={merged}",flush=True)

    conn=connect()
    with conn.cursor() as cur:
        cur.execute("""
          SELECT COUNT(*)::int,COALESCE(SUM(v.votes),0)::int
          FROM vote_facts v
          JOIN candidates c ON c.id=v.candidate_id
          WHERE v.uf=%s AND v.source_kind='tse_section_bu'
            AND c.office_code=7 AND c.number='22190'
        """,(UF,))
        sections,votes=cur.fetchone()
        cur.execute("""
          SELECT COUNT(DISTINCT p.neighborhood)::int,
                 COUNT(DISTINCT p.polling_place_code)::int,
                 COUNT(*)::int
          FROM places p WHERE p.uf=%s
        """,(UF,))
        neighborhoods,locations,place_rows=cur.fetchone()
    conn.close()
    print("MERGE_DONE="+json.dumps({
      "affected":merged,
      "candidate_22190":{"section_rows":sections,"votes":votes},
      "places":{"rows":place_rows,"neighborhoods":neighborhoods,"locations":locations}
    },ensure_ascii=False),flush=True)

if __name__=="__main__":
    main()
