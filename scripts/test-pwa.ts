import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer, request } from "node:http";
import sharp from "sharp";
import { handleWeb } from "../src/web/handler.js";

// Rotas do app instalável (PWA) servidas pelo handler real, sem banco de dados.
const server = createServer(async (req, res) => {
  if (!(await handleWeb(req, res))) { res.writeHead(404); res.end(); }
});
await new Promise<void>((resolve) => server.listen(0, resolve));
const port = (server.address() as { port: number }).port;

function get(path: string) {
  return new Promise<{ status: number; headers: Record<string, unknown>; body: Buffer }>((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path, method: "GET" }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on("error", reject); req.end();
  });
}

try {
  const manifestRes = await get("/manifest.webmanifest");
  assert.equal(manifestRes.status, 200);
  assert.match(String(manifestRes.headers["content-type"]), /^application\/manifest\+json/);
  const manifest = JSON.parse(manifestRes.body.toString("utf8"));
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/app");
  assert.equal(manifest.scope, "/");
  assert.ok(manifest.name && manifest.short_name);

  // Todo ícone declarado existe e tem o tamanho declarado; há 192 e 512, comum e maskable.
  for (const icon of manifest.icons) {
    const r = await get(icon.src);
    assert.equal(r.status, 200, icon.src);
    const meta = await sharp(r.body).metadata();
    assert.equal(`${meta.width}x${meta.height}`, icon.sizes, icon.src);
  }
  for (const purpose of ["any", "maskable"]) for (const size of ["192x192", "512x512"]) {
    assert.ok(manifest.icons.some((i: any) => i.purpose === purpose && i.sizes === size), `${purpose} ${size}`);
  }

  const sw = await get("/sw.js");
  assert.equal(sw.status, 200);
  assert.match(String(sw.headers["content-type"]), /javascript/);
  assert.equal(sw.headers["cache-control"], "no-cache");
  // Tudo o que o service worker guarda na instalação precisa existir; se um falhar, a instalação falha.
  const swSource = sw.body.toString("utf8");
  const block = swSource.match(/const PRECACHE = \[([\s\S]*?)\];/)?.[1] ?? "";
  const offlineUrl = swSource.match(/const OFFLINE_URL = "([^"]+)"/)?.[1];
  const precache = [...block.matchAll(/"(\/[^"]*)"/g)].map((m) => m[1]);
  if (offlineUrl && /\bOFFLINE_URL\b/.test(block)) precache.push(offlineUrl);
  assert.ok(precache.includes("/offline") && precache.length >= 5, "lista de precache encontrada");
  for (const path of precache) assert.equal((await get(path)).status, 200, "precache " + path);
  // Páginas (navegação): network-first, com redirecionamento limpo (exigência do WebKit/iOS).
  assert.match(swSource, /request\.mode === "navigate"[\s\S]*?networkFirstPage/);
  assert.match(swSource, /redirect: "follow"/);
  assert.match(swSource, /response\.redirected\) return Response\.redirect\(response\.url, 303\)/);
  // Login/logout apagam as páginas guardadas; HTML com no-store nunca entra no cache.
  assert.match(swSource, /\/logout"[\s\S]*?caches\.delete\(PAGES\)/);
  assert.match(swSource, /no-store/);
  assert.match(swSource, /pathname\.startsWith\("\/assets\/siga-voto\/"\)/);

  // /app sem sessão redireciona: é exatamente o caso do app recém-instalado no iPhone.
  const app = await get("/app");
  assert.equal(app.status, 303);
  assert.equal(app.headers.location, "/login");

  const offline = await get("/offline");
  assert.equal(offline.status, 200);
  const page = offline.body.toString("utf8");
  assert.match(page, /<link rel="manifest" href="\/manifest\.webmanifest">/);
  assert.match(page, /apple-mobile-web-app-capable/);
  assert.match(page, /id="sov-install" hidden/);
  assert.match(page, /serviceWorker\.register\('\/sw\.js',\{scope:'\/',updateViaCache:'none'\}\)/);

  assert.equal(readFileSync(new URL("../src/ui/sw.js", import.meta.url), "utf8"), swSource);
  console.log("PWA: manifesto, ícones, service worker, precache e página offline ok.");
} finally {
  server.close();
}
