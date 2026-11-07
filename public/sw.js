// Service worker di Pianta Libera: l'app si apre anche senza rete dopo la prima visita.
// - pagina: prima la rete (così gli aggiornamenti arrivano subito), senza rete la copia salvata;
// - librerie dei CDN con versione fissa: dalla copia salvata (non cambiano mai);
// - immagini e modelli dell'app: copia salvata, aggiornata in background;
// - /api/*: mai in cache (render, link per il cliente, configurazione).
const CACHE = "pianta-libera-v1";
const SHELL = ["./", "manifest.webmanifest", "assets/app/icon-192.png", "assets/app/icon-512.png", "privacy.html", "termini.html"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("pianta-libera-") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
const keep = r => r && r.ok && r.type !== "opaque";
async function put(req, res){ if (keep(res)) { const c = await caches.open(CACHE); await c.put(req, res.clone()); } return res; }
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET") return;
  if (url.origin === location.origin && url.pathname.includes("/api/")) return;
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then(r => put(new Request(url.origin + url.pathname), r)).catch(async () => (await caches.match(url.origin + url.pathname)) || (await caches.match("./")) || Response.error()));
    return;
  }
  if (url.hostname === "cdn.jsdelivr.net" && /@\d/.test(url.pathname)) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => put(req, r))));
    return;
  }
  if (url.origin === location.origin) {
    e.respondWith(caches.match(req).then(hit => { const net = fetch(req).then(r => put(req, r)).catch(() => hit); return hit || net; }));
  }
});
