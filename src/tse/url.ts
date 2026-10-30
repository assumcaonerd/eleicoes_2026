import { config } from "../config.js";

export const pad = (value: string | number, size: number) => String(value).padStart(size, "0");

export function electionIdForOffice(office: number, round = 1) {
  if (round === 2) {
    if (![1,3].includes(office)) throw new Error("Cargo sem segundo turno.");
    return office === 1 ? 6258 : 6260;
  }
  if (round !== 1) throw new Error("Turno inválido.");
  return office === 1 ? config.federalElection : config.stateElection;
}

export function scopeResultUrl(args: {
  office: number;
  round?: number;
  uf: string;
  municipalityCode?: string;
  zone?: number;
}) {
  const election = electionIdForOffice(args.office, args.round);
  const uf = args.uf.toLowerCase();
  const cargo = pad(args.office, 4);
  const ele = pad(election, 6);

  if (!args.municipalityCode) {
    const folder = args.office === 1 ? "br" : uf;
    const prefix = args.office === 1 ? "br" : uf;
    return `${config.tseBaseUrl}/${config.tseCycle}/${election}/dados/${folder}/${prefix}-c${cargo}-e${ele}-u.json`;
  }

  const municipality = pad(args.municipalityCode, 5);
  const zone = args.zone == null ? "" : `-z${pad(args.zone, 4)}`;
  return `${config.tseBaseUrl}/${config.tseCycle}/${election}/dados/${uf}/${uf}${municipality}${zone}-c${cargo}-e${ele}-u.json`;
}

export function municipalityConfigUrl(electionId = config.stateElection) {
  return `${config.tseBaseUrl}/${config.tseCycle}/${electionId}/config/mun-e${pad(electionId, 6)}-cm.json`;
}

export function electionConfigUrl() {
  return `${config.tseBaseUrl}/comum/config/ele-c.json`;
}
