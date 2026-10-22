// sw.js - Service worker: shell cacheado + librerías CDN cacheadas (funciona offline).
const VERSION = 'cotizador-v1.1.0';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css', 'app.js', 'state.js', 'store.js', 'firebase-config.js', 'defaults.js', 'engine.js',
  'i18n.js', 'ui.js', 'util.js', 'pdf.js', 'cotizacion.js', 'planos.js', 'precios.js', 'ajustes.js',
  'licitaciones.js', 'licitaciones-costeo.js', 'licitaciones-borradores.js', 'bids-parse.js', 'bids-fit.js', 'bids-calc.js', 'bids-drafts.js', 'bids-ejemplo.js',
  'fonts/poppins-400.woff2', 'fonts/poppins-400-ext.woff2', 'fonts/poppins-600.woff2', 'fonts/poppins-700.woff2',
  'icons/isotipo-teal.png', 'icons/logo-color.png', 'icons/logo-pdf.png', 'icons/logo-white.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png',
];
const CDN = [
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
];
self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await c.addAll(SHELL);
    await Promise.all(CDN.map((u) => fetch(u, { mode: 'cors' }).then((r) => r.ok && c.put(u, r)).catch(() => {}))); // si falla, se cachea al primer uso
    self.skipWaiting();
  })());
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const mismo = url.origin === location.origin;
  const cdn = /(^|\.)gstatic\.com$|cdnjs\.cloudflare\.com$/.test(url.hostname);
  if (!mismo && !cdn) return; // Firestore/Auth (googleapis.com) van directo a la red
  e.respondWith((async () => {
    const c = await caches.open(VERSION);
    const hit = await c.match(req, { ignoreSearch: mismo });
    // Mismo origen: red primero (para recibir actualizaciones), caché como respaldo. CDN: caché primero.
    if (hit && !mismo) return hit;
    try {
      const r = await fetch(req);
      if (r.ok) c.put(req, r.clone());
      return r;
    } catch (err) {
      if (hit) return hit;
      if (req.mode === 'navigate') return (await c.match('index.html')) || Response.error();
      return Response.error();
    }
  })());
});
