// js/insight.js — Kartu insight bulanan (classic script, bukan module).
// Dipanggil langsung dari js/dashboard.js rerenderAll() setelah data ready:
//   window.Insight.render(items, month)
//
// Keamanan: semua output via textContent (XSS-immune, konsisten dengan app).
// Fungsi math tinggal di js/storage.js (monthComparison, spendByCategoryTop,
// projectMonthEnd) — modul ini hanya presentasi.

(function () {
  "use strict";

  function fmtRp(n) {
    return "Rp " + Math.round(n).toLocaleString("id-ID");
  }

  // "Keluar vs bulan lalu": panah naik = merah (buruk), turun = hijau (baik).
  // prev = 0 -> delta null -> tampil "—".
  function fmtDelta(delta) {
    const arrow = delta > 0 ? "↑" : delta < 0 ? "↓" : "→";
    return arrow + " " + Math.abs(delta) + "% vs bln lalu";
  }

  function render(items, month) {
    const grid = document.getElementById("insight-grid");
    if (!grid) return;
    const Storage = window.Storage;
    if (!Storage) return;

    const cmp = Storage.monthComparison(items, month);
    const top = Storage.spendByCategoryTop(items, month);
    const proj = Storage.projectMonthEnd(items, month, {
      ym: month,
      day: new Date().getDate()
    });

    const insDelta = document.getElementById("ins-delta");
    const insTop = document.getElementById("ins-top");
    const insProj = document.getElementById("ins-proj");

    if (insDelta) {
      const d = cmp.deltaKeluar;
      insDelta.textContent =
        d === null || d === undefined
          ? "— (belum ada data bln lalu)"
          : fmtDelta(d);
      insDelta.classList.remove("lk-money-out", "lk-money-in");
      if (d > 0) insDelta.classList.add("lk-money-out");
      else if (d < 0) insDelta.classList.add("lk-money-in");
    }

    if (insTop) {
      insTop.textContent = top ? top.name + " · " + fmtRp(top.amount) : "—";
    }

    if (insProj) {
      insProj.textContent =
        proj.basisDays > 0
          ? fmtRp(proj.projected) + " (" + fmtRp(proj.soFar) + " sejauh ini)"
          : "—";
    }

    grid.hidden = false;
  }

  window.Insight = { render };
})();
