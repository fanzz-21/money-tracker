// js/dashboard.js — Dashboard dengan auto-refresh via cross-tab broadcast
(async function () {
  const Auth = await waitForAuth();
  const Storage = await waitForStorage();
  const session = await Auth.requireAuth();
  if (!session) return;

  const today = Storage.todayISO();
  let items = await Storage.loadAll();
  const month = today.slice(0, 7);

  const todayItems = Storage.byDate(items, today);

  const sumIn = document.getElementById("sum-in");
  const sumOut = document.getElementById("sum-out");
  const sumNet = document.getElementById("sum-net");
  const todayList = document.getElementById("today-list");
  const todayEmpty = document.getElementById("today-empty");
  const periodSel = document.getElementById("chart-period");
  const flowCanvas = document.getElementById("flow-chart");
  const chartLegend = document.getElementById("chart-legend");
  const catCanvas = document.getElementById("cat-chart");
  const catLegend = document.getElementById("cat-legend");
  const budgetList = document.getElementById("budget-list");
  const budgetEmpty = document.getElementById("budget-empty");
  const logoutBtn = document.getElementById("btn-logout");

  function fmtRp(n) {
    const sign = n < 0 ? "-" : "";
    return sign + "Rp " + Math.abs(Math.round(n)).toLocaleString("id-ID");
  }

  function refreshCharts() {
    const m = periodSel.value === "12" ? 12 : 6;
    const flow = Storage.flowSeries(items, m);
    if (window.Chart) {
      Chart.drawFlowChart(flowCanvas, flow);
      const cat = Storage.spendByCategory(items, month);
      Chart.drawCatChart(catCanvas, cat);
      Chart.renderCatLegend(catLegend, cat);
    }
  }

  function renderSummary() {
    const mt = Storage.monthTotals(items, month);
    sumIn.textContent = fmtRp(mt.masuk);
    sumOut.textContent = fmtRp(mt.keluar);
    sumNet.textContent = fmtRp(mt.net);
  }

  function renderBudget() {
    if (!window.Budget) { budgetList.innerHTML = ""; budgetEmpty.hidden = false; return; }
    const all = Budget.getAll();
    const ym = month;
    const spentByCat = {};
    for (const t of items) {
      if (t.type !== "out") continue;
      if (!t.date || t.date.slice(0, 7) !== ym) continue;
      spentByCat[t.category] = (spentByCat[t.category] || 0) + (Number(t.amount) || 0);
    }
    const keys = Object.keys(all).sort();
    if (!keys.length) { budgetList.innerHTML = ""; budgetEmpty.hidden = false; return; }
    budgetEmpty.hidden = true;
    budgetList.innerHTML = "";
    for (const cat of keys) {
      const spent = spentByCat[cat] || 0;
      const chk = Budget.check(cat, spent);
      const pct = Math.min(100, Math.round(chk.pct * 100));
      const over = chk.status === "over";
      const warn = chk.status === "warn";
      const row = document.createElement("div");
      row.innerHTML =
        '<div class="flex items-center justify-between text-sm mb-1">' +
          '<span class="font-medium">' + window.LK.escapeHTML(cat) + '</span>' +
          '<span class="tabular-nums ' + (over ? "lk-text-danger" : warn ? "" : "text-[var(--lk-text-muted)]") + '">' +
            fmtRp(spent) + ' / ' + fmtRp(chk.budget) + (over ? " ⚠" : "") +
          '</span>' +
        '</div>' +
        '<div class="h-2 rounded-full bg-[var(--lk-border)] overflow-hidden">' +
          '<div style="width:' + pct + '%;height:100%;background:' + (over ? "var(--lk-danger)" : warn ? "var(--lk-warning, #f59e0b)" : "var(--lk-success)") + '"></div>' +
        '</div>';
      budgetList.appendChild(row);
    }
  }

  function renderToday() {
    const t = Storage.byDate(items, today);
    if (!t.length) {
      todayEmpty.hidden = false;
      todayList.querySelectorAll("article").forEach((e) => e.remove());
      return;
    }
    todayEmpty.hidden = true;
    todayList.innerHTML = "";
    t.forEach((row) => {
      const art = document.createElement("article");
      art.className = "px-4 py-3 border-t border-[var(--lk-border)] first:border-t-0 flex items-center justify-between gap-3 min-w-0";
      const sign = row.type === "in" ? "+" : "−";
      const colorClass = row.type === "in" ? "lk-money-in" : "lk-money-out";
      const ts = new Date(row.ts);
      art.innerHTML = `
        <div class="flex-1 min-w-0">
          <p class="font-medium truncate">${window.LK.escapeHTML(row.category)}</p>
          <p class="text-xs text-[var(--lk-text-muted)] truncate">${window.LK.escapeHTML(row.note) || "—"}</p>
        </div>
        <div class="text-right shrink-0">
          <p class="font-semibold tabular-nums ${colorClass}">${sign} ${fmtRp(row.amount)}</p>
          <p class="text-xs text-[var(--lk-text-faint)] tabular-nums">${ts.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</p>
        </div>
      `;
      todayList.appendChild(art);
    });
  }

  function rerenderAll() {
    renderSummary();
    renderBudget();
    renderToday();
    refreshCharts();
  }

  // Cross-tab: kalau input.html tambah data di tab lain, refresh otomatis
  if (window.LK) {
    LK.on("tx:added", async (row) => {
      items = await Storage.loadAll({ force: true });
      rerenderAll();
    });
    LK.on("tx:removed", async () => {
      items = await Storage.loadAll({ force: true });
      rerenderAll();
    });
  }

  function onResize() {
    if (window._chartResizeTimer) clearTimeout(window._chartResizeTimer);
    window._chartResizeTimer = setTimeout(refreshCharts, 100);
  }

  periodSel.addEventListener("change", refreshCharts);
  window.addEventListener("resize", onResize);
  logoutBtn.addEventListener("click", () => {
    if (typeof Auth.logout === "function") Auth.logout();
    else if (typeof Auth.signOut === "function") Auth.signOut();
    else console.error("[LK] Auth.logout tidak ada");
  });

  rerenderAll();
})();
