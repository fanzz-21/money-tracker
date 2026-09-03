// sw.js — Kas Harian service worker (PWA)
// Strategi:
//   - Navigasi (HTML): network-first, fallback ke cache (offline-ready).
//   - Static assets (CSS, JS, manifest, ikon): stale-while-revalidate.
//   - Supabase API & CDN supabase-js: selalu network (tidak di-cache).
//
// Bump CACHE_VERSION untuk invalidate cache lama. Browser akan download SW
// baru otomatis karena URL sama; handler "activate" di bawah bersihkan cache
// versi lama dan paksa klien pakai SW baru.

const CACHE_VERSION = "v4";
const SHELL_CACHE = "lk-shell-" + CACHE_VERSION;
const STATIC_CACHE = "lk-static-" + CACHE_VERSION;

const SHELL = [
  "./",
  "./index.html",
  "./input.html",
  "./history.html",
  "./login.html",
  "./css/ui.css",
  "./js/supabase.js",
  "./js/config.js",
  "./js/auth.js",
  "./js/storage.js",
  "./js/realtime.js",
  "./js/budget.js",
  "./js/storage-backup.js",
  "./js/migrate.js",
  "./js/notify.js",
  "./js/theme.js",
  "./js/ready.js",
  "./js/pwa.js",
  "./js/chart.js",
  "./js/dashboard.js",
  "./js/input.js",
  "./js/history.js",
  "./js/login.js",
  "./js/tailwind-config.js",
  "./js/insight.js",
  "./js/recurring.js",
  "./js/recurring-ui.js",
  "./js/savings.js",
  "./js/savings-ui.js",
  "./recurring.html",
  "./savings.html",
  "./profile.html",
  "./manifest.webmanifest",
  "./icon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./vercel.json"
];

self.addEventListener("install", (event) => {
  // Pre-cache shell agar halaman pertama bisa dibuka offline.
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((c) => c.addAll(SHELL))
      .catch(() => { /* gagal pre-cache bukan fatal */ })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  // Bersihkan cache versi lama, ambil alih klien yang ada.
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== STATIC_CACHE)
          .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

function isSupabase(url) {
  return /supabase\.co|jsdelivr\.net|googleapis\.com|gstatic\.com|tailwindcss\.com/.test(url.host);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // POST/PUT selalu network
  const url = new URL(req.url);

  // Network-only untuk Supabase & CDN eksternal — biar realtime/auth selalu fresh.
  if (isSupabase(url)) return;

  // Navigasi HTML: network-first, fallback ke cache.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Simpan salinan HTML terbaru ke cache shell.
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("./index.html")))
    );
    return;
  }

  // Static asset: stale-while-revalidate.
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetched = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(STATIC_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetched;
    })
  );
});
