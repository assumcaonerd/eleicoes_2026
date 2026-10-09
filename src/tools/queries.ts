import { sql } from "../db/index.js";
import { sectionsSqlForUf, sectionsSqlAllForUf } from "../db/sections.js";

export async function searchCandidates(args: { query: string; officeCode?: number; uf?: string; limit?: number }) {
  const q = args.query.trim();
  const { rows } = await sql(`
    SELECT id, election_id, round, office_code, office_name, uf, number, ballot_name, full_name, party_abbr, status
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
  const summary=await candidateSummary(args.candidateId);
  if(!summary.candidate) return [];
  const cand:any=summary.candidate;
  const office=Number(cand.office_code);
  const uf=String(cand.uf);
  const number=String(cand.number);
  const municipality=args.municipalityCode??null;
  const limit=Math.min(args.limit??5000,10000);

  const results=await sectionsSqlAllForUf<any>(uf,`
    WITH base AS (
      SELECT sv.municipality_code,MAX(sv.municipality_name) AS municipality_name,
        p.polling_place_code,MAX(p.polling_place_name) AS polling_place_name,
        MAX(p.address) AS address,MAX(p.neighborhood) AS neighborhood,MAX(p.cep) AS cep,
        MAX(p.latitude) AS latitude,MAX(p.longitude) AS longitude,SUM(sv.votes)::int AS votes
      FROM section_votes sv
      JOIN places p ON p.uf=sv.uf AND p.municipality_code=sv.municipality_code
        AND p.zone=sv.zone AND p.section=sv.section
      WHERE sv.uf=$1 AND sv.office_code=$2 AND sv.candidate_number=$3 AND sv.votes>0
        AND ($4::text IS NULL OR sv.municipality_code=$4)
        AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL
      GROUP BY sv.municipality_code,p.polling_place_code
    ),
    sections AS (
      SELECT sv.municipality_code,p.polling_place_code,
        json_agg(json_build_object('zone',sv.zone,'section',sv.section,'votes',sv.votes)
          ORDER BY sv.votes DESC,sv.zone,sv.section) AS sections
      FROM section_votes sv
      JOIN places p ON p.uf=sv.uf AND p.municipality_code=sv.municipality_code
        AND p.zone=sv.zone AND p.section=sv.section
      WHERE sv.uf=$1 AND sv.office_code=$2 AND sv.candidate_number=$3 AND sv.votes>0
        AND ($4::text IS NULL OR sv.municipality_code=$4)
      GROUP BY sv.municipality_code,p.polling_place_code
    )
    SELECT b.*,s.sections FROM base b
    JOIN sections s USING(municipality_code,polling_place_code)
    ORDER BY b.votes DESC LIMIT $5
  `,[uf,office,number,municipality,limit]);

  const merged=new Map<string,any>();
  for(const result of results){
    for(const row of result.rows){
      const key=String(row.municipality_code)+"|"+String(row.polling_place_code);
      const prev=merged.get(key);
      if(!prev){
        merged.set(key,{...row,votes:Number(row.votes||0),sections:[...(row.sections||[])]});
      }else{
        prev.votes=Number(prev.votes||0)+Number(row.votes||0);
        prev.sections=[...(prev.sections||[]),...(row.sections||[])];
        if(!prev.polling_place_name&&row.polling_place_name)prev.polling_place_name=row.polling_place_name;
        if(!prev.address&&row.address)prev.address=row.address;
        if(!prev.neighborhood&&row.neighborhood)prev.neighborhood=row.neighborhood;
        if(!prev.cep&&row.cep)prev.cep=row.cep;
        if(prev.latitude==null&&row.latitude!=null)prev.latitude=row.latitude;
        if(prev.longitude==null&&row.longitude!=null)prev.longitude=row.longitude;
      }
    }
  }
  return [...merged.values()]
    .sort((a:any,b:any)=>Number(b.votes)-Number(a.votes))
    .slice(0,limit);
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
  pollingPlaceCode?:string;
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

  let query="";
  let params:any[]=[];
  let keyOf:(r:any)=>string=()=>""; 

  if(args.level==="zone"){
    query=`
      SELECT sv.municipality_code,MAX(sv.municipality_name) AS municipality_name,sv.zone,SUM(sv.votes)::int AS votes
      FROM section_votes sv
      LEFT JOIN places p ON p.uf=sv.uf AND p.municipality_code=sv.municipality_code
        AND p.zone=sv.zone AND p.section=sv.section
      WHERE sv.uf=$1 AND sv.office_code=$2 AND sv.candidate_number=$3
        AND ($4::text IS NULL OR sv.municipality_code=$4)
        AND ($5::text IS NULL OR COALESCE(p.neighborhood,'')=$5)
        AND ($6::text IS NULL OR COALESCE(NULLIF(p.polling_place_code,''),sv.polling_place_code)=$6)
      GROUP BY sv.municipality_code,sv.zone
      ORDER BY votes DESC
      LIMIT $7
    `;
    params=[uf,office,number,municipality,args.neighborhood??null,args.pollingPlaceCode??null,limit];
    keyOf=(r:any)=>String(r.municipality_code)+"|"+String(r.zone);
  } else if(args.level==="neighborhood"){
    query=`
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
    `;
    params=[uf,office,number,municipality,limit];
    keyOf=(r:any)=>String(r.municipality_code)+"|"+String(r.neighborhood||"");
  } else if(args.level==="polling_place"){
    query=`
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
        AND ($5::text IS NULL OR COALESCE(p.neighborhood,'')=$5)
      GROUP BY sv.municipality_code,sv.municipality_name,
        COALESCE(NULLIF(p.polling_place_code,''),'SEM-CODIGO')
      ORDER BY votes DESC
      LIMIT $6
    `;
    params=[uf,office,number,municipality,args.neighborhood??null,limit];
    keyOf=(r:any)=>String(r.municipality_code)+"|"+String(r.polling_place_code||"");
  } else {
    query=`
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
        AND ($5::text IS NULL OR COALESCE(p.neighborhood,'')=$5)
        AND ($6::text IS NULL OR COALESCE(NULLIF(p.polling_place_code,''),sv.polling_place_code)=$6)
        AND ($7::int IS NULL OR sv.zone=$7)
      GROUP BY sv.municipality_code,sv.municipality_name,sv.zone,sv.section,sv.polling_place_code
      ORDER BY votes DESC
      LIMIT $8
    `;
    params=[uf,office,number,municipality,args.neighborhood??null,args.pollingPlaceCode??null,args.zone??null,limit];
    keyOf=(r:any)=>String(r.municipality_code)+"|"+String(r.zone)+"|"+String(r.section)+"|"+String(r.polling_place_code||"");
  }

  const results=await sectionsSqlAllForUf<any>(uf,query,params);
  const merged=new Map<string,any>();
  for(const result of results){
    for(const row of result.rows){
      const key=keyOf(row);
      const prev=merged.get(key);
      if(!prev){
        merged.set(key,{...row,votes:Number(row.votes||0)});
      }else{
        prev.votes=Number(prev.votes||0)+Number(row.votes||0);
        for(const field of ["polling_place_name","address","neighborhood","cep","latitude","longitude","municipality_name"]){
          if((prev[field]==null||prev[field]==="")&&row[field]!=null&&row[field]!=="")prev[field]=row[field];
        }
      }
    }
  }
  const rows=[...merged.values()]
    .sort((a:any,b:any)=>Number(b.votes)-Number(a.votes))
    .slice(0,limit);
  return rows.map((r:any,i:number)=>({...r,rank:i+1,pct_total:total>0?Number(((Number(r.votes)/total)*100).toFixed(2)):0}));
}


/** Comparação factual de votos de candidatos ao mesmo cargo, eleição, turno e UF. */
export async function candidateVoteComparison(args:{
 candidateId:number;municipalityCode?:string;neighborhood?:string;
 pollingPlaceCode?:string;zone?:number;section?:number;
}){
 const candidateResult=await sql<any>(
   "SELECT id,election_id,round,office_code,uf,number,ballot_name,party_abbr FROM candidates WHERE id=$1",
   [args.candidateId]
 );
 const candidate=candidateResult.rows[0];
 if(!candidate)return null;
 const municipality=args.municipalityCode||null;
 const neighborhood=args.neighborhood||null;
 const place=args.pollingPlaceCode||null;
 const zone=args.zone??null,section=args.section??null;
 if((neighborhood||place||zone!==null||section!==null)&&!municipality){
   throw new Error("Selecione o município antes do detalhamento territorial.");
 }
 if(section!==null&&zone===null)throw new Error("Selecione a zona para comparar uma seção.");
 const namesResult=await sql<any>(
   "SELECT id,number,ballot_name,party_abbr FROM candidates WHERE election_id=$1 AND round=$2 AND office_code=$3 AND uf=$4",
   [candidate.election_id,candidate.round,candidate.office_code,candidate.uf]
 );
 const identities=new Map<string,any>();
 for(const row of namesResult.rows){
   const number=String(row.number);
   if(!identities.has(number)||Number(row.id)===Number(candidate.id))identities.set(number,row);
 }
 const totals=new Map<string,number>();
 const stateOnly=!municipality;
 const municipalityOnly=Boolean(municipality&&!neighborhood&&!place&&zone===null&&section===null);
 if(stateOnly||municipalityOnly){
   const result=await sql<any>(`
     SELECT c.number,MAX(v.votes)::bigint AS votes
     FROM vote_facts v JOIN candidates c ON c.id=v.candidate_id
     WHERE c.election_id=$1 AND c.round=$2 AND c.office_code=$3 AND c.uf=$4
       AND v.election_id=$1 AND v.round=$2 AND v.office_code=$3 AND v.uf=$4
       AND v.zone=-1 AND v.section=-1
       AND v.municipality_code=$5
     GROUP BY c.number
   `,[candidate.election_id,candidate.round,candidate.office_code,candidate.uf,municipality??""]);
   for(const row of result.rows)totals.set(String(row.number),Number(row.votes));
 }else{
   const results=await sectionsSqlAllForUf<any>(String(candidate.uf),`
     SELECT sv.candidate_number AS number,SUM(sv.votes)::bigint AS votes
     FROM section_votes sv
     LEFT JOIN LATERAL (SELECT p0.neighborhood,p0.polling_place_code FROM places p0 WHERE p0.uf=sv.uf AND p0.municipality_code=sv.municipality_code AND p0.zone=sv.zone AND p0.section=sv.section ORDER BY CASE WHEN p0.polling_place_code=sv.polling_place_code THEN 0 ELSE 1 END LIMIT 1) p ON true
     WHERE sv.uf=$1 AND sv.election_id=$2 AND sv.office_code=$3 AND sv.round=$9
       AND sv.municipality_code=$4
       AND ($5::text IS NULL OR COALESCE(p.neighborhood,'')=$5)
       AND ($6::text IS NULL OR COALESCE(NULLIF(p.polling_place_code,''),sv.polling_place_code)=$6)
       AND ($7::int IS NULL OR sv.zone=$7)
       AND ($8::int IS NULL OR sv.section=$8)
     GROUP BY sv.candidate_number
   `,[candidate.uf,candidate.election_id,candidate.office_code,municipality,neighborhood,place,zone,section,candidate.round]);
   for(const result of results)for(const row of result.rows){
     const number=String(row.number);
     totals.set(number,(totals.get(number)||0)+Number(row.votes));
   }
 }
 const ranked=[...totals.entries()]
   .filter(([number,votes])=>identities.has(number)&&Number.isFinite(votes)&&votes>=0)
   .map(([number,votes])=>({...identities.get(number),votes}))
   .sort((a,b)=>b.votes-a.votes||String(a.ballot_name).localeCompare(String(b.ballot_name),"pt-BR")||String(a.number).localeCompare(String(b.number)));
 const selectedIndex=ranked.findIndex(x=>String(x.number)===String(candidate.number));
 const selected=selectedIndex>=0?{...ranked[selectedIndex],position:selectedIndex+1,party_position:ranked.slice(0,selectedIndex+1).filter(x=>x.party_abbr===ranked[selectedIndex].party_abbr).length}:null;
 return {
   scope:{uf:candidate.uf,office_code:candidate.office_code,election_id:candidate.election_id,round:candidate.round,
     municipality,neighborhood,polling_place_code:place,zone,section},
   top_three:ranked.slice(0,3).map((x,i)=>({...x,position:i+1})),
   selected,compared_candidates:ranked.length,
   complete:ranked.length>0,
   note:ranked.length?"Contagem de votos registrados para o mesmo cargo e turno.":"Sem votos disponíveis neste recorte."
 };
}
