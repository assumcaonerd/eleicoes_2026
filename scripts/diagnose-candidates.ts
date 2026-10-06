import { pool } from "../src/db/index.js";
import { sectionsPool } from "../src/db/sections.js";
import { candidateTerritoryOverview, territorialLevel } from "../src/tools/queries.js";

try {
  const candidateId=6954;
  const overview:any=await candidateTerritoryOverview(candidateId);
  const top=overview?.municipalities?.[0];
  if(!top) throw new Error("Sem município para teste");
  const municipalityCode=String(top.municipality_code);
  const municipalityName=String(top.municipality_name);
  const zone=await territorialLevel({candidateId,level:"zone",municipalityCode,limit:5});
  const neighborhood=await territorialLevel({candidateId,level:"neighborhood",municipalityCode,limit:5});
  const place=await territorialLevel({candidateId,level:"polling_place",municipalityCode,limit:5});
  const section=await territorialLevel({candidateId,level:"section",municipalityCode,limit:5});
  console.log("TERRITORYTEST="+JSON.stringify({
    municipality:{code:municipalityCode,name:municipalityName,votes:top.votes},
    zone,neighborhood,place,section
  }));
} finally {
  await pool.end();
  if (sectionsPool && sectionsPool !== pool) await sectionsPool.end();
}
