import { pool, sql } from "../src/db/index.js";

try {
  const counts = await sql<any>(`
    SELECT
      (SELECT count(*) FROM candidates)::int AS candidates,
      (SELECT count(*) FROM vote_facts)::int AS vote_facts,
      (SELECT count(DISTINCT municipality_code) FROM vote_facts WHERE municipality_code<>'')::int AS municipalities
  `);

  const matches = await sql<any>(`
    SELECT id,election_id,office_code,office_name,uf,number,ballot_name,full_name,party_abbr,status
    FROM candidates
    WHERE ballot_name ILIKE '%ASSUM%'
       OR full_name ILIKE '%ASSUM%'
       OR number IN ('22190','2219','2190')
    ORDER BY uf,office_code,ballot_name
    LIMIT 100
  `);

  console.log(JSON.stringify({counts:counts.rows[0],matches:matches.rows}, null, 2));
} finally {
  await pool.end();
}
