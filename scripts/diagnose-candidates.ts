import { pool, sql } from "../src/db/index.js";

try {
  const rows = await sql<any>(`
    SELECT c.id,c.election_id,c.office_code,c.office_name,c.uf,c.number,c.ballot_name,c.full_name,c.party_abbr,c.status,
      (SELECT count(*)::int FROM vote_facts v WHERE v.candidate_id=c.id) AS fact_rows,
      (SELECT COALESCE(MAX(v.votes),0)::int FROM vote_facts v
       WHERE v.candidate_id=c.id AND v.municipality_code='' AND v.zone=-1) AS total_votes,
      (SELECT count(DISTINCT v.municipality_code)::int FROM vote_facts v
       WHERE v.candidate_id=c.id AND v.municipality_code<>'') AS municipalities
    FROM candidates c
    WHERE c.uf='ES' AND c.office_code=7
      AND (c.number='22190' OR c.ballot_name ILIKE '%ASSUM%' OR c.full_name ILIKE '%ASSUM%')
    ORDER BY c.number,c.ballot_name
  `);
  console.log("DIAG="+JSON.stringify(rows.rows));
} finally {
  await pool.end();
}
