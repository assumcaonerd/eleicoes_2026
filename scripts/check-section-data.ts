import { pool, sql } from "../src/db/index.js";

const out:any={};
try {
  out.raw=Number((await sql<any>("SELECT COUNT(*)::bigint n FROM section_vote_raw WHERE uf='ES'")).rows[0]?.n??0);
  out.merged=Number((await sql<any>("SELECT COUNT(*)::bigint n FROM vote_facts WHERE uf='ES' AND source_kind='tse_section_bu'")).rows[0]?.n??0);
  out.places=Number((await sql<any>("SELECT COUNT(*)::bigint n FROM places WHERE uf='ES'")).rows[0]?.n??0);
  out.neighborhoods=Number((await sql<any>("SELECT COUNT(DISTINCT neighborhood)::int n FROM places WHERE uf='ES' AND neighborhood<>''")).rows[0]?.n??0);
  out.locations=Number((await sql<any>("SELECT COUNT(DISTINCT polling_place_code)::int n FROM places WHERE uf='ES' AND polling_place_code<>''")).rows[0]?.n??0);
  out.candidate=(await sql<any>(`
    SELECT c.id,c.ballot_name,c.number,
      COUNT(*)::int AS rows,
      COUNT(DISTINCT (v.municipality_code,v.zone,v.section))::int AS sections,
      COALESCE(SUM(v.votes),0)::int AS votes,
      COUNT(DISTINCT NULLIF(v.neighborhood,''))::int AS neighborhoods,
      COUNT(DISTINCT NULLIF(v.polling_place_code,''))::int AS locations
    FROM vote_facts v JOIN candidates c ON c.id=v.candidate_id
    WHERE v.uf='ES' AND v.source_kind='tse_section_bu'
      AND c.office_code=7 AND c.number='22190'
    GROUP BY c.id,c.ballot_name,c.number
  `)).rows;
  console.log("CHECK_SECTION_DATA="+JSON.stringify(out));
} finally {
  await pool.end();
}
