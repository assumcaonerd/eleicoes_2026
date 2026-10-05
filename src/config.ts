export const config = {
  port: Number(process.env.PORT ?? 8787),
  databaseUrl: process.env.DATABASE_URL ?? "postgres://eleicoes:eleicoes@localhost:5432/eleicoes_2026",
  tseBaseUrl: process.env.TSE_BASE_URL ?? "https://resultados.tse.jus.br/oficial",
  tseCycle: process.env.TSE_CYCLE ?? "ele2026",
  federalElection: Number(process.env.TSE_FEDERAL_ELECTION ?? 6257),
  stateElection: Number(process.env.TSE_STATE_ELECTION ?? 6259),
  requestsPerSecond: Math.max(1, Number(process.env.TSE_REQUESTS_PER_SECOND ?? 8)),
  downloadConcurrency: Math.max(1, Number(process.env.TSE_DOWNLOAD_CONCURRENCY ?? 4)),
  rawDataDir: process.env.RAW_DATA_DIR ?? "./data/raw",
};

export const offices = {
  1: "Presidente",
  3: "Governador",
  5: "Senador",
  6: "Deputado Federal",
  7: "Deputado Estadual/Distrital",
} as const;
