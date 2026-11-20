import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { hardenRequest } from "../src/web/http-hardening.js";

// Servidor mínimo que imita as rotas reais: só responde a GET.
const server = createServer((req, res) => {
  hardenRequest(req, res);
  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end("<h1>Siga o Voto</h1>");
    return;
  }
  res.writeHead(404); res.end("Not found");
});
await new Promise<void>((resolve) => server.listen(0, resolve));
const port = (server.address() as { port: number }).port;

function call(method: string, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; headers: Record<string, unknown>; body: string }>((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path: "/", method, headers }, (res) => {
      let body = ""; res.setEncoding("utf8");
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    req.on("error", reject); req.end();
  });
}

try {
  const get = await call("GET");
  const head = await call("HEAD");
  assert.equal(get.status, 200);
  assert.equal(head.status, 200, "HEAD deve responder como GET");
  assert.equal(head.body, "", "HEAD não envia corpo");
  assert.equal(head.headers["content-type"], get.headers["content-type"]);

  assert.equal(get.headers["strict-transport-security"], undefined, "sem HTTPS, sem HSTS");
  const https = await call("GET", { "x-forwarded-proto": "https" });
  assert.equal(https.headers["strict-transport-security"], "max-age=31536000");
  const proxied = await call("HEAD", { "x-forwarded-proto": "https, http" });
  assert.equal(proxied.headers["strict-transport-security"], "max-age=31536000");

  assert.equal((await call("POST")).status, 404, "outros métodos continuam iguais");
  console.log("HTTP: HEAD como GET sem corpo, HSTS só em HTTPS, demais métodos inalterados.");
} finally {
  server.close();
}
