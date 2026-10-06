import { readFile } from "node:fs/promises";
import { sectionsPool } from "../src/db/sections.js";
if(!sectionsPool) throw new Error("SECTIONS_DATABASE_URL ausente.");
const schema=await readFile(new URL("../src/db/sections-schema.sql",import.meta.url),"utf8");
await sectionsPool.query(schema);
console.log("Base granular inicializada.");
await sectionsPool.end();
