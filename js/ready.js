// js/ready.js — Helper untuk tunggu module Auth & Storage siap
// Dipakai oleh dashboard.js, input.js, history.js yang load sync
// tapi butuh window.Auth & window.Storage (di-set oleh ESM modules async).
//
// Whitelist nama modul (Auth/Storage/Exports) — tidak ada akses properti
// dinamis `global[name]` (membuka peluang object injection); nama lain
// langsung ditolak.

(function (global) {
  const ALLOWED = ["Auth", "Storage", "Exports", "Recurring"];
  function resolve(name) {
    if (name === "Auth") return global.Auth || null;
    if (name === "Storage") return global.Storage || null;
    if (name === "Exports") return global.Exports || null;
    if (name === "Recurring") return global.Recurring || null;
    return null;
  }

  global.waitFor = async function (name, timeout = 5000) {
    if (!ALLOWED.includes(name)) {
      throw new Error(`[LK] Nama modul tidak dikenal: ${String(name)}`);
    }
    const start = Date.now();
    while (!resolve(name)) {
      if (Date.now() - start > timeout) {
        throw new Error(`[LK] Timeout menunggu window.${name} (${timeout}ms)`);
      }
      await new Promise((r) => setTimeout(r, 30));
    }
    return resolve(name);
  };

  global.waitForAuth = () => global.waitFor("Auth");
  global.waitForStorage = () => global.waitFor("Storage");
  global.waitForExports = () => global.waitFor("Exports");
})(window);
