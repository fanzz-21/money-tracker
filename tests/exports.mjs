// tests/exports.mjs — Unit test Phase B (Ekspor CSV BOM + xlsx).
// Tanggal di-inject via mock, data tetap — deterministik.
//
// Cakupan:
//   - Storage.toCsvBom: BOM \uFEFF di depan, header benar, escape quote,
//     newline \n, baris kosong (items kosong = header saja).
//   - js/exports.js: module init aman (window stub), Exports.baseName()
//     memakai brand "fintrack-" + todayISO, Exports.csv/xlsx adalah function.
//
// Run: node tests/exports.mjs   (exit 0 = semua hijau)

import { loadEsmModule } from "./helpers/esm-loader.mjs";

const failures = [];
function assert(cond, msg) {
  console.log((cond ? "  PASS  " : "  FAIL  ") + msg);
  if (!cond) failures.push(msg);
}

// ---- 1) toCsvBom di js/storage.js ----
const { mod } = await loadEsmModule("js/storage.js", {
  supabaseMock: {
    from() { return { select() { return { order() { return Promise.resolve({ data: [], error: null }); } }; } }; },
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  },
});
const Storage = mod.default;

console.log("===== EXPORTS: toCsvBom =====");
const items = [
  { date: "2026-08-01", type: "out", amount: 50000, category: "Makan", note: 'makan "nasi" di kantin', ts: 1 },
  { date: "2026-08-02", type: "in", amount: 1000000, category: "Gaji", note: "", ts: 2 },
];

assert(typeof Storage.toCsvBom === "function", "toCsvBom ada di Storage");

const csv = Storage.toCsvBom(items);
assert(csv.charCodeAt(0) === 0xfeff, "toCsvBom: char pertama = BOM \\uFEFF (Excel-safe)");

const body = csv.slice(1); // buang BOM untuk cek struktur
const lines = body.split("\n");
assert(lines[0] === "tanggal,jenis,jumlah,kategori,keterangan,waktu", "toCsvBom: header baris pertama benar");
assert(lines.length === 3, "toCsvBom: header + 2 baris data (2 items)");
assert(lines[1].startsWith("2026-08-01,keluar,50000,Makan,"), "toCsvBom: baris 1 — jenis 'keluar' untuk type out");
assert(lines[1].includes('"makan ""nasi"" di kantin"'), 'toCsvBom: quote di-escape jadi ""');
assert(lines[2].startsWith("2026-08-02,masuk,1000000,Gaji,"), "toCsvBom: baris 2 — jenis 'masuk' untuk type in");

// items kosong -> BOM + header saja (tidak crash, tidak ada baris tambahan)
const csvEmpty = Storage.toCsvBom([]);
assert(csvEmpty.charCodeAt(0) === 0xfeff, "toCsvBom(items kosong): BOM tetap ada");
assert(csvEmpty.slice(1) === "tanggal,jenis,jumlah,kategori,keterangan,waktu", "toCsvBom(items kosong): hanya header");

// tanpa BOM vs dengan BOM — panjang selisih tepat 1 char
assert(csv.length === Storage.toCsv(items).length + 1, "toCsvBom = toCsv + tepat 1 char (BOM)");

// ---- 2) js/exports.js — module init + API surface ----
console.log("===== EXPORTS: modul js/exports.js =====");
const { mod: exMod } = await loadEsmModule("js/exports.js", {
  supabaseMock: {
    from() { return { select() { return { order() { return Promise.resolve({ data: [], error: null }); } }; } }; },
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  },
});
const Exports = exMod.default;

assert(typeof Exports === "object" && Exports !== null, "exports.js: Exports object ter-export");
assert(typeof Exports.csv === "function", "exports.js: Exports.csv adalah function");
assert(typeof Exports.xlsx === "function", "exports.js: Exports.xlsx adalah function");
assert(typeof Exports.downloadBlob === "function", "exports.js: Exports.downloadBlob adalah function");
assert(typeof Exports.baseName === "function", "exports.js: Exports.baseName adalah function");

const name = Exports.baseName();
assert(/^fintrack-riwayat-\d{4}-\d{2}-\d{2}$/.test(name), 'exports.js: baseName() = "fintrack-riwayat-YYYY-MM-DD" (brand Fintrack, bukan kas-harian)');

console.log(`\n${failures.length === 0 ? "SEMUA HIJAU: export BOM + module exports." : failures.length + " assertion GAGAL."}`);
process.exit(failures.length ? 1 : 0);
