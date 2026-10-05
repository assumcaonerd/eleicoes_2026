import { readFile } from "node:fs/promises";
import { pool } from "../src/db/index.js";

const schema = await readFile(new URL("../src/db/schema.sql", import.meta.url), "utf8");
await pool.query(schema);
console.log("Banco inicializado.");
await pool.end();
