import { importAll2026 } from "../src/tse/importer.js";
import { pool } from "../src/db/index.js";

try {
  const result = await importAll2026();
  console.log(JSON.stringify(result, null, 2));
} finally {
  await pool.end();
}
