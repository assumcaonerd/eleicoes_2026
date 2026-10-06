import { pool } from "../src/db/index.js";
import { searchCandidates } from "../src/tools/queries.js";

try {
  const rows = await searchCandidates({
    query:"Capitão Assumção",
    officeCode:7,
    uf:"ES",
    limit:10
  });
  console.log("SEARCHTEST="+JSON.stringify(rows));
} finally {
  await pool.end();
}
