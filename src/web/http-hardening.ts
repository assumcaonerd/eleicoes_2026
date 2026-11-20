import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Ajustes aplicados a toda requisição antes do roteamento.
 *
 * 1. HEAD é tratado como GET. As rotas só conhecem GET, então HEAD caía em 404,
 *    o que confunde monitores de disponibilidade e geradores de prévia de link.
 *    O Node já omite o corpo de respostas a HEAD (decidido ao criar o
 *    ServerResponse), então só os cabeçalhos são enviados.
 * 2. HSTS quando a requisição chegou por HTTPS (Railway/Cloudflare informam em
 *    x-forwarded-proto): o navegador passa a usar sempre HTTPS no domínio.
 *    Sem includeSubDomains/preload de propósito, até o domínio raiz estar com
 *    certificado próprio.
 */
export function hardenRequest(req: IncomingMessage, res: ServerResponse) {
  if (req.method === "HEAD") req.method = "GET";
  const proto = String(req.headers["x-forwarded-proto"] ?? "").split(",")[0].trim().toLowerCase();
  if (proto === "https" || (req.socket as { encrypted?: boolean }).encrypted) {
    res.setHeader("strict-transport-security", "max-age=31536000");
  }
}
