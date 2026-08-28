// js/pwa.js — Register service worker + inject PWA meta ke head
// Dipanggil dari setiap halaman. Aman dipanggil di browser yang tidak
// support SW (hanya no-op, tidak throw).

(function () {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  // ---- Inject manifest link & theme-color jika belum ada ----
  try {
    if (!document.querySelector('link[rel="manifest"]')) {
      const link = document.createElement("link");
      link.rel = "manifest";
      link.href = "manifest.webmanifest";
      document.head.appendChild(link);
    }
    if (!document.querySelector('meta[name="theme-color"]')) {
      const meta = document.createElement("meta");
      meta.name = "theme-color";
      meta.content = "#0ea5e9";
      document.head.appendChild(meta);
    }
    // Apple touch icon (Safari iOS pakai link rel=apple-touch-icon, bukan manifest)
    if (!document.querySelector('link[rel="apple-touch-icon"]')) {
      const a = document.createElement("link");
      a.rel = "apple-touch-icon";
      a.href = "icon-192.png";
      document.head.appendChild(a);
    }
  } catch (e) { /* ignore DOM errors */ }

  // ---- Register service worker ----
  if (!("serviceWorker" in navigator)) return;
  // Jangan register saat file:// (saat preview lokal) — protocol tak didukung SW.
  if (location.protocol !== "http:" && location.protocol !== "https:") return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js")
      .then((reg) => {
        // Listener update — auto reload ketika SW baru aktif.
        reg.addEventListener("updatefound", () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener("statechange", () => {
            if (sw.state === "activated" && navigator.serviceWorker.controller) {
              // SW baru接管. Reload halus supaya klien baru ambil aset fresh.
              // Skip auto-reload agar tidak ganggu — cache sudah updated.
            }
          });
        });
      })
      .catch(() => { /* SW gagal (mis. devtools 404) — abaikan */ });
  });
})();
