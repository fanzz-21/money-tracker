// js/history.js — Riwayat dengan auto-refresh via cross-tab broadcast
//
// Keamanan: semua data user (category, note, id, label hapus) di-render via
// textContent / createElement (XSS-immune), atribut data-id via
// setAttribute. Kompleksitas: IIFE utama dipecah ke sub-fungsi bernama.

function historyFmtRp(n) {
  return "Rp " + Number(n || 0).toLocaleString("id-ID");
}

function makeTxRow(row) {
  const art = document.createElement("article");
  art.className = "px-4 py-3 border-t border-[var(--lk-border)] first:border-t-0 flex items-center justify-between gap-3 min-w-0";

  const left = document.createElement("div");
  left.className = "flex-1 min-w-0";

  const headRow = document.createElement("div");
  headRow.className = "flex items-center gap-2 flex-wrap";
  const catSpan = document.createElement("span");
  catSpan.className = "font-medium truncate";
  catSpan.textContent = row.category;
  const badge = document.createElement("span");
  const isIn = row.type === "in";
  badge.className = "text-xs px-1.5 py-0.5 rounded " +
    (isIn ? "lk-bg-success-soft lk-text-success" : "lk-bg-danger-soft lk-text-danger");
  badge.textContent = isIn ? "Masuk" : "Keluar";
  headRow.append(catSpan, badge);

  const noteP = document.createElement("p");
  noteP.className = "text-xs text-[var(--lk-text-muted)] truncate";
  noteP.textContent = row.note || "—";

  const d = new Date(row.date + "T00:00:00");
  const ts = new Date(row.ts);
  const metaP = document.createElement("p");
  metaP.className = "text-xs text-[var(--lk-text-faint)]";
  metaP.textContent =
    d.toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) +
    " \u00b7 " +
    ts.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

  left.append(headRow, noteP, metaP);

  const right = document.createElement("div");
  right.className = "text-right shrink-0 flex flex-col items-end gap-1";
  const amtP = document.createElement("p");
  amtP.className = "font-semibold tabular-nums " + (isIn ? "lk-money-in" : "lk-money-out");
  amtP.textContent = (isIn ? "+" : "\u2212") + " " + historyFmtRp(row.amount);

  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.setAttribute("data-action", "delete");
  delBtn.setAttribute("data-id", row.id);
  delBtn.className = "lk-btn-danger-ghost text-xs flex items-center gap-1";
  delBtn.setAttribute("aria-label", "Hapus transaksi " + row.category);
  const icon = document.createElement("span");
  icon.className = "material-symbols-outlined text-base";
  icon.textContent = "delete";
  const label = document.createElement("span");
  label.textContent = "Hapus";
  delBtn.append(icon, label);

  right.append(amtP, delBtn);
  art.append(left, right);
  return art;
}

