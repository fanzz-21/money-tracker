// js/dashboard.js — Dashboard dengan auto-refresh via cross-tab broadcast
//
// Keamanan: semua data user (category, note) di-render via textContent /
// createElement — TIDAK ada innerHTML berisi data dinamis (XSS-immune).
// Kompleksitas: IIFE utama dipecah ke sub-fungsi bernama (loadBoot,
// renderSummary, renderBudget, renderToday, refreshCharts, bindEvents,
// populateUserChip) supaya nloc per fungsi di bawah batas Lizard.

function dashFmtRp(n) {
  const sign = n < 0 ? "-" : "";
  return sign + "Rp " + Math.abs(Math.round(n)).toLocaleString("id-ID");
}

function dashSpentByCat(items, ym) {
  const m = new Map();
  for (const t of items) {
    if (t.type !== "out") continue;
    if (!t.date || t.date.slice(0, 7) !== ym) continue;
    m.set(t.category, (m.get(t.category) || 0) + (Number(t.amount) || 0));
  }
  return m;
}

function makeBudgetRow(cat, spent, chk) {
  const pct = Math.min(100, Math.round(chk.pct * 100));
  const over = chk.status === "over";
  const warn = chk.status === "warn";

  const row = document.createElement("div");
  const head = document.createElement("div");
  head.className = "flex items-center justify-between text-sm mb-1";

  const catEl = document.createElement("span");
  catEl.className = "font-medium";
  catEl.textContent = cat;

  const valEl = document.createElement("span");
  valEl.className = "tabular-nums " + (over ? "lk-text-danger" : warn ? "" : "text-[var(--lk-text-muted)]");
  valEl.textContent = dashFmtRp(spent) + " / " + dashFmtRp(chk.budget) + (over ? " ⚠" : "");

  head.append(catEl, valEl);

  const barWrap = document.createElement("div");
  barWrap.className = "h-2 rounded-full bg-[var(--lk-border)] overflow-hidden";
  const bar = document.createElement("div");
  bar.style.width = pct + "%";
  bar.style.height = "100%";
  bar.style.background = over
    ? "var(--lk-danger)"
    : warn
      ? "var(--lk-warning, #f59e0b)"
      : "var(--lk-success)";
  barWrap.appendChild(bar);

  row.append(head, barWrap);
  return row;
}

function makeTxRow(row) {
  const art = document.createElement("article");
  art.className = "px-4 py-3 border-t border-[var(--lk-border)] first:border-t-0 flex items-center justify-between gap-3 min-w-0 lk-fade-in";

  const left = document.createElement("div");
  left.className = "flex-1 min-w-0";
  const catP = document.createElement("p");
  catP.className = "font-medium truncate";
  catP.textContent = row.category;
  const noteP = document.createElement("p");
  noteP.className = "text-xs text-[var(--lk-text-muted)] truncate";
  noteP.textContent = row.note || "—";
  left.append(catP, noteP);

  const right = document.createElement("div");
  right.className = "text-right shrink-0";
  const amtP = document.createElement("p");
  const sign = row.type === "in" ? "+" : "−";
  amtP.className = "font-semibold tabular-nums " + (row.type === "in" ? "lk-money-in" : "lk-money-out");
  amtP.textContent = sign + " " + dashFmtRp(row.amount);
  const tsP = document.createElement("p");
  const ts = new Date(row.ts);
  tsP.className = "text-xs text-[var(--lk-text-faint)] tabular-nums";
  tsP.textContent = ts.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  right.append(amtP, tsP);

  art.append(left, right);
  return art;
}

function dashEmptyMarkup(el) {
  el.innerHTML = `
    <div class="lk-empty">
      <div class="lk-empty-icon">
        <span class="material-symbols-outlined">inbox</span>
      </div>
      <p class="lk-empty-title">Belum ada transaksi hari ini</p>
      <p class="lk-empty-sub">Catat pemasukan atau pengeluaran pertamamu untuk mulai tracking.</p>
      <a href="input.html" class="lk-empty-cta">
        <span class="material-symbols-outlined text-lg">add</span>
        <span>Catat transaksi</span>
      </a>
    </div>
  `;
}

