import { sql } from "../db/index.js";
import { sectionsSql } from "../db/sections.js";

export async function searchCandidates(args: { query: string; officeCode?: number; uf?: string; limit?: number }) {
  const q = args.query.trim();
  const { rows } = await sql(`
    SELECT id, election_id, office_code, office_name, uf, number, ballot_name, full_name, party_abbr, status
    FROM candidates
    WHERE ($1::text IS NULL OR uf=$1)
      AND ($2::int IS NULL OR office_code=$2)
      AND (
        number=$3
        OR unaccent(ballot_name) ILIKE '%' || unaccent($3) || '%'
        OR unaccent(COALESCE(full_name,'')) ILIKE '%' || unaccent($3) || '%'
        OR similarity(unaccent(ballot_name),unaccent($3)) > 0.25
      )
    ORDER BY CASE WHEN number=$3 THEN 0 ELSE 1 END, similarity(unaccent(ballot_name),unaccent($3)) DESC, ballot_name
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
  const limit = Math.min(args.limit ?? 100, 1000);
  const offset = Math.max(args.offset ?? 0, 0);

  if (args.level === "municipality") {
    const { rows } = await sql(`
      SELECT municipality_code, municipality_name, MAX(votes)::int AS votes
      FROM vote_facts
      WHERE candidate_id=$1 AND municipality_code <> '' AND zone = -1 AND section = -1
      GROUP BY municipality_code, municipality_name
      ORDER BY votes DESC, municipality_name
      LIMIT $2 OFFSET $3
    `, [args.candidateId, limit, offset]);
    return rows;
  }

  if (args.level === "zone") {
    const { rows } = await sql(`
      SELECT v.municipality_code, MAX(v.municipality_name) AS municipality_name,
             v.zone, SUM(v.votes)::int AS votes
      FROM vote_facts v
      WHERE v.candidate_id=$1 AND v.section>=0 AND v.source_kind='tse_section_bu'
        AND ($2::text IS NULL OR v.municipality_code=$2)
      GROUP BY v.municipality_code, v.zone
      ORDER BY votes DESC, v.zone
      LIMIT $3 OFFSET $4
    `, [args.candidateId, args.municipalityCode ?? null, limit, offset]);
    return rows;
  }

  if (args.level === "neighborhood") {
    const { rows } = await sql(`
      SELECT v.municipality_code, MAX(v.municipality_name) AS municipality_name,
             COALESCE(NULLIF(p.neighborhood,''),'Não informado') AS neighborhood,
             SUM(v.votes)::int AS votes
      FROM vote_facts v
      LEFT JOIN places p ON p.uf=v.uf AND p.municipality_code=v.municipality_code
        AND p.zone=v.zone AND p.section=v.section
      WHERE v.candidate_id=$1 AND v.section>=0 AND v.source_kind='tse_section_bu'
        AND ($2::text IS NULL OR v.municipality_code=$2)
      GROUP BY v.municipality_code, COALESCE(NULLIF(p.neighborhood,''),'Não informado')
      ORDER BY votes DESC, neighborhood
      LIMIT $3 OFFSET $4
    `, [args.candidateId, args.municipalityCode ?? null, limit, offset]);
    return rows;
  }

  if (args.level === "polling_place") {
    const { rows } = await sql(`
      SELECT v.municipality_code, MAX(v.municipality_name) AS municipality_name,
             COALESCE(p.neighborhood,'') AS neighborhood,
             COALESCE(p.polling_place_code,v.polling_place_code) AS polling_place_code,
             MAX(p.polling_place_name) AS polling_place_name,
             MAX(p.address) AS address, MAX(p.cep) AS cep,
             MAX(p.latitude) AS latitude, MAX(p.longitude) AS longitude,
             SUM(v.votes)::int AS votes
      FROM vote_facts v
      LEFT JOIN places p ON p.uf=v.uf AND p.municipality_code=v.municipality_code
        AND p.zone=v.zone AND p.section=v.section
      WHERE v.candidate_id=$1 AND v.section>=0 AND v.source_kind='tse_section_bu'
        AND ($2::text IS NULL OR v.municipality_code=$2)
      GROUP BY v.municipality_code, COALESCE(p.neighborhood,''),
               COALESCE(p.polling_place_code,v.polling_place_code)
      ORDER BY votes DESC, polling_place_name
      LIMIT $3 OFFSET $4
    `, [args.candidateId, args.municipalityCode ?? null, limit, offset]);
    return rows;
  }

  const { rows } = await sql(`
    SELECT v.municipality_code, MAX(v.municipality_name) AS municipality_name,
           v.zone, v.section, MAX(COALESCE(p.neighborhood,'')) AS neighborhood,
           MAX(COALESCE(p.polling_place_code,v.polling_place_code)) AS polling_place_code,
           MAX(p.polling_place_name) AS polling_place_name,
           MAX(p.address) AS address, MAX(p.cep) AS cep,
           SUM(v.votes)::int AS votes
    FROM vote_facts v
    LEFT JOIN places p ON p.uf=v.uf AND p.municipality_code=v.municipality_code
      AND p.zone=v.zone AND p.section=v.section
    WHERE v.candidate_id=$1 AND v.section>=0 AND v.source_kind='tse_section_bu'
      AND ($2::text IS NULL OR v.municipality_code=$2)
      AND ($3::int IS NULL OR v.zone=$3)
    GROUP BY v.municipality_code, v.zone, v.section
    ORDER BY votes DESC, v.zone, v.section
    LIMIT $4 OFFSET $5
  `, [args.candidateId, args.municipalityCode ?? null, args.zone ?? null, limit, offset]);
  return rows;
}


export async function compareCandidates(args:{
  candidateIds:number[];
  level:"municipality"|"neighborhood"|"zone"|"polling_place"|"section";
  municipalityCode?:string;
  zone?:number;
  limit?:number;
}) {
  const ids=[...new Set(args.candidateIds)].slice(0,3);
  if(ids.length<2) throw new Error("Informe de 2 a 3 candidatos.");
  const limit=Math.min(args.limit??200,500);
  const levelExpr = args.level==="municipality"
    ? "municipality_code, municipality_name"
    : args.level==="neighborhood"
      ? "municipality_code, municipality_name, neighborhood"
      : args.level==="zone"
        ? "municipality_code, municipality_name, zone"
        : args.level==="polling_place"
          ? "municipality_code, municipality_name, neighborhood, zone, polling_place_code"
          : "municipality_code, municipality_name, neighborhood, zone, polling_place_code, section";
  const predicates = args.level==="municipality"
    ? "municipality_code <> '' AND zone=-1 AND section=-1"
    : args.level==="zone"
      ? "zone>=0 AND section=-1"
      : args.level==="section"
        ? "section>=0"
        : args.level==="neighborhood"
          ? "neighborhood<>''"
          : "polling_place_code<>''";
  const {rows}=await sql(`
    SELECT ${levelExpr}, candidate_id, SUM(votes)::int AS votes
    FROM vote_facts
    WHERE candidate_id = ANY($1::bigint[])
      AND ${predicates}
      AND ($2::text IS NULL OR municipality_code=$2)
      AND ($3::int IS NULL OR zone=$3)
    GROUP BY ${levelExpr}, candidate_id
    ORDER BY ${levelExpr}, votes DESC
    LIMIT $4
  `,[ids,args.municipalityCode??null,args.zone??null,limit*ids.length]);
  return rows;
}

export async function topTerritories(args:{
  candidateId:number;
  level:"municipality"|"neighborhood"|"zone"|"polling_place"|"section";
  limit?:number;
}) {
  const limit=Math.min(args.limit??20,100);
  const levelExpr = args.level==="municipality"
    ? "municipality_code, municipality_name"
    : args.level==="neighborhood"
      ? "municipality_code, municipality_name, neighborhood"
      : args.level==="zone"
        ? "municipality_code, municipality_name, zone"
        : args.level==="polling_place"
          ? "municipality_code, municipality_name, neighborhood, zone, polling_place_code"
          : "municipality_code, municipality_name, neighborhood, zone, polling_place_code, section";
  const predicates = args.level==="municipality"
    ? "municipality_code <> '' AND zone=-1 AND section=-1"
    : args.level==="zone"
      ? "zone>=0 AND section=-1"
      : args.level==="section"
        ? "section>=0"
        : args.level==="neighborhood"
          ? "neighborhood<>''"
          : "polling_place_code<>''";
  const {rows}=await sql(`
    SELECT ${levelExpr}, SUM(votes)::int AS votes
    FROM vote_facts
    WHERE candidate_id=$1 AND ${predicates}
    GROUP BY ${levelExpr}
    ORDER BY votes DESC
    LIMIT $2
  `,[args.candidateId,limit]);
  return rows;
}

export async function partyVotes(args:{partyAbbr:string;officeCode:number;uf:string}) {
  const {rows}=await sql(`
    SELECT c.party_abbr,c.office_name,c.uf,SUM(v.votes)::bigint AS votes
    FROM vote_facts v JOIN candidates c ON c.id=v.candidate_id
    WHERE c.party_abbr=$1 AND c.office_code=$2 AND c.uf=$3
      AND v.municipality_code='' AND v.zone=-1
    GROUP BY c.party_abbr,c.office_name,c.uf
  `,[args.partyAbbr.toUpperCase(),args.officeCode,args.uf.toUpperCase()]);
  return rows[0]??null;
}

export async function sourceStatus() {
  const {rows}=await sql(`
    SELECT source_kind, count(*)::bigint AS rows, max(source_updated_at) AS updated_at
    FROM vote_facts GROUP BY source_kind ORDER BY source_kind
  `);
  return rows;
}


export async function sectionMap(args:{candidateId:number;municipalityCode?:string;limit?:number}) {
  const {rows}=await sql(`
    SELECT v.municipality_code,v.municipality_name,v.zone,v.section,v.polling_place_code,
           p.polling_place_name,p.neighborhood,p.latitude,p.longitude,
           SUM(v.votes)::int AS votes,
           s.valid_votes,s.turnout,s.electorate,
           CASE WHEN s.valid_votes>0 THEN ROUND((SUM(v.votes)::numeric/s.valid_votes)*100,2) ELSE NULL END AS pct_valid
    FROM vote_facts v
    LEFT JOIN places p ON p.uf=v.uf AND p.municipality_code=v.municipality_code AND p.zone=v.zone AND p.section=v.section
    LEFT JOIN section_stats s ON s.election_id=v.election_id AND s.round=v.round AND s.uf=v.uf
      AND s.municipality_code=v.municipality_code AND s.zone=v.zone AND s.section=v.section
    WHERE v.candidate_id=$1 AND v.section>=0
      AND ($2::text IS NULL OR v.municipality_code=$2)
      AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL
    GROUP BY v.municipality_code,v.municipality_name,v.zone,v.section,v.polling_place_code,
             p.polling_place_name,p.neighborhood,p.latitude,p.longitude,s.valid_votes,s.turnout,s.electorate
    ORDER BY votes DESC
    LIMIT $3
  `,[args.candidateId,args.municipalityCode??null,Math.min(args.limit??2000,5000)]);
  return rows;
}

export async function sectionMetrics(args:{candidateId:number;municipalityCode:string;zone:number;section:number}) {
  const {rows}=await sql(`
    SELECT SUM(v.votes)::int AS votes,s.valid_votes,s.turnout,s.electorate,s.abstentions,s.blank_votes,s.null_votes,
      CASE WHEN s.valid_votes>0 THEN ROUND((SUM(v.votes)::numeric/s.valid_votes)*100,2) ELSE NULL END AS pct_valid,
      CASE WHEN s.turnout>0 THEN ROUND((SUM(v.votes)::numeric/s.turnout)*100,2) ELSE NULL END AS pct_turnout
    FROM vote_facts v
    LEFT JOIN section_stats s ON s.election_id=v.election_id AND s.round=v.round AND s.uf=v.uf
      AND s.municipality_code=v.municipality_code AND s.zone=v.zone AND s.section=v.section
    WHERE v.candidate_id=$1 AND v.municipality_code=$2 AND v.zone=$3 AND v.section=$4
    GROUP BY s.valid_votes,s.turnout,s.electorate,s.abstentions,s.blank_votes,s.null_votes
  `,[args.candidateId,args.municipalityCode,args.zone,args.section]);
  return rows[0]??null;
}


export async function candidateTerritoryOverview(candidateId:number) {
  const summary=await candidateSummary(candidateId);
  if(!summary.candidate) return null;
  const total=Number((summary.totals as any)?.total_votes??0);
  const {rows}=await sql<any>(`
    SELECT municipality_code, municipality_name, MAX(votes)::int AS votes
    FROM vote_facts
    WHERE candidate_id=$1 AND municipality_code<>'' AND zone=-1 AND section=-1
    GROUP BY municipality_code,municipality_name
    ORDER BY votes DESC,municipality_name
  `,[candidateId]);
  const municipalities=rows.map((r:any,i:number)=>({
    ...r,
    rank:i+1,
    pct_total: total>0 ? Number(((Number(r.votes)/total)*100).toFixed(2)) : 0
  }));
  return {
    candidate:summary.candidate,
    total_votes:total,
    municipalities_count:municipalities.length,
    updated_at:(summary.totals as any)?.updated_at??null,
    strongest:municipalities.slice(0,5),
    municipalities
  };
}

export async function territorialLevel(args:{
  candidateId:number;
  level:"municipality"|"zone"|"neighborhood"|"polling_place"|"section";
  municipalityCode?:string;
  neighborhood?:string;
  zone?:number;
  limit?:number;
}) {
  const summary=await candidateSummary(args.candidateId);
  if(!summary.candidate) return [];
  const total=Number((summary.totals as any)?.total_votes??0);
  if(args.level==="municipality"){
    const rows=await votesByLevel({candidateId:args.candidateId,level:"municipality",limit:args.limit??500});
    return rows.sort((a:any,b:any)=>Number(b.votes)-Number(a.votes)).map((r:any,i:number)=>({
      ...r,rank:i+1,pct_total:total>0?Number(((Number(r.votes)/total)*100).toFixed(2)):0
    }));
  }

  const cand:any=summary.candidate;
  const office=Number(cand.office_code);
  const uf=String(cand.uf);
  const number=String(cand.number);
  const municipality=args.municipalityCode??null;
  const limit=Math.min(args.limit??500,1000);

  let rows:any[]=[];
  if(args.level==="zone"){
    rows=(await sectionsSql<any>(`
      SELECT municipality_code,municipality_name,zone,SUM(votes)::int AS votes
      FROM section_votes
      WHERE uf=$1 AND office_code=$2 AND candidate_number=$3
        AND ($4::text IS NULL OR municipality_code=$4)
      GROUP BY municipality_code,municipality_name,zone
      ORDER BY votes DESC
      LIMIT $5
    `,[uf,office,number,municipality,limit])).rows;
  } else if(args.level==="neighborhood"){
    rows=(await sectionsSql<any>(`
      SELECT sv.municipality_code,sv.municipality_name,COALESCE(p.neighborhood,'') AS neighborhood,SUM(sv.votes)::int AS votes
      FROM section_votes sv
      LEFT JOIN places p ON p.uf=sv.uf AND p.municipality_code=sv.municipality_code
        AND p.zone=sv.zone AND p.section=sv.section
      WHERE sv.uf=$1 AND sv.office_code=$2 AND sv.candidate_number=$3
        AND ($4::text IS NULL OR sv.municipality_code=$4)
        AND COALESCE(p.neighborhood,'')<>''
      GROUP BY sv.municipality_code,sv.municipality_name,p.neighborhood
      ORDER BY votes DESC
      LIMIT $5
    `,[uf,office,number,municipality,limit])).rows;
  } else if(args.level==="polling_place"){
    rows=(await sectionsSql<any>(`
      SELECT sv.municipality_code,sv.municipality_name,
        COALESCE(NULLIF(p.polling_place_code,''),'SEM-CODIGO') AS polling_place_code,
        MAX(p.polling_place_name) AS polling_place_name,
        MAX(p.address) AS address,
        MAX(p.neighborhood) AS neighborhood,
        MAX(p.cep) AS cep,
        MAX(p.latitude) AS latitude,
        MAX(p.longitude) AS longitude,
        SUM(sv.votes)::int AS votes
      FROM section_votes sv
      LEFT JOIN places p ON p.uf=sv.uf AND p.municipality_code=sv.municipality_code
        AND p.zone=sv.zone AND p.section=sv.section
      WHERE sv.uf=$1 AND sv.office_code=$2 AND sv.candidate_number=$3
        AND ($4::text IS NULL OR sv.municipality_code=$4)
      GROUP BY sv.municipality_code,sv.municipality_name,
        COALESCE(NULLIF(p.polling_place_code,''),'SEM-CODIGO')
      ORDER BY votes DESC
      LIMIT $5
    `,[uf,office,number,municipality,limit])).rows;
  } else {
    rows=(await sectionsSql<any>(`
      SELECT sv.municipality_code,sv.municipality_name,sv.zone,sv.section,
        MAX(COALESCE(NULLIF(p.polling_place_code,''),sv.polling_place_code)) AS polling_place_code,
        MAX(p.polling_place_name) AS polling_place_name,MAX(p.address) AS address,
        MAX(p.neighborhood) AS neighborhood,MAX(p.cep) AS cep,
        SUM(sv.votes)::int AS votes
      FROM section_votes sv
      LEFT JOIN places p ON p.uf=sv.uf AND p.municipality_code=sv.municipality_code
        AND p.zone=sv.zone AND p.section=sv.section
      WHERE sv.uf=$1 AND sv.office_code=$2 AND sv.candidate_number=$3
        AND ($4::text IS NULL OR sv.municipality_code=$4)
        AND ($5::int IS NULL OR sv.zone=$5)
      GROUP BY sv.municipality_code,sv.municipality_name,sv.zone,sv.section,sv.polling_place_code
      ORDER BY votes DESC
      LIMIT $6
    `,[uf,office,number,municipality,args.zone??null,limit])).rows;
  }
  return rows.map((r:any,i:number)=>({...r,rank:i+1,pct_total:total>0?Number(((Number(r.votes)/total)*100).toFixed(2)):0}));
}
