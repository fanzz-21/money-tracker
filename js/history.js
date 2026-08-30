// js/history.js — Riwayat dengan auto-refresh via cross-tab broadcast
(async function () {
  const Auth = await waitForAuth();
  const Storage = await waitForStorage();

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
  const exportJsonBtn = document.getElementById("btn-export-json");
  const importFile = document.getElementById("import-file");
  const resetBtn = document.getElementById("btn-reset");
  const list = document.getElementById("history-list");
  const empty = document.getElementById("history-empty");
  const summaryBar = document.getElementById("summary-bar");
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

  // Cross-tab auto-refresh — register SEBELUM initial load supaya tidak
  // kehilangan event saat race condition.
  if (window.LK) {
    LK.on("tx:added", async () => {
      console.log("[history] tx:added broadcast, refreshing");
      await reloadItems({ silent: true });
    });
    LK.on("tx:removed", async () => {
      console.log("[history] tx:removed broadcast, refreshing");
      await reloadItems({ silent: true });
    });
  } else {
    console.warn("[history] window.LK tidak ada — broadcast listener tidak aktif");
  }

  async function reloadItems({ silent = false } = {}) {
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
        if (window.LK) LK.toast("Gagal memuat: " + loadError, "error");
        setEmptyText("Gagal memuat data. Coba refresh halaman. (" + loadError + ")");
      }
    }
  }

  // Initial load (dengan retry untuk masalah transient Supabase)
  setEmptyText("Memuat data...");
  await reloadItems();
  console.log("[history] after first load: items =", items.length, "loadError =", loadError);
  if (loadError) {
    console.log("[history] retry after 1s...");
    await new Promise((r) => setTimeout(r, 1000));
    await reloadItems({ silent: true });
    console.log("[history] after retry: items =", items.length, "loadError =", loadError);
  }

  // DEBUG: kalau setelah load items kosong, tampilkan info debug di empty area
  if (items.length === 0 && !loadError) {
    setEmptyText("Belum ada transaksi. (Sesi: " + (session.email || session.id?.slice(0,8) || "?") + ", load OK, items=0)");
  }

  function fmtRp(n) {
    return "Rp " + Number(n || 0).toLocaleString("id-ID");
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
      const [y, mo] = m.split("-");
      opt.textContent = new Date(y, mo - 1).toLocaleDateString("id-ID", { year: "numeric", month: "long" });
      monthSel.appendChild(opt);
    });
  }

  function matchesFilter(t) {
    if (monthSel.value && t.date.slice(0, 7) !== monthSel.value) return false;
    if (typeSel.value && t.type !== typeSel.value) return false;
    if (searchInp.value.trim() && !String(t.note || "").toLowerCase().includes(searchInp.value.trim().toLowerCase())) return false;
    return true;
  }

  function render() {
    const filtered = items.filter(matchesFilter).sort((a, b) => (a.ts < b.ts ? 1 : -1));

    let inSum = 0, outSum = 0;
    filtered.forEach((t) => {
      const n = Number(t.amount) || 0;
      if (t.type === "in") inSum += n; else outSum += n;
    });

    sumCount.textContent = `${filtered.length} transaksi`;
    sumIn.textContent = `Masuk: ${fmtRp(inSum)}`;
    sumOut.textContent = `Keluar: ${fmtRp(outSum)}`;
    sumNet.textContent = `Saldo: ${fmtRp(inSum - outSum)}`;

    if (!filtered.length) {
      empty.hidden = false;
      list.querySelectorAll("article").forEach((e) => e.remove());
      return;
    }
    empty.hidden = true;
    list.innerHTML = "";
    filtered.forEach((row) => {
      const art = document.createElement("article");
      art.className = "px-4 py-3 border-t border-[var(--lk-border)] first:border-t-0 flex items-center justify-between gap-3 min-w-0";
      const sign = row.type === "in" ? "+" : "−";
      const colorClass = row.type === "in" ? "lk-money-in" : "lk-money-out";
      const ts = new Date(row.ts);
      const d = new Date(row.date + "T00:00:00");
      art.innerHTML = `
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-medium truncate">${window.LK.escapeHTML(row.category)}</span>
            <span class="text-xs px-1.5 py-0.5 rounded ${row.type === "in" ? "lk-bg-success-soft lk-text-success" : "lk-bg-danger-soft lk-text-danger"}">${row.type === "in" ? "Masuk" : "Keluar"}</span>
          </div>
          <p class="text-xs text-[var(--lk-text-muted)] truncate">${window.LK.escapeHTML(row.note) || "—"}</p>
          <p class="text-xs text-[var(--lk-text-faint)]">${d.toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short", year: "numeric" })} · ${ts.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</p>
        </div>
        <div class="text-right shrink-0 flex flex-col items-end gap-1">
          <p class="font-semibold tabular-nums ${colorClass}">${sign} ${fmtRp(row.amount)}</p>
          <button type="button" data-id="${window.LK.escapeHTML(row.id)}" data-action="delete" class="lk-btn-danger-ghost text-xs flex items-center gap-1" aria-label="Hapus transaksi ${window.LK.escapeHTML(row.category)}">
            <span class="material-symbols-outlined text-base">delete</span>
            <span>Hapus</span>
          </button>
        </div>
      `;
      list.appendChild(art);
    });
  }

  async function onDelete(e) {
    const btn = e.target.closest('[data-action="delete"]');
    if (!btn) return;
    const id = btn.dataset.id;
    const row = items.find((t) => t.id === id);
    if (!row) return;
    // Cari artikel parent untuk highlight yang akan dihapus
    const article = btn.closest("article");
    const label = `${row.category} • ${row.type === "in" ? "+" : "−"}Rp ${Number(row.amount).toLocaleString("id-ID")}`;
    if (!confirm(`Hapus transaksi ini?\n\n${label}\n${row.note ? "\nCatatan: " + row.note : ""}`)) {
      return;
    }
    if (article) {
      article.style.opacity = "0.4";
      article.style.pointerEvents = "none";
    }
    try {
      await Storage.removeTx(id);
      const idx = items.findIndex((t) => t.id === id);
      if (idx !== -1) items.splice(idx, 1);
      populateMonths();
      render();
      if (window.LK) LK.toast("Transaksi dihapus", "success");
      if (window.LK) LK.broadcast("tx:removed", { id });
    } catch (err) {
      if (article) {
        article.style.opacity = "";
        article.style.pointerEvents = "";
      }
      if (window.LK) LK.toast("Gagal hapus: " + (err.message || "unknown"), "error");
    }
  }

  // Cross-tab auto-refresh
  if (window.LK) {
    LK.on("tx:added", async () => {
      items = await Storage.loadAll({ force: true });
      populateMonths();
      render();
    });
    LK.on("tx:removed", async () => {
      items = await Storage.loadAll({ force: true });
      populateMonths();
      render();
    });
  }

  monthSel.addEventListener("change", render);
  typeSel.addEventListener("change", render);
  searchInp.addEventListener("input", render);
  list.addEventListener("click", onDelete);

  // --- Export CSV (filtered) ---
  exportCsvBtn.addEventListener("click", () => {
    const filtered = items.filter(matchesFilter);
    const csv = Storage.toCsv(filtered);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `riwayat-${Storage.todayISO()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    if (window.LK) LK.toast("CSV diunduh", "success");
  });

  // --- Export JSON (full backup) ---
  exportJsonBtn.addEventListener("click", () => {
    try {
      const json = Storage.exportToJSON(items);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const date = new Date().toISOString().slice(0, 10);
      a.download = `kas-harian-backup-${date}.json`;
      a.click();
      URL.revokeObjectURL(url);
      if (window.LK) LK.toast(`Backup ${items.length} transaksi diunduh`, "success");
    } catch (err) {
      if (window.LK) LK.toast("Gagal export: " + (err.message || "unknown"), "error");
    }
  });

  // --- Import JSON (restore) ---
  importFile.addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!confirm(
      `Restore dari file "${file.name}"?\n\n` +
      `Tindakan ini akan MENAMBAHKAN transaksi dari file backup ke data Anda saat ini. ` +
      `Transaksi yang sudah ada TIDAK dihapus atau ditimpa.`
    )) {
      importFile.value = "";
      return;
    }
    try {
      const text = await file.text();
      const result = await Storage.importFromJSON(text);
      if (window.LK) LK.toast(
        `Restore: ${result.inserted} transaksi ditambahkan` +
        (result.skipped > 0 ? `, ${result.skipped} dilewati` : ""),
        "success"
      );
      // Reload items
      items = await Storage.loadAll({ force: true });
      populateMonths();
      render();
      if (window.LK) LK.broadcast("tx:added", { restored: result.inserted });
    } catch (err) {
      if (window.LK) LK.toast("Restore gagal: " + (err.message || "unknown"), "error");
    } finally {
      importFile.value = ""; // reset supaya bisa pilih file yang sama
    }
  });

  // --- Reset (hapus semua) ---
  resetBtn.addEventListener("click", async () => {
    if (!items.length) {
      if (window.LK) LK.toast("Tidak ada data untuk dihapus", "info");
      return;
    }
    const firstConfirm = confirm(
      `PERINGATAN: Hapus SEMUA ${items.length} transaksi?\n\n` +
      `Tindakan ini tidak bisa dibatalkan. Disarankan download backup dulu.`
    );
    if (!firstConfirm) return;
    const typed = prompt(
      `Ketik "HAPUS" (huruf besar) untuk konfirmasi penghapusan permanen:`
    );
    if (typed !== "HAPUS") {
      if (window.LK) LK.toast("Dibatalkan", "info");
      return;
    }
    try {
      resetBtn.disabled = true;
      const count = await Storage.clearAll();
      items = [];
      populateMonths();
      render();
      if (window.LK) LK.toast(`${count} transaksi dihapus`, "success");
      if (window.LK) LK.broadcast("tx:removed", { reset: true });
    } catch (err) {
      if (window.LK) LK.toast("Gagal reset: " + (err.message || "unknown"), "error");
    } finally {
      resetBtn.disabled = false;
    }
  });

  populateMonths();
  render();
})();
