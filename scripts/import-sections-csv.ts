import { createReadStream } from "node:fs";
import { parse } from "csv-parse";
import { pool, sql } from "../src/db/index.js";

const file = process.argv[2];
if (!file) throw new Error("Uso: npm run import:sections -- caminho.csv");

const parser = createReadStream(file).pipe(parse({ columns: true, delimiter: ";", bom: true, relax_column_count: true }));
let imported = 0;

const get = (row: Record<string,string>, ...keys: string[]) => keys.map(k => row[k]).find(Boolean)?.trim();

for await (const row of parser as AsyncIterable<Record<string,string>>) {
  const uf = get(row, "SG_UF", "UF")?.toUpperCase();
  const municipalityCode = get(row, "CD_MUNICIPIO", "COD_MUNICIPIO");
  const municipalityName = get(row, "NM_MUNICIPIO", "MUNICIPIO");
  const zone = Number(get(row, "NR_ZONA", "ZONA"));
  const section = Number(get(row, "NR_SECAO", "SECAO"));
  const office = Number(get(row, "CD_CARGO_PERGUNTA", "CD_CARGO", "CARGO"));
  const number = get(row, "NR_VOTAVEL", "NR_CANDIDATO", "NUMERO_CANDIDATO");
  const votes = Number(get(row, "QT_VOTOS", "VOTOS") ?? 0);
  const neighborhood = get(row, "NM_BAIRRO", "BAIRRO");
  const pollingPlace = get(row, "NR_LOCAL_VOTACAO", "CD_LOCAL_VOTACAO", "LOCAL_VOTACAO");
  if (!uf || !municipalityCode || !Number.isFinite(zone) || !Number.isFinite(section) || !office || !number) continue;

  const candidate = await sql<{id:string}>(`SELECT id FROM candidates WHERE office_code=$1 AND uf=$2 AND number=$3 LIMIT 1`, [office, uf, number]);
  if (!candidate.rows[0]) continue;

  await sql(`INSERT INTO vote_facts
    (election_id, office_code, candidate_id, uf, municipality_code, municipality_name, neighborhood, zone, section, polling_place_code, votes, source_kind, source_file, source_updated_at)
    SELECT election_id, office_code, id, uf, $4,$5,$6,$7,$8,$9,$10,'tse_section_csv',$11,now() FROM candidates WHERE id=$1
    ON CONFLICT (election_id, round, office_code, candidate_id, uf, municipality_code, neighborhood, zone, section, polling_place_code, source_kind)
    DO UPDATE SET votes=EXCLUDED.votes, source_file=EXCLUDED.source_file, source_updated_at=now()`,
    [Number(candidate.rows[0].id), office, uf, municipalityCode, municipalityName ?? null, neighborhood ?? '', zone, section, pollingPlace ?? '', votes, file]);
  imported++;
}

console.log(`Linhas de seção importadas: ${imported}`);
await pool.end();
