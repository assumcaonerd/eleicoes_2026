export type NormalizedCandidate = {
  tseCandidateId?: string;
  number: string;
  ballotName: string;
  fullName?: string;
  partyNumber?: string;
  partyAbbr?: string;
  status?: string;
  votes: number;
};

const first = (...values: unknown[]) => values.find((v) => v !== undefined && v !== null && v !== "");
const int = (v: unknown) => Number(String(v ?? "0").replace(/\D/g, "")) || 0;

export function extractCandidates(payload: any): NormalizedCandidate[] {
  const out: NormalizedCandidate[] = [];
  const seen = new Map<string, NormalizedCandidate>();

  const pushCandidate = (row:any, ctx:{partyAbbr?:string;partyNumber?:string}) => {
    if (!row || typeof row !== "object") return;
    const number = String(first(row.n, row.nr, row.numero, row.numeroCandidato) ?? "").trim();
    const ballotName = String(first(row.nmu, row.nm, row.nomeUrna, row.nome) ?? "").trim();
    if (!number || !ballotName) return;
    const normalized: NormalizedCandidate = {
      tseCandidateId: String(first(row.sqcand, row.seq, row.id) ?? "") || undefined,
      number,
      ballotName,
      fullName: String(first(row.nm, row.nmc, row.nomeCompleto) ?? "") || undefined,
      partyNumber: String(first(row.np, row.numeroPartido, ctx.partyNumber) ?? "") || undefined,
      partyAbbr: String(first(row.sg, row.sgp, row.sigla, ctx.partyAbbr) ?? "") || undefined,
      status: String(first(row.st, row.sit, row.situacao) ?? "") || undefined,
      votes: int(first(row.vap, row.votos, row.v, row.qt, row.totalVotos)),
    };
    const key = `${normalized.number}:${normalized.tseCandidateId ?? normalized.ballotName}`;
    const previous = seen.get(key);
    if (!previous || normalized.votes >= previous.votes) seen.set(key, normalized);
  };

  const walk = (value:any, ctx:{partyAbbr?:string;partyNumber?:string}={}, depth=0) => {
    if (!value || depth > 12) return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item, ctx, depth + 1);
      return;
    }
    if (typeof value !== "object") return;

    const next = {
      partyAbbr: String(first(value.sg, value.sgp, value.sigla, ctx.partyAbbr) ?? "") || undefined,
      partyNumber: String(first(value.n, value.np, value.numeroPartido, ctx.partyNumber) ?? "") || undefined,
    };

    if (Array.isArray(value.cand)) {
      for (const candidate of value.cand) pushCandidate(candidate, next);
    }

    for (const [key, child] of Object.entries(value)) {
      if (key === "cand") continue;
      walk(child, next, depth + 1);
    }
  };

  walk(payload);

  if (seen.size === 0) {
    const fallback = (value:any, depth=0) => {
      if (!value || depth > 10) return;
      if (Array.isArray(value)) {
        for (const row of value) {
          if (row && typeof row === "object" && ("vap" in row) && ("n" in row || "nr" in row)) pushCandidate(row, {});
          fallback(row, depth + 1);
        }
      } else if (typeof value === "object") {
        for (const child of Object.values(value)) fallback(child, depth + 1);
      }
    };
    fallback(payload);
  }

  out.push(...seen.values());
  return out;
}

export function discoverMunicipalities(payload: any) {
  const out: Array<{ uf: string; code: string; ibgeCode?: string; name: string; zones: number[] }> = [];

  if (Array.isArray(payload?.abr)) {
    for (const state of payload.abr) {
      const uf = String(state?.cd ?? "").toUpperCase();
      if (!/^[A-Z]{2}$/.test(uf) || !Array.isArray(state?.mu)) continue;
      for (const municipality of state.mu) {
        const code = String(municipality?.cd ?? "").trim();
        const name = String(municipality?.nm ?? "").trim();
        const ibgeCode = String(municipality?.cdi ?? "").trim() || undefined;
        const zones: number[] = Array.isArray(municipality?.z)
          ? municipality.z
              .map((z:any) => Number(String(z)))
              .filter((z:number) => Number.isFinite(z))
          : [];
        if (/^\d{5}$/.test(code) && name) {
          out.push({ uf, code, ibgeCode, name, zones:[...new Set(zones)] });
        }
      }
    }
    return out;
  }

  const visit = (value:any, inheritedUf?:string, depth=0) => {
    if (!value || depth > 10) return;
    if (Array.isArray(value)) return value.forEach(v => visit(v, inheritedUf, depth + 1));
    if (typeof value !== "object") return;

    const stateCode = typeof value.cd === "string" && /^[a-z]{2}$/i.test(value.cd) && Array.isArray(value.mu)
      ? value.cd.toUpperCase()
      : inheritedUf;
    if (Array.isArray(value.mu) && stateCode) {
      for (const municipality of value.mu) visit(municipality, stateCode, depth + 1);
    }

    const code = String(first(value.cdmun, value.codigo, value.cd) ?? "").trim();
    const name = String(first(value.nmmun, value.nome, value.nm) ?? "").trim();
    const zonesRaw = first(value.z, value.zonas, value.zn);
    const zones: number[] = Array.isArray(zonesRaw)
      ? zonesRaw
          .map((z:any) => Number(first(z?.cd, z?.n, z?.z, z)))
          .filter((z:number) => Number.isFinite(z))
      : [];
    if (stateCode && /^\d{5}$/.test(code) && name) out.push({ uf:stateCode, code, name, zones:[...new Set(zones)] });

    for (const [key,child] of Object.entries(value)) {
      if (key === "mu") continue;
      visit(child, stateCode, depth + 1);
    }
  };

  visit(payload);
  const map = new Map<string, typeof out[number]>();
  for (const row of out) map.set(`${row.uf}:${row.code}`, row);
  return [...map.values()];
}
