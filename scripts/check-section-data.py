import os, json, psycopg
conn=psycopg.connect(os.environ["DATABASE_URL"])
with conn.cursor() as cur:
    cur.execute("SELECT COUNT(*) FROM section_vote_raw WHERE uf='ES'")
    raw=cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM vote_facts WHERE uf='ES' AND source_kind='tse_section_bu'")
    merged=cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM places WHERE uf='ES'")
    places=cur.fetchone()[0]
    cur.execute("SELECT COUNT(DISTINCT neighborhood) FROM places WHERE uf='ES' AND neighborhood<>''")
    neighborhoods=cur.fetchone()[0]
    cur.execute("SELECT COUNT(DISTINCT polling_place_code) FROM places WHERE uf='ES' AND polling_place_code<>''")
    locations=cur.fetchone()[0]
    cur.execute("""
      SELECT c.id,c.ballot_name,c.number,COUNT(*)::int AS rows,
             COUNT(DISTINCT (v.municipality_code,v.zone,v.section))::int AS sections,
             SUM(v.votes)::int AS votes,
             COUNT(DISTINCT NULLIF(v.neighborhood,''))::int AS neighborhoods,
             COUNT(DISTINCT NULLIF(v.polling_place_code,''))::int AS locations
      FROM vote_facts v JOIN candidates c ON c.id=v.candidate_id
      WHERE v.uf='ES' AND v.source_kind='tse_section_bu'
        AND c.office_code=7 AND c.number='22190'
      GROUP BY c.id,c.ballot_name,c.number
    """)
    cand=cur.fetchall()
print("CHECK="+json.dumps({"raw":raw,"merged":merged,"places":places,"neighborhoods":neighborhoods,"locations":locations,"candidate":cand},ensure_ascii=False,default=str),flush=True)
conn.close()
