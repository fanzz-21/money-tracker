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
// Aman dipanggil sebelum DOM ready — tidak sentuh DOM.

const KEY = "lk_budgets_v1";

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return {};
    const out = {};
    for (const k of Object.keys(obj)) {
      const n = Math.round(Number(obj[k]));
      if (Number.isFinite(n) && n > 0 && n <= 1e9) out[k] = n;
    }
    return out;
  } catch (e) { return {}; }
}

function save(obj) {
  try { localStorage.setItem(KEY, JSON.stringify(obj)); }
  catch (e) { /* quota / private mode — ignore */ }
}

function getAll() {
  return Object.assign({}, load());
}

function get(cat) {
  const all = load();
  return all[cat] || 0;
}

function set(cat, amount) {
  if (!cat || typeof cat !== "string") throw new Error("Kategori tidak valid.");
  const n = Math.round(Number(amount));
  if (!Number.isFinite(n) || n < 1) throw new Error("Budget minimal 1.");
  if (n > 1e9) throw new Error("Budget terlalu besar (maks 1 miliar).");
  const all = load();
  all[cat] = n;
  save(all);
  return n;
}

function remove(cat) {
  const all = load();
  if (cat in all) { delete all[cat]; save(all); }
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
