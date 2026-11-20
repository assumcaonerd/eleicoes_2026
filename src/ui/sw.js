/* Service worker do Siga o Voto (PWA).
 *
 * Regras:
 * - Páginas (navegação) e /api: sempre da rede. Nunca guardamos HTML nem dados,
 *   porque dependem do login e da assinatura de quem está usando.
 *   Sem conexão, mostramos a página /offline guardada na instalação.
 * - Arquivos estáticos da marca (/assets/siga-voto/*, favicon): servidos do
 *   cache e atualizados em segundo plano.
 * - Qualquer outra coisa (POST, outros domínios, fotos de candidatos): passa direto.
 *
 * Ao mudar este arquivo, troque VERSION para descartar caches antigos.
 */
const VERSION = "sov-pwa-v1";
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
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isStaticAsset(url) {
  return url.pathname === "/favicon.ico" || url.pathname === "/manifest.webmanifest" || url.pathname.startsWith("/assets/siga-voto/");
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL).then((r) => r || Response.error()))
    );
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
            .catch(() => cached);
          return cached || network;
        })
      )
    );
  }
});
