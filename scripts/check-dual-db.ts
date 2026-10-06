import { pool, sql } from "../src/db/index.js";
import { sectionsPool, sectionsSql } from "../src/db/sections.js";
try {
  const core:any={};
  try { core.candidates=Number((await sql<any>("SELECT COUNT(*)::bigint n FROM candidates")).rows[0]?.n??0); } catch(e:any){ core.error=e.message; }
  try { core.es22190=(await sql<any>("SELECT id,ballot_name,number,party_abbr FROM candidates WHERE uf='ES' AND office_code=7 AND number='22190' LIMIT 3")).rows; } catch{}
  const sections:any={};
  try { sections.places=Number((await sectionsSql<any>("SELECT COUNT(*)::bigint n FROM places")).rows[0]?.n??0); } catch(e:any){ sections.error=e.message; }
  try { sections.votes=Number((await sectionsSql<any>("SELECT COUNT(*)::bigint n FROM section_votes")).rows[0]?.n??0); } catch{}
  console.log("DUAL_CHECK="+JSON.stringify({core,sections}));
} finally {
  await pool.end();
  if(sectionsPool) await sectionsPool.end();
}