(async function () {
  const Auth = await window.waitForAuth();
  const Storage = await window.waitForStorage();

  // Tunggu session valid dengan retry (kadang ada race condition di HP)
  let session = await Auth.requireAuth();
  if (!session) {
    console.log("[history] session null, retry after 1s...");
    await new Promise((r) => setTimeout(r, 1000));
    session = await Auth.requireAuth();
  }
  if (!session) {
    console.error("[history] tidak ada session, redirect ke login");
    location.replace("login.html");
    return;
  }
  console.log("[history] session OK, user:", session.id ? session.id.slice(0, 8) : session.email || "?");

  const monthSel = document.getElementById("filter-month");
  const typeSel = document.getElementById("filter-type");
  const searchInp = document.getElementById("search-note");
  const exportCsvBtn = document.getElementById("btn-export-csv");
  const exportXlsxBtn = document.getElementById("btn-export-xlsx");
  const exportJsonBtn = document.getElementById("btn-export-json");
  const importFile = document.getElementById("import-file");
  const resetBtn = document.getElementById("btn-reset");
  const list = document.getElementById("history-list");
  const empty = document.getElementById("history-empty");
  const sumCount = document.getElementById("sum-count");
  const sumIn = document.getElementById("sum-total-in");
  const sumOut = document.getElementById("sum-total-out");
  const sumNet = document.getElementById("sum-total-net");

  let items = [];
  let loadError = null;

  function setEmptyText(text) {
    if (empty) {
      empty.textContent = text;
      empty.hidden = false;
    }
  }

  function monthsPresent() {
    const set = new Set();
    items.forEach((t) => set.add(t.date.slice(0, 7)));
    return Array.from(set).sort().reverse();
  }

  function populateMonths() {
    // Clear existing options except the first
    while (monthSel.options.length > 1) monthSel.remove(1);
    monthsPresent().forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m;
      const parts = m.split("-");
      opt.textContent = new Date(parts[0], Number(parts[1]) - 1)
        .toLocaleDateString("id-ID", { year: "numeric", month: "long" });
      monthSel.appendChild(opt);
    });
  }

  function matchesFilter(t) {
    if (monthSel.value && t.date.slice(0, 7) !== monthSel.value) return false;
    if (typeSel.value && t.type !== typeSel.value) return false;
    const q = searchInp.value.trim().toLowerCase();
    if (q && !String(t.note || "").toLowerCase().includes(q)) return false;
    return true;
  }

  function render() {
    const filtered = items.filter(matchesFilter).sort((a, b) => (a.ts < b.ts ? 1 : -1));

    let inSum = 0, outSum = 0;
    filtered.forEach((t) => {
      const n = Number(t.amount) || 0;
      if (t.type === "in") inSum += n; else outSum += n;
    });

    sumCount.textContent = filtered.length + " transaksi";
    sumIn.textContent = "Masuk: " + historyFmtRp(inSum);
    sumOut.textContent = "Keluar: " + historyFmtRp(outSum);
    sumNet.textContent = "Saldo: " + historyFmtRp(inSum - outSum);

    if (!filtered.length) {
      empty.hidden = false;
      list.querySelectorAll("article").forEach((e) => e.remove());
      return;
    }
    empty.hidden = true;
    list.innerHTML = "";
    filtered.forEach((row) => list.appendChild(makeTxRow(row)));
  }

  async function reloadItems(opts) {
    const silent = !!(opts && opts.silent);
    try {
      const result = await Storage.loadAll({ force: true });
      items = Array.isArray(result) ? result : [];
      loadError = null;
      console.log("[history] reloadItems OK, items =", items.length);
      populateMonths();
      render();
    } catch (err) {
      loadError = err && err.message ? err.message : String(err);
      console.error("[history] loadAll failed:", loadError, err);
      if (!silent) {
        if (window.LK) window.LK.toast("Gagal memuat: " + loadError, "error");
        setEmptyText("Gagal memuat data. Coba refresh halaman. (" + loadError + ")");
      }
    }
  }

  function refreshFromBroadcast() {
    Storage.loadAll({ force: true })
      .then((all) => {
        items = Array.isArray(all) ? all : [];
        populateMonths();
        render();
      })
      .catch((err) => console.warn("[history] broadcast refresh gagal:", err));
  }

  function onDelete(e) {
    const btn = e.target.closest('[data-action="delete"]');
    if (!btn) return;
    const id = btn.getAttribute("data-id");
    const row = items.find((t) => t.id === id);
    if (!row) return;
    // Cari artikel parent untuk highlight yang akan dihapus
    const article = btn.closest("article");
    const sign = row.type === "in" ? "+" : "\u2212";
    const label = row.category + " \u2022 " + sign + "Rp " + Number(row.amount).toLocaleString("id-ID");
    if (!confirm("Hapus transaksi ini?\n\n" + label + (row.note ? "\nCatatan: " + row.note : ""))) {
      return;
    }
    if (article) {
      article.style.opacity = "0.4";
      article.style.pointerEvents = "none";
    }
    Storage.removeTx(id)
      .then(() => {
        const idx = items.findIndex((t) => t.id === id);
        if (idx !== -1) items.splice(idx, 1);
        populateMonths();
        render();
        if (window.LK) window.LK.toast("Transaksi dihapus", "success");
        if (window.LK) window.LK.broadcast("tx:removed", { id });
      })
      .catch((err) => {
        if (article) {
          article.style.opacity = "";
          article.style.pointerEvents = "";
        }
        if (window.LK) window.LK.toast("Gagal hapus: " + ((err && err.message) || "unknown"), "error");
      });
  }

  function bindExport() {
    // Modul ESM js/exports.js set window.Exports — tunggu sebelum bind.
    window.waitForExports().then((Exports) => {
      exportCsvBtn.addEventListener("click", () => {
        Exports.csv(items.filter(matchesFilter));
        if (window.LK) window.LK.toast("CSV diunduh", "success");
      });

      exportXlsxBtn.addEventListener("click", async () => {
        try {
          await Exports.xlsx(items.filter(matchesFilter));
          if (window.LK) window.LK.toast("Excel (.xlsx) diunduh", "success");
        } catch (err) {
          if (window.LK) window.LK.toast("Gagal export Excel: " + ((err && err.message) || "unknown") + " — coba CSV", "error");
        }
      });

      exportJsonBtn.addEventListener("click", () => {
        try {
          const json = Storage.exportToJSON(items);
          const date = Storage.todayISO();
          Exports.downloadBlob(new Blob([json], { type: "application/json" }),
            "fintrack-backup-" + date + ".json");
          if (window.LK) window.LK.toast("Backup " + items.length + " transaksi diunduh", "success");
        } catch (err) {
          if (window.LK) window.LK.toast("Gagal export: " + ((err && err.message) || "unknown"), "error");
        }
      });
    }).catch((err) => {
      console.error("[history] Exports tidak siap:", err);
    });
  }

  function bindImport() {
    importFile.addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      if (!confirm(
        'Restore dari file "' + file.name + '"?\n\n' +
        "Tindakan ini akan MENAMBAHKAN transaksi dari file backup ke data Anda saat ini. " +
        "Transaksi yang sudah ada TIDAK dihapus atau ditimpa."
      )) {
        importFile.value = "";
        return;
      }
      try {
        const text = await file.text();
        const result = await Storage.importFromJSON(text);
        if (window.LK) window.LK.toast(
          "Restore: " + result.inserted + " transaksi ditambahkan" +
          (result.skipped > 0 ? ", " + result.skipped + " dilewati" : ""),
          "success"
        );
        items = await Storage.loadAll({ force: true });
        populateMonths();
        render();
        if (window.LK) window.LK.broadcast("tx:added", { restored: result.inserted });
      } catch (err) {
        if (window.LK) window.LK.toast("Restore gagal: " + ((err && err.message) || "unknown"), "error");
      } finally {
        importFile.value = ""; // reset supaya bisa pilih file yang sama
      }
    });
  }

  function bindReset() {
    resetBtn.addEventListener("click", async () => {
      if (!items.length) {
        if (window.LK) window.LK.toast("Tidak ada data untuk dihapus", "info");
        return;
      }
      const firstConfirm = confirm(
        "PERINGATAN: Hapus SEMUA " + items.length + " transaksi?\n\n" +
        "Tindakan ini tidak bisa dibatalkan. Disarankan download backup dulu."
      );
      if (!firstConfirm) return;
      const typed = prompt(
        'Ketik "HAPUS" (huruf besar) untuk konfirmasi penghapusan permanen:'
      );
      if (typed !== "HAPUS") {
        if (window.LK) window.LK.toast("Dibatalkan", "info");
        return;
      }
      try {
        resetBtn.disabled = true;
        const count = await Storage.clearAll();
        items = [];
        populateMonths();
        render();
        if (window.LK) window.LK.toast(count + " transaksi dihapus", "success");
        if (window.LK) window.LK.broadcast("tx:removed", { reset: true });
      } catch (err) {
        if (window.LK) window.LK.toast("Gagal reset: " + ((err && err.message) || "unknown"), "error");
      } finally {
        resetBtn.disabled = false;
      }
    });
  }

  function bindEvents() {
    // Cross-tab auto-refresh — register SEBELUM initial load supaya tidak
    // kehilangan event saat race condition.
    if (window.LK) {
      window.LK.on("tx:added", () => refreshFromBroadcast());
      window.LK.on("tx:removed", () => refreshFromBroadcast());
    } else {
      console.warn("[history] window.LK tidak ada \u2014 broadcast listener tidak aktif");
    }
    monthSel.addEventListener("change", render);
    typeSel.addEventListener("change", render);
    searchInp.addEventListener("input", render);
    list.addEventListener("click", onDelete);
    bindExport();
    bindImport();
    bindReset();
  }

  function init() {
    bindEvents();

    // Initial load (dengan retry untuk masalah transient Supabase)
    setEmptyText("Memuat data...");
    reloadItems({}).then(() => {
      console.log("[history] after first load: items =", items.length, "loadError =", loadError);
      if (loadError) {
        console.log("[history] retry after 1s...");
        return new Promise((r) => setTimeout(r, 1000)).then(() => reloadItems({ silent: true }));
      }
      return null;
    }).then(() => {
      console.log("[history] after retry: items =", items.length, "loadError =", loadError);
      // DEBUG: kalau setelah load items kosong, tampilkan info debug di empty area
      if (items.length === 0 && !loadError) {
        setEmptyText("Belum ada transaksi. (Sesi: " +
          ((session.email || (session.id && session.id.slice(0, 8)) || "?")) + ", load OK, items=0)");
      }
    }).catch((err) => console.error("[history] init failed:", err));
  }

  init();
})();
