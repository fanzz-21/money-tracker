// tests/insight.mjs — Unit test Phase A (Insight Bulanan): fungsi agregat
// deterministik di js/storage.js. Tanggal di-inject (bukan Date.now), data
// mock tetap — sesuai plan docs/FEATURE-PLAN-4-fitur.md Step A1.
//
// Load: js/storage.js via tests/helpers/esm-loader.mjs (supabase di-stub).
// Run: node tests/insight.mjs   (exit 0 = semua hijau)

import { loadEsmModule } from "./helpers/esm-loader.mjs";

const failures = [];
function assert(cond, msg) {
  console.log((cond ? "  PASS  " : "  FAIL  ") + msg);
  if (!cond) failures.push(msg);
}
function approx(a, b) { return Math.abs(a - b) < 1e-9; }

const { mod } = await loadEsmModule("js/storage.js", {
  supabaseMock: {
    // loadAll() tidak dipanggil di test ini; mock minimal supaya module init aman.
    from() {
      return {
        select() {
          return { order() { return Promise.resolve({ data: [], error: null }); } };
        },
      };
    },
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  },
});
const Storage = mod.default;

console.log("===== INSIGHT: prevMonthKey =====");
assert(Storage.prevMonthKey("2026-08") === "2026-07", "prevMonthKey('2026-08') = '2026-07'");
assert(Storage.prevMonthKey("2026-01") === "2025-12", "prevMonthKey('2026-01') = '2025-12' (rollover tahun)");
assert(Storage.prevMonthKey("2026-12") === "2026-11", "prevMonthKey('2026-12') = '2026-11'");

console.log("===== INSIGHT: monthComparison =====");
// cur keluar=1.500.000, prev keluar=1.000.000 -> deltaKeluar = +50
const itemsA = [
  { date: "2026-08-05", type: "out", amount: 500000, category: "Makan", note: "", ts: 1 },
  { date: "2026-08-10", type: "out", amount: 500000, category: "Makan", note: "", ts: 2 },
  { date: "2026-08-12", type: "out", amount: 500000, category: "Tagihan", note: "", ts: 3 },
  { date: "2026-08-01", type: "in", amount: 2000000, category: "Gaji", note: "", ts: 4 },
  { date: "2026-07-05", type: "out", amount: 1000000, category: "Makan", note: "", ts: 5 },
  { date: "2026-07-01", type: "in", amount: 2000000, category: "Gaji", note: "", ts: 6 },
];
const cmp = Storage.monthComparison(itemsA, "2026-08");
assert(cmp.cur.keluar === 1500000, "monthComparison: cur.keluar = 1.500.000");
assert(cmp.prev.keluar === 1000000, "monthComparison: prev.keluar = 1.000.000");
assert(cmp.deltaKeluar === 50, "monthComparison: deltaKeluar = +50 (1.5jt vs 1jt)");
assert(cmp.deltaMasuk === 0, "monthComparison: deltaMasuk = 0 (sama persis)");
// turun: 500k -> 100k = -80
const cmpDown = Storage.monthComparison(
  [
    { date: "2026-08-02", type: "out", amount: 100000, category: "Makan", note: "", ts: 1 },
    { date: "2026-07-02", type: "out", amount: 500000, category: "Makan", note: "", ts: 2 },
  ],
  "2026-08"
);
assert(cmpDown.deltaKeluar === -80, "monthComparison: deltaKeluar = -80 saat turun");
// prev = 0 -> delta = null (hindari div/0 & Infinity)
const cmpNoPrev = Storage.monthComparison(
  [{ date: "2026-08-02", type: "out", amount: 50000, category: "Makan", note: "", ts: 1 }],
  "2026-08"
);
assert(cmpNoPrev.deltaKeluar === null, "monthComparison: prev=0 -> deltaKeluar = null (bukan Infinity/NaN)");

console.log("===== INSIGHT: projectMonthEnd =====");
// kurun bln ini 15 hari, keluar=300.000 -> avg 20.000/hari; Agustus 31 hari -> 620.000
const itemsB = [
  { date: "2026-08-01", type: "out", amount: 100000, category: "Makan", note: "", ts: 1 },
  { date: "2026-08-08", type: "out", amount: 100000, category: "Makan", note: "", ts: 2 },
  { date: "2026-08-15", type: "out", amount: 100000, category: "Transport", note: "", ts: 3 },
];
const proj = Storage.projectMonthEnd(itemsB, "2026-08", { ym: "2026-08", day: 15 });
assert(proj.projected === 620000, "projectMonthEnd: 300k/15 hari x 31 hari = 620.000");
assert(proj.basisDays === 15, "projectMonthEnd: basisDays = 15");
assert(proj.daysInMonth === 31, "projectMonthEnd: daysInMonth Agustus = 31");
assert(proj.soFar === 300000, "projectMonthEnd: soFar = 300.000");
// bulan 30 hari (Juni) + tanggal di akhir bulan (day=30): proyeksi = total sejauh ini
const projJun = Storage.projectMonthEnd(
  [{ date: "2026-06-30", type: "out", amount: 90000, category: "Makan", note: "", ts: 1 }],
  "2026-06",
  { ym: "2026-06", day: 30 }
);
assert(projJun.projected === 90000, "projectMonthEnd: day=dim (akhir bln) -> proyeksi = soFar (bukan 90k*30/30*... tetap 90k)");
assert(projJun.daysInMonth === 30, "projectMonthEnd: daysInMonth Juni = 30");
// tanpa today (day=0) -> avg 0, tidak NaN
const projNoDay = Storage.projectMonthEnd(itemsB, "2026-08", { ym: "2026-08", day: 0 });
assert(projNoDay.projected === 0 && Number.isFinite(projNoDay.projected), "projectMonthEnd: day=0 -> 0 (bukan NaN)");

console.log("===== INSIGHT: spendByCategoryTop =====");
// makan 500k, transport 200k -> top = { name:'Makan', amount:500000 }
const itemsC = [
  { date: "2026-08-03", type: "out", amount: 300000, category: "Makan", note: "", ts: 1 },
  { date: "2026-08-09", type: "out", amount: 200000, category: "Makan", note: "", ts: 2 },
  { date: "2026-08-11", type: "out", amount: 200000, category: "Transport", note: "", ts: 3 },
  { date: "2026-08-01", type: "in", amount: 1000000, category: "Gaji", note: "", ts: 4 },
];
const top = Storage.spendByCategoryTop(itemsC, "2026-08");
assert(top && top.name === "Makan" && top.amount === 500000, "spendByCategoryTop: top = Makan 500.000");
const topEmpty = Storage.spendByCategoryTop(
  [{ date: "2026-08-01", type: "in", amount: 100, category: "Gaji", note: "", ts: 1 }],
  "2026-08"
);
assert(topEmpty === null, "spendByCategoryTop: tanpa pengeluaran -> null");

console.log(`\n${failures.length === 0 ? "SEMUA HIJAU: insight math deterministik." : failures.length + " assertion GAGAL."}`);
process.exit(failures.length ? 1 : 0);
