import { sql } from "../db/index.js";

export async function searchCandidates(args: { query: string; officeCode?: number; uf?: string; limit?: number }) {
  const q = args.query.trim();
  const { rows } = await sql(`
    SELECT id, election_id, office_code, office_name, uf, number, ballot_name, full_name, party_abbr, status
    FROM candidates
    WHERE ($1::text IS NULL OR uf=$1)
      AND ($2::int IS NULL OR office_code=$2)
      AND (number=$3 OR ballot_name ILIKE '%' || $3 || '%' OR similarity(ballot_name,$3) > 0.25)
    ORDER BY CASE WHEN number=$3 THEN 0 ELSE 1 END, similarity(ballot_name,$3) DESC, ballot_name
    LIMIT $4
  `, [args.uf?.toUpperCase() ?? null, args.officeCode ?? null, q, Math.min(args.limit ?? 20, 50)]);
  return rows;
}

export async function candidateSummary(candidateId: number) {
  const candidate = await sql(`SELECT * FROM candidates WHERE id=$1`, [candidateId]);
  const totals = await sql(`
    SELECT
      COALESCE(MAX(votes) FILTER (WHERE municipality_code = '' AND zone = -1), 0)::int AS total_votes,
      MAX(source_updated_at) AS updated_at
    FROM vote_facts WHERE candidate_id=$1
  `, [candidateId]);
  return { candidate: candidate.rows[0] ?? null, totals: totals.rows[0] ?? null };
}

export async function votesByLevel(args: {
  candidateId: number;
  level: "municipality" | "neighborhood" | "zone" | "polling_place" | "section";
  municipalityCode?: string;
  neighborhood?: string;
  zone?: number;
  limit?: number;
  offset?: number;
}) {
  const limit = Math.min(args.limit ?? 100, 500);
  const offset = Math.max(args.offset ?? 0, 0);

  if (args.level === "municipality") {
    const { rows } = await sql(`
      SELECT municipality_code, municipality_name, MAX(votes)::int AS votes
      FROM vote_facts
      WHERE candidate_id=$1 AND municipality_code <> '' AND zone = -1 AND section = -1
      GROUP BY municipality_code, municipality_name
      ORDER BY municipality_name
      LIMIT $2 OFFSET $3
    `, [args.candidateId, limit, offset]);
    return rows;
  }

  if (args.level === "zone") {
    const { rows } = await sql(`
      SELECT municipality_code, municipality_name, zone, MAX(votes)::int AS votes
      FROM vote_facts
      WHERE candidate_id=$1 AND zone >= 0 AND section = -1
        AND ($2::text IS NULL OR municipality_code=$2)
      GROUP BY municipality_code, municipality_name, zone
      ORDER BY municipality_name, zone
      LIMIT $3 OFFSET $4
    `, [args.candidateId, args.municipalityCode ?? null, limit, offset]);
    return rows;
  }

  const detailPredicate = args.level === "neighborhood"
    ? "neighborhood <> ''"
    : args.level === "polling_place"
      ? "polling_place_code <> ''"
      : "section >= 0";

  const { rows } = await sql(`
    SELECT municipality_code, municipality_name, neighborhood, zone, polling_place_code, section, SUM(votes)::int AS votes
    FROM vote_facts
    WHERE candidate_id=$1
      AND ${detailPredicate}
      AND ($2::text IS NULL OR municipality_code=$2)
      AND ($3::text IS NULL OR neighborhood=$3)
      AND ($4::int IS NULL OR zone=$4)
    GROUP BY municipality_code, municipality_name, neighborhood, zone, polling_place_code, section
    ORDER BY municipality_name, neighborhood, zone, section
    LIMIT $5 OFFSET $6
  `, [args.candidateId, args.municipalityCode ?? null, args.neighborhood ?? null, args.zone ?? null, limit, offset]);
  return rows;
}
