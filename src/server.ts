import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import { config } from "./config.js";
import { candidateSummary, searchCandidates, votesByLevel } from "./tools/queries.js";
import { handleWeb } from "./web/handler.js";

const here = dirname(fileURLToPath(import.meta.url));
const widget = readFileSync(join(here, "ui", "results-widget.html"), "utf8");
const resourceUri = "ui://votos-por-secao/results-v1.html";

function makeMcpServer() {
  const mcp = new McpServer({ name: "votos-por-secao-2026", version: "0.1.0" }, {
    instructions: "Consulte somente dados eleitorais oficiais de 2026 armazenados nesta base. Não faça previsões, recomendações políticas ou inferências sobre intenção de voto. Identifique candidato, cargo e UF antes de detalhar município, bairro, zona ou seção."
  });

  registerAppResource(mcp, "results-widget", resourceUri, {}, async () => ({
    contents: [{ uri: resourceUri, mimeType: RESOURCE_MIME_TYPE, text: widget }]
  }));

  registerAppTool(mcp, "buscar_candidato", {
    title: "Buscar candidato de 2026",
    description: "Localiza candidato das Eleições 2026 por nome ou número, com filtros opcionais de cargo e UF.",
    inputSchema: {
      query: z.string().min(1),
      officeCode: z.number().int().optional(),
      uf: z.string().length(2).optional(),
    },
    _meta: { ui: { resourceUri } },
  }, async (args) => {
    const rows = await searchCandidates(args);
    return { content: [{ type: "text", text: JSON.stringify(rows) }], structuredContent: { rows } };
  });

  registerAppTool(mcp, "resumo_candidato", {
    title: "Resumo da votação",
    description: "Retorna identificação do candidato e total geral de votos registrados na base local de 2026.",
    inputSchema: { candidateId: z.number().int().positive() },
    _meta: { ui: { resourceUri } },
  }, async ({ candidateId }) => {
    const result = await candidateSummary(candidateId);
    return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
  });

  registerAppTool(mcp, "votos_detalhados", {
    title: "Votos detalhados",
    description: "Consulta votos do candidato por município, bairro, zona, local de votação ou seção eleitoral, sempre a partir da base local de 2026.",
    inputSchema: {
      candidateId: z.number().int().positive(),
      level: z.enum(["municipality", "neighborhood", "zone", "polling_place", "section"]),
      municipalityCode: z.string().optional(),
      neighborhood: z.string().optional(),
      zone: z.number().int().optional(),
      limit: z.number().int().min(1).max(500).optional(),
      offset: z.number().int().min(0).optional(),
    },
    _meta: { ui: { resourceUri } },
  }, async (args) => {
    const rows = await votesByLevel(args);
    const summary = await candidateSummary(args.candidateId);
    const structuredContent = { ...summary, rows, level: args.level };
    return { content: [{ type: "text", text: JSON.stringify(structuredContent) }], structuredContent };
  });

  return mcp;
}

const server = createServer(async (req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, app: "Votos por Seção", year: 2026 }));
    return;
  }
  if (await handleWeb(req, res)) return;
  if (req.url !== "/mcp" || process.env.ENABLE_MCP !== "true") {
    res.writeHead(404); res.end("Not found"); return;
  }
  const mcp = makeMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => { transport.close(); mcp.close(); });
  await mcp.connect(transport);
  await transport.handleRequest(req, res);
});

server.listen(config.port, () => console.log(`Votos por Seção MCP: http://localhost:${config.port}/mcp`));