(async function () {
  const Auth = await window.waitForAuth();
  const Storage = await window.waitForStorage();
  const session = await Auth.requireAuth();
  if (!session) return;

  const today = Storage.todayISO();
  let items = await Storage.loadAll();
  const month = today.slice(0, 7);

  const sumIn = document.getElementById("sum-in");
  const sumOut = document.getElementById("sum-out");
  const sumNet = document.getElementById("sum-net");
  const todayList = document.getElementById("today-list");
  const todayEmpty = document.getElementById("today-empty");
  const periodSel = document.getElementById("chart-period");
  const flowCanvas = document.getElementById("flow-chart");
  const catCanvas = document.getElementById("cat-chart");
  const catLegend = document.getElementById("cat-legend");
  const budgetList = document.getElementById("budget-list");
  const budgetEmpty = document.getElementById("budget-empty");
  const logoutBtn = document.getElementById("btn-logout");
  // (logout button dihapus di header — sekarang pakai sidebar/profile)

  function renderSummary() {
    const mt = Storage.monthTotals(items, month);
    sumIn.textContent = dashFmtRp(mt.masuk);
    sumOut.textContent = dashFmtRp(mt.keluar);
    sumNet.textContent = dashFmtRp(mt.net);

    // Saldo keseluruhan (all-time)
    const at = Storage.allTimeBalance(items);
    const atIn = document.getElementById("alltime-in");
    const atOut = document.getElementById("alltime-out");
    const atNet = document.getElementById("alltime-net");
    if (atIn) atIn.textContent = dashFmtRp(at.masuk);
    if (atOut) atOut.textContent = dashFmtRp(at.keluar);
    if (atNet) atNet.textContent = dashFmtRp(at.net);
  }

  function renderBudget() {
    if (!window.Budget) { budgetList.innerHTML = ""; budgetEmpty.hidden = false; return; }
    const all = window.Budget.getAll();
    const spentByCat = dashSpentByCat(items, month);
    const keys = Object.keys(all).sort();
    if (!keys.length) { budgetList.innerHTML = ""; budgetEmpty.hidden = false; return; }
    budgetEmpty.hidden = true;
    budgetList.innerHTML = "";
    for (const cat of keys) {
      const spent = spentByCat.get(cat) || 0;
      budgetList.appendChild(makeBudgetRow(cat, spent, window.Budget.check(cat, spent)));
    }
  }

  function renderToday() {
    const t = Storage.byDate(items, today);
    if (!t.length) {
      todayEmpty.hidden = true;
      dashEmptyMarkup(todayList);
      return;
    }
    todayEmpty.hidden = true;
    todayList.innerHTML = "";
    for (const row of t) todayList.appendChild(makeTxRow(row));
  }

  function revealChart(canvas, skeletonId) {
    // Buka canvas + hapus skeleton shimmer SEBELUM menggambar:
    // canvas yang masih hidden (display:none) punya getBoundingClientRect()
    // 0x0 sehingga chart tergambar ke ukuran nol — dan shimmer-nya sendiri
    // tidak pernah hilang (bug: skeleton chart stuck).
    if (!canvas) return;
    canvas.hidden = false;
    canvas.classList.add("lk-content-fade");
    const sk = document.getElementById(skeletonId);
    if (sk) sk.remove();
  }

  function refreshCharts() {
    const m = periodSel.value === "12" ? 12 : 6;
    // Reveal dulu (canvas buka + shimmer hapus) — juga jalan kalau window.Chart
    // belum siap, supaya shimmer tidak pernah stuck selamanya.
    revealChart(flowCanvas, "flow-skeleton");
    revealChart(catCanvas, "cat-skeleton");
    if (!window.Chart) return;
    window.Chart.drawFlowChart(flowCanvas, Storage.flowSeries(items, m));
    const cat = Storage.spendByCategory(items, month);
    window.Chart.drawCatChart(catCanvas, cat);
    window.Chart.renderCatLegend(catLegend, cat);
  }

  function rerenderAll() {
    renderSummary();
    renderBudget();
    renderToday();
    refreshCharts();
    if (window.Insight) window.Insight.render(items, month);
  }

  function onResize() {
    if (window._chartResizeTimer) clearTimeout(window._chartResizeTimer);
    window._chartResizeTimer = setTimeout(refreshCharts, 100);
  }

  function populateUserChip() {
    const userAvatar = document.getElementById("user-avatar");
    const userName = document.getElementById("user-name");
    if (!userAvatar && !userName) return;
    const u = session && (session.user || session);
    const email = (u && u.email) || "";
    const username = (u && u.user_metadata && u.user_metadata.username) || email.split("@")[0] || "User";
    if (userAvatar) userAvatar.textContent = (username[0] || "?").toUpperCase();
    if (userName) userName.textContent = username;
  }

  function bindEvents() {
    periodSel.addEventListener("change", refreshCharts);
    window.addEventListener("resize", onResize);

    // Cross-tab: kalau input.html tambah data di tab lain, refresh otomatis
    if (window.LK) {
      window.LK.on("tx:added", async () => {
        items = await Storage.loadAll({ force: true });
        rerenderAll();
      });
      window.LK.on("tx:removed", async () => {
        items = await Storage.loadAll({ force: true });
        rerenderAll();
      });
    }

    // Logout button mungkin masih ada (backward compat) — bind jika ada
    if (logoutBtn) {
      logoutBtn.addEventListener("click", () => {
        if (typeof Auth.logout === "function") Auth.logout();
        else if (typeof Auth.signOut === "function") Auth.signOut();
        else console.error("[LK] Auth.logout tidak ada");
      });
    }
  }

  function fadeSummaryCards() {
    // Saat data loaded, kasih fade-in ke ringkasan cards supaya perpindahan
    // dari skeleton -> real content tidak "jambred".
    for (const id of ["sum-in", "sum-out", "sum-net"]) {
      const el = document.getElementById(id);
      if (el) el.classList.add("lk-content-fade");
    }
  }

  bindEvents();
  populateUserChip();
  fadeSummaryCards();
  rerenderAll();

  // Auto-generate transaksi berulang (Phase D): idempotent per-bulan
  // (guard last_generated_month di DB). Dipanggil tiap buka dasbor;
  // kalau ada transaksi baru, refresh data + rerender.
  if (window.Recurring) {
    window.Recurring.maybeGenerate({ items, today: new Date() })
      .then((created) => {
        if (!created || created.length === 0) return;
        if (window.LK) window.LK.toast(created.length + " transaksi berulang ditambahkan", "success");
        return Storage.loadAll({ force: true }).then((next) => {
          items = next;
          rerenderAll();
        });
      })
      .catch((e) => console.warn("[LK] maybeGenerate gagal:", e));
  }
})();
