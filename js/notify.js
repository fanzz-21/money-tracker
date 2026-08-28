// js/notify.js — Toast notification + cross-tab sync helpers
// Dipakai oleh input.js, dashboard.js, history.js untuk:
//   1. Toast success/error message
//   2. Broadcast events antar tab (supaya dashboard auto-refresh saat input.html tambah data)

(function (global) {
  const CHANNEL_NAME = "lk-tx-sync";

  function $(id) { return document.getElementById(id); }

  // ---------- Toast ----------
  let toastTimer = null;
  function toast(msg, kind = "info") {
    const el = $("toast");
    if (!el) { console.log(`[toast:${kind}]`, msg); return; }
    el.textContent = msg;
    el.className = "lk-toast " + (kind === "success" ? "lk-toast-success" : kind === "error" ? "lk-toast-error" : "");
    el.classList.remove("hidden");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add("hidden"), 2500);
  }

  // ---------- Cross-tab broadcast ----------
  // Pakai BroadcastChannel kalau ada, fallback ke localStorage event
  let bc = null;
  try {
    if (typeof BroadcastChannel !== "undefined") {
      bc = new BroadcastChannel(CHANNEL_NAME);
    }
  } catch (e) { /* ignore */ }

  function broadcast(type, payload) {
    const msg = { type, payload, ts: Date.now() };
    if (bc) {
      try { bc.postMessage(msg); } catch (e) { /* ignore */ }
    }
    // Fallback: tulis ke localStorage, trigger 'storage' event di tab lain
    try {
      localStorage.setItem("lk-event", JSON.stringify(msg));
    } catch (e) { /* ignore */ }
  }

  function on(event, handler) {
    if (bc) {
      bc.addEventListener("message", (e) => {
        if (e.data && e.data.type === event) handler(e.data.payload, e.data);
      });
    }
    if (typeof window !== "undefined") {
      window.addEventListener("storage", (e) => {
        if (e.key !== "lk-event" || !e.newValue) return;
        try {
          const msg = JSON.parse(e.newValue);
          if (msg && msg.type === event) handler(msg.payload, msg);
        } catch (err) { /* ignore */ }
      });
    }
  }

  // HTML escape untuk mencegah XSS saat render user input via innerHTML.
  // Dipakai oleh dashboard.js, history.js, dll. Escape 5 karakter危险的.
  function escapeHTML(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  global.LK = { toast, broadcast, on, escapeHTML };
})(window);
