import { offices } from "../config.js";
import { sql } from "../db/index.js";
import { fetchAndPersist } from "./client.js";
import { discoverMunicipalities, extractCandidates } from "./normalize.js";
import { electionIdForOffice, municipalityConfigUrl, scopeResultUrl } from "./url.js";

async function mapLimit<T>(items:T[], limit:number, fn:(item:T)=>Promise<void>) {
  let index=0;
  const workers=Array.from({length:Math.max(1,Math.min(limit,items.length))}, async()=>{
    while(true){
      const current=index++;
      if(current>=items.length) return;
      await fn(items[current]);
    }
  });
  await Promise.all(workers);
}

async function upsertCandidate(args: {
  electionId: number; office: number; uf: string; candidate: ReturnType<typeof extractCandidates>[number]; updatedAt?: Date;
}) {
  const { rows } = await sql<{ id: string }>(`
    INSERT INTO candidates
      (election_id, office_code, office_name, uf, tse_candidate_id, number, ballot_name, full_name, party_number, party_abbr, status, source_updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    ON CONFLICT (election_id, office_code, uf, number, tse_candidate_id)
    DO UPDATE SET ballot_name=EXCLUDED.ballot_name, full_name=EXCLUDED.full_name,
      party_number=EXCLUDED.party_number, party_abbr=EXCLUDED.party_abbr,
      status=EXCLUDED.status, source_updated_at=EXCLUDED.source_updated_at
    RETURNING id
  `, [args.electionId, args.office, offices[args.office as keyof typeof offices] ?? `Cargo ${args.office}`, args.uf,
      args.candidate.tseCandidateId ?? '', args.candidate.number, args.candidate.ballotName, args.candidate.fullName ?? null,
      args.candidate.partyNumber ?? null, args.candidate.partyAbbr ?? null, args.candidate.status ?? null, args.updatedAt ?? new Date()]);
  return Number(rows[0].id);
}

async function storeScope(args: {
  office: number; uf: string; municipalityCode?: string; municipalityName?: string; zone?: number;
}) {
  const url = scopeResultUrl(args);
  const { data, file } = await fetchAndPersist<any>(url);
  const candidates = extractCandidates(data);
  const electionId = electionIdForOffice(args.office);

  for (const candidate of candidates) {
    const candidateId = await upsertCandidate({ electionId, office: args.office, uf: args.uf, candidate });
    await sql(`
      INSERT INTO vote_facts
        (election_id, office_code, candidate_id, uf, municipality_code, municipality_name, zone, votes, source_kind, source_file, source_updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
      ON CONFLICT (election_id, round, office_code, candidate_id, uf,
        municipality_code, neighborhood, zone, section, polling_place_code, source_kind)
      DO UPDATE SET votes=EXCLUDED.votes, source_file=EXCLUDED.source_file, source_updated_at=now()
    `, [electionId, args.office, candidateId, args.uf, args.municipalityCode ?? '', args.municipalityName ?? null,
      args.zone ?? -1, candidate.votes, args.zone == null ? (args.municipalityCode ? "tse_municipality" : "tse_scope") : "tse_zone", file]);
  }
  return candidates.length;
}

export async function importAll2026() {
  const run = await sql<{ id: string }>(`INSERT INTO import_runs(source) VALUES('TSE divulgação 2026') RETURNING id`);
  const runId = Number(run.rows[0].id);
  let rowsImported = 0;
  let filesDownloaded = 0;
  const concurrency = Math.max(1, Number(process.env.TSE_DOWNLOAD_CONCURRENCY ?? 4));
  const importZones = process.env.IMPORT_ZONES === "true";

  try {
    const { data: municipalityPayload } = await fetchAndPersist<any>(municipalityConfigUrl());
    filesDownloaded++;
    const discovered = discoverMunicipalities(municipalityPayload);
    if (discovered.length < 5000) throw new Error(`Lista de municípios incompleta: ${discovered.length}`);
    const onlyUf=(process.env.TSE_ONLY_UF??"").trim().toUpperCase();
    const municipalities = onlyUf ? discovered.filter(m=>m.uf===onlyUf) : discovered;
    const ufs = [...new Set(municipalities.map((m) => m.uf))].sort();
    if(onlyUf && municipalities.length===0) throw new Error(`UF sem municípios: ${onlyUf}`);

    for (const uf of ufs) {
      for (const office of [3, 5, 6, 7]) {
        try {
          rowsImported += await storeScope({ office, uf });
          filesDownloaded++;
        } catch (err: any) {
          if (!String(err?.message ?? err).includes("404")) throw err;
        }
      }
    }
    try {
      rowsImported += await storeScope({ office: 1, uf: "BR" });
      filesDownloaded++;
    } catch (err: any) {
      if (!String(err?.message ?? err).includes("404")) throw err;
    }

    await mapLimit(municipalities, concurrency, async (municipality) => {
      for (const office of [1, 3, 5, 6, 7]) {
        try {
          rowsImported += await storeScope({
            office,
            uf: municipality.uf,
            municipalityCode: municipality.code,
            municipalityName: municipality.name
          });
          filesDownloaded++;
        } catch (err: any) {
          if (!String(err?.message ?? err).includes("404")) throw err;
        }
      }
    });

    if (importZones) {
      await mapLimit(municipalities, concurrency, async (municipality) => {
        for (const zone of municipality.zones) {
          for (const office of [1, 3, 5, 6, 7]) {
            try {
              rowsImported += await storeScope({
                office,
                uf: municipality.uf,
                municipalityCode: municipality.code,
                municipalityName: municipality.name,
                zone
              });
              filesDownloaded++;
            } catch (err: any) {
              if (!String(err?.message ?? err).includes("404")) throw err;
            }
          }
        }
      });
    }

    await sql(
      `UPDATE import_runs SET finished_at=now(), status='ok', files_downloaded=$2, rows_imported=$3, notes=$4 WHERE id=$1`,
      [runId, filesDownloaded, rowsImported, `municipios=${municipalities.length}; zonas=${importZones}`]
    );
    return { runId, filesDownloaded, rowsImported, municipalities: municipalities.length, zonesImported: importZones };
  } catch (error) {
    await sql(
      `UPDATE import_runs SET finished_at=now(), status='error', files_downloaded=$2, rows_imported=$3, notes=$4 WHERE id=$1`,
      [runId, filesDownloaded, rowsImported, String(error)]
    );
    throw error;
  }
}
