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

function asArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function findCandidateArrays(root: any): any[][] {
  const found: any[][] = [];
  const seen = new Set<any>();
  const visit = (value: any, depth = 0) => {
    if (!value || depth > 8 || seen.has(value)) return;
    if (typeof value === "object") seen.add(value);
    if (Array.isArray(value)) {
      if (value.some((x) => x && typeof x === "object" && ("n" in x || "nm" in x || "cand" in x || "vap" in x))) {
        found.push(value);
      }
      for (const item of value) visit(item, depth + 1);
    } else if (typeof value === "object") {
      for (const child of Object.values(value)) visit(child, depth + 1);
    }
  };
  visit(root);
  return found;
}

const first = (...values: unknown[]) => values.find((v) => v !== undefined && v !== null && v !== "");
const int = (v: unknown) => Number(String(v ?? "0").replace(/\D/g, "")) || 0;

export function extractCandidates(payload: any): NormalizedCandidate[] {
  const arrays = findCandidateArrays(payload);
  const rows = arrays.flatMap(asArray);
  const byKey = new Map<string, NormalizedCandidate>();

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const number = String(first(row.n, row.nr, row.numero, row.numeroCandidato, row.cand?.n) ?? "").trim();
    const ballotName = String(first(row.nm, row.nmu, row.nome, row.nomeUrna, row.cand?.nm) ?? "").trim();
    const votes = int(first(row.vap, row.votos, row.v, row.qt, row.totalVotos));
    if (!number || !ballotName) continue;

    const normalized: NormalizedCandidate = {
      tseCandidateId: String(first(row.sqcand, row.seq, row.id, row.cand?.sqcand) ?? "") || undefined,
      number,
      ballotName,
      fullName: String(first(row.nmc, row.nomeCompleto, row.cand?.nmc) ?? "") || undefined,
      partyNumber: String(first(row.np, row.numeroPartido, row.partido?.n) ?? "") || undefined,
      partyAbbr: String(first(row.sg, row.sgp, row.sigla, row.partido?.sg) ?? "") || undefined,
      status: String(first(row.st, row.sit, row.situacao) ?? "") || undefined,
      votes,
    };
    const key = `${normalized.number}:${normalized.tseCandidateId ?? normalized.ballotName}`;
    const previous = byKey.get(key);
    if (!previous || normalized.votes > previous.votes) byKey.set(key, normalized);
  }
  return [...byKey.values()];
}

export function discoverMunicipalities(payload: any) {
  const out: Array<{ uf: string; code: string; name: string; zones: number[] }> = [];
  const visit = (value: any, inheritedUf?: string, depth = 0) => {
    if (!value || depth > 10) return;
    if (Array.isArray(value)) return value.forEach((v) => visit(v, inheritedUf, depth + 1));
    if (typeof value !== "object") return;
    const uf = String(first(value.sg, value.uf, value.sgui, inheritedUf) ?? "").toUpperCase();
    const code = String(first(value.cd, value.cdmun, value.codigo, value.mun?.cd) ?? "").trim();
    const name = String(first(value.nm, value.nmmun, value.nome, value.mun?.nm) ?? "").trim();
    const zonesRaw = first(value.z, value.zonas, value.zn, value.mun?.z);
    const zones = Array.isArray(zonesRaw)
      ? zonesRaw.map((z: any) => Number(first(z.cd, z.n, z.z, z))).filter(Number.isFinite)
      : [];
    if (/^[A-Z]{2}$/.test(uf) && /^\d{4,5}$/.test(code) && name) out.push({ uf, code, name, zones: [...new Set(zones)] });
    for (const child of Object.values(value)) visit(child, uf || inheritedUf, depth + 1);
  };
  visit(payload);
  const map = new Map<string, typeof out[number]>();
  for (const row of out) map.set(`${row.uf}:${row.code}`, row);
  return [...map.values()];
}
