// js/ready.js — Helper untuk tunggu module Auth & Storage siap
// Dipakai oleh dashboard.js, input.js, history.js yang load sync
// tapi butuh window.Auth & window.Storage (di-set oleh ESM modules async).

(function (global) {
  global.waitFor = async function (name, timeout = 5000) {
    const start = Date.now();
    while (!global[name]) {
      if (Date.now() - start > timeout) {
        throw new Error(`[LK] Timeout menunggu window.${name} (${timeout}ms)`);
      }
      await new Promise((r) => setTimeout(r, 30));
    }
    return global[name];
  };

  global.waitForAuth = () => global.waitFor("Auth");
  global.waitForStorage = () => global.waitFor("Storage");
})(window);
