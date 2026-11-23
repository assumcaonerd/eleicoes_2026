/* Service worker do Siga o Voto (PWA).
 *
 * Regras:
 * - Páginas (navegação): network-first. A resposta da rede sempre vence e, quando
 *   é uma página HTML 200 sem "no-store", vira a cópia em cache daquela URL.
 *   Sem conexão, usamos a última cópia da página; sem cópia, a página /offline.
 * - Redirecionamentos (ex.: /app -> /login quando não há sessão, que é o caso
 *   normal ao abrir o app instalado no iPhone, porque ele não compartilha cookies
 *   com o Safari): o WebKit recusa entregar a uma navegação uma resposta que veio
 *   de redirecionamento. Por isso buscamos com redirect:"follow" e devolvemos um
 *   redirecionamento limpo para a URL final, para o navegador seguir sozinho.
 * - Login e logout (POST) apagam as páginas guardadas, para que uma pessoa
 *   nunca veja a cópia offline do painel de outra.
 * - /api e dados: nunca guardados (passam direto).
 * - Arquivos estáticos da marca (/assets/siga-voto/*, favicon): servidos do
 *   cache e atualizados em segundo plano.
 * - Qualquer outra coisa (POST, outros domínios, fotos de candidatos): passa direto.
 *
 * Ao mudar este arquivo, troque VERSION para descartar caches antigos.
 */
const VERSION = "sov-pwa-v2";
const PAGES = "sov-pages-v2";
const OFFLINE_URL = "/offline";
const PRECACHE = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/favicon.ico",
  "/assets/siga-voto/favicon-v1.svg",
  "/assets/siga-voto/favicon-192-v1.png",
  "/assets/siga-voto/icon-512-v1.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== PAGES).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isStaticAsset(url) {
  return url.pathname === "/favicon.ico" || url.pathname === "/manifest.webmanifest" || url.pathname.startsWith("/assets/siga-voto/");
}

function isCacheablePage(response) {
  if (!response || response.status !== 200 || response.type !== "basic") return false;
  if (!/text\/html/i.test(response.headers.get("content-type") || "")) return false;
  return !/no-store/i.test(response.headers.get("cache-control") || "");
}

async function networkFirstPage(event) {
  const request = event.request;
  try {
    const response = await fetch(request.url, {
      method: "GET",
      credentials: "include",
      redirect: "follow",
      cache: "no-store",
      headers: { accept: "text/html" },
    });
    if (response.redirected) return Response.redirect(response.url, 303);
    if (isCacheablePage(response)) {
      const copy = response.clone();
      event.waitUntil(caches.open(PAGES).then((cache) => cache.put(request.url, copy)).catch(() => {}));
    }
    return response;
  } catch (error) {
    const pages = await caches.open(PAGES);
    const cached = await pages.match(request.url);
    if (cached) return cached;
    const offline = await caches.match(OFFLINE_URL);
    return offline || Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.method !== "GET") {
    if (request.method === "POST" && (url.pathname === "/login" || url.pathname === "/logout")) {
      event.waitUntil(caches.delete(PAGES));
    }
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirstPage(event));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(VERSION).then((cache) =>
        cache.match(request).then((cached) => {
          const network = fetch(request)
            .then((response) => {
              if (response.ok) cache.put(request, response.clone());
              return response;
            })
            .catch(() => cached || Response.error());
          if (cached) {
            event.waitUntil(network.then(() => {}, () => {}));
            return cached;
          }
          return network;
        })
      )
    );
  }
});
