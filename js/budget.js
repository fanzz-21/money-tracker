// js/budget.js — Budget per kategori/bulan (localStorage)
// Budget disimpan lokal per-device (tidak di-sync ke Supabase — privasi &
// tidak ada kebutuhan multi-device). Tipe: { kategori -> integer } (rupiah).
//
// API:
//   Budget.getAll()             -> { [kategori]: number }   (clone)
//   Budget.set(cat, amount)     -> simpan (amount > 0)
//   Budget.remove(cat)          -> hapus
//   Budget.get(cat)             -> number | 0
//   Budget.check(cat, spent)    -> { pct, status: "ok"|"warn"|"over" }
//                                   pct  = spent / budget  (0 kalau budget 0)
//                                   warn >= 80%, over >= 100%
//
// Implementasi internal: Map (bukan object) — key dari localStorage
// TIDAK pernah dipakai sebagai akses properti dinamis (object injection),
// dan tidak ada operator `delete` pada key dinamis (dynamic delete).
// Key selalu divalidasi via isSafeCat() sebelum masuk Map.
//
// Aman dipanggil sebelum DOM ready — tidak sentuh DOM.

const KEY = "lk_budgets_v1";
const MAX_BUDGET = 1000000000; // 1 miliar

// Validasi kategori: string 1-50 char, tolak key spesial prototype
// (__proto__, constructor, prototype, semua yang diawali "__").
function isSafeCat(k) {
  return (
    typeof k === "string" &&
    k.length > 0 &&
    k.length <= 50 &&
    k !== "__proto__" &&
    k !== "constructor" &&
    k !== "prototype" &&
    !k.startsWith("__")
  );
}

// Baca store dari localStorage -> Map (hanya entry valid).
function readStore() {
  const m = new Map();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return m;
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return m;
    for (const [k, v] of Object.entries(obj)) {
      if (!isSafeCat(k)) continue;
      const n = Math.round(Number(v));
      if (Number.isFinite(n) && n > 0 && n <= MAX_BUDGET) m.set(k, n);
    }
  } catch (e) { /* storage corrupt / private mode -> kosong */ }
  return m;
}

// Tulis Map -> localStorage (object plain, format kompatibel versi lama).
function writeStore(m) {
  const out = {};
  m.forEach((v, k) => Object.assign(out, { [k]: v }));
  try { localStorage.setItem(KEY, JSON.stringify(out)); }
  catch (e) { /* quota / private mode — ignore */ }
}

function getAll() {
  const m = readStore();
  const out = {};
  m.forEach((v, k) => Object.assign(out, { [k]: v }));
  return out;
}

function get(cat) {
  if (!isSafeCat(cat)) return 0;
  return readStore().get(cat) || 0;
}

function set(cat, amount) {
  if (!isSafeCat(cat)) throw new Error("Kategori tidak valid.");
  const n = Math.round(Number(amount));
  if (!Number.isFinite(n) || n < 1) throw new Error("Budget minimal 1.");
  if (n > MAX_BUDGET) throw new Error("Budget terlalu besar (maks 1 miliar).");
  const m = readStore();
  m.set(cat, n);
  writeStore(m);
  return n;
}

function remove(cat) {
  if (!isSafeCat(cat)) return;
  const m = readStore();
  if (m.has(cat)) {
    m.delete(cat);
    writeStore(m);
  }
}

function check(cat, spent) {
  const budget = get(cat);
  const s = Math.max(0, Math.round(Number(spent) || 0));
  if (!budget) return { pct: 0, status: "ok", budget: 0, spent: s };
  const pct = s / budget;
  let status = "ok";
  if (pct >= 1) status = "over";
  else if (pct >= 0.8) status = "warn";
  return { pct, status, budget, spent: s };
}

const Budget = { getAll, get, set, remove, check };
window.Budget = Budget;
export default Budget;
