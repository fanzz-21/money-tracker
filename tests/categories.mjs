// tests/categories.mjs — Unit test Phase C (kategori custom per-user).
// Mock supabase stateful (satu mock per proses, state-nya di-mutasi per kasus
// via __SUPABASE_MOCK__) — Node ESM module cache membuat 1 instance modul per
// proses, jadi semua kasus berbagi Storage yang sama; state di-reset tiap setup.
// Deterministik, tanpa network.
//
// Cakupan:
//   - loadCategories: merge sistem+custom, dedupe, snapshot, invalidate.
//   - addCategory: happy, trim, duplikat (DB error), nama tidak aman
//     (__proto__/constructor/prototype/__x), panjang >50, tipe invalid,
//     belum login.
//   - removeCategory: BLOKIR kalau terpakai, happy path, kategori sistem
//     tidak bisa dihapus, tipe invalid.
//   - addTx longgar: kategori custom (non-default) lolos validasi client.
//
// Jalankan: node tests/categories.mjs

import assert from "node:assert";
import { loadEsmModule } from "./helpers/esm-loader.mjs";

const SYS_ROWS = [
  { id: "Gaji", type: "in" },
  { id: "Usaha", type: "in" },
  { id: "Transfer masuk", type: "in" },
  { id: "Lainnya", type: "in" },
  { id: "Makan", type: "out" },
  { id: "Transport", type: "out" },
  { id: "Tagihan", type: "out" },
  { id: "Belanja", type: "out" },
];
const USER = { id: "u-1", email: "t@t.id" };
const NOW = "2026-08-31T10:00:00.000Z";

// ---- mock supabase stateful ----
const state = {
  userRows: [], txRows: [], user: USER,
  insertImpl: null, deleteImpl: null,
  sysSelects: 0, usrSelects: 0, inserts: [], deletes: [],
};
function resetState() {
  state.userRows = []; state.txRows = []; state.user = USER;
  state.insertImpl = null; state.deleteImpl = null;
  state.sysSelects = 0; state.usrSelects = 0;
  state.inserts.length = 0; state.deletes.length = 0;
}
const thenable = (p) => ({ then: (res, rej) => Promise.resolve(p).then(res, rej) });

const mock = {
  auth: { getUser: async () => ({ data: { user: state.user }, error: null }) },
  from(table) {
    if (table === "categories") {
      return { select: async () => { state.sysSelects++; return { data: SYS_ROWS, error: null }; } };
    }
    if (table === "user_categories") {
      return {
        select: async () => { state.usrSelects++; return { data: state.userRows.slice(), error: null }; },
        insert: (payload) => thenable(Promise.resolve(
          state.insertImpl ? state.insertImpl(payload) : { data: [payload], error: null }
        ).then((r) => { state.inserts.push(payload); return r; })),
        delete: () => {
          const f = {};
          return {
            eq(k, v) { f[k] = v; return this; },
            then: (res, rej) => Promise.resolve(
              state.deleteImpl ? state.deleteImpl(f) : { data: [], error: null }
            ).then((r) => { state.deletes.push(f); res(r); }, rej),
          };
        },
      };
    }
    if (table === "transactions") {
      return {
        select: () => ({ order: () => thenable({ data: state.txRows.slice(), error: null }) }),
        insert: (payload) => ({
          select: () => ({
            single: () => thenable({
              data: { id: "tx-1", ts: NOW, date: payload.date, type: payload.type, amount: payload.amount, category: payload.category, note: payload.note || "" },
              error: null,
            }),
          }),
        }),
      };
    }
    return { select: async () => ({ data: [], error: { message: "unexpected table: " + table } }) };
  },
};

const { mod } = await loadEsmModule("js/storage.js", { supabaseMock: mock });
const S = mod.default;

// Setup per kasus: reset mock + paksa refetch supaya CATS & cache items
// kembali ke kondisi deterministik.
async function setup(partial = {}) {
  resetState();
  if (partial.userRows) state.userRows = partial.userRows;
  if (partial.txRows) state.txRows = partial.txRows;
  if (partial.user !== undefined) state.user = partial.user;
  if (partial.insertImpl) state.insertImpl = partial.insertImpl;
  if (partial.deleteImpl) state.deleteImpl = partial.deleteImpl;
  await S.loadCategories({ force: true });
  await S.loadAll({ force: true });
}

// =========================================================================
console.log("===== CATEGORIES: API surface =====");
assert(typeof S.loadCategories === "function", "Storage.loadCategories adalah function");
assert(typeof S.addCategory === "function", "Storage.addCategory adalah function");
assert(typeof S.removeCategory === "function", "Storage.removeCategory adalah function");
assert(typeof S.isSafeCatName === "function", "Storage.isSafeCatName adalah function");
console.log("  PASS  loadCategories/addCategory/removeCategory/isSafeCatName ada di Storage");

// =========================================================================
console.log("\n===== CATEGORIES: loadCategories =====");
{
  await setup({ userRows: [{ name: "Sewa", type: "out" }, { name: "Bonus", type: "in" }] });
  assert(S.CATS.out.includes("Sewa"), "loadCategories: custom 'Sewa' ada di out");
  assert(S.CATS.in.includes("Bonus"), "loadCategories: custom 'Bonus' ada di in");
  assert(S.CATS.in.includes("Gaji") && S.CATS.out.includes("Makan"), "loadCategories: default tetap ada");
  console.log("  PASS  merge sistem+custom -> CATS (in-place)");
}
{
  await setup({ userRows: [{ name: "Makan", type: "out" }] });
  const count = S.CATS.out.filter((c) => c === "Makan").length;
  assert.strictEqual(count, 1, "loadCategories: dedupe — 'Makan' muncul sekali");
  assert.strictEqual(S.CATS.out.length, 5, "loadCategories: panjang out tetap 5 setelah dedupe");
  console.log("  PASS  dedupe nama custom yang sama dengan default");
}
{
  await setup({});
  const snapshot = await S.loadCategories();
  snapshot.out.push("HACK");
  snapshot.in.push("HACK");
  assert(!S.CATS.out.includes("HACK"), "loadCategories: return value snapshot (bukan ref CATS)");
  console.log("  PASS  return value snapshot, tidak mengacu ke CATS");
}
{
  await setup({ userRows: [{ name: "Sewa", type: "out" }] });
  const before = state.usrSelects;
  await S.loadCategories(); // tanpa force — masih cached
  assert.strictEqual(state.usrSelects, before, "loadCategories: tanpa force tidak fetch ulang");
  await S.addCategory("Bonus", "in");
  await S.loadCategories(); // setelah add -> invalidate -> fetch ulang
  assert(state.usrSelects > before, "loadCategories: setelah addCategory fetch ulang (invalidated)");
  console.log("  PASS  cache + invalidate setelah addCategory");
}

// =========================================================================
console.log("\n===== CATEGORIES: addCategory =====");
{
  await setup({});
  const r = await S.addCategory("Sewa", "out");
  assert.strictEqual(r, "Sewa", "addCategory: mengembalikan nama yang disimpan");
  assert.strictEqual(state.inserts.length, 1, "addCategory: 1x insert");
  assert.deepStrictEqual(state.inserts[0], { user_id: "u-1", name: "Sewa", type: "out" }, "addCategory: payload insert benar (user_id dari session)");
  console.log("  PASS  happy path: insert user_categories {user_id,name,type}");
}
{
  await setup({});
  const r = await S.addCategory("  Sewa  ", "out");
  assert.strictEqual(r, "Sewa", "addCategory: nama di-trim");
  assert.strictEqual(state.inserts[0].name, "Sewa", "addCategory: payload memakai nama hasil trim");
  console.log("  PASS  trim nama");
}
{
  const dup = { data: null, error: { message: 'duplicate key value violates unique constraint "user_categories_user_id_name_type_key"' } };
  await setup({ insertImpl: () => dup });
  await assert.rejects(() => S.addCategory("Sewa", "out"), /sudah ada/i, "addCategory: duplikat -> pesan 'sudah ada'");
  console.log("  PASS  duplikat (DB error) -> throw 'sudah ada'");
}
{
  await setup({});
  for (const bad of ["__proto__", "constructor", "prototype", "__x", "", "   ", "x".repeat(51)]) {
    await assert.rejects(() => S.addCategory(bad, "out"), "addCategory: tolak nama tidak aman: " + JSON.stringify(bad.slice(0, 12)));
  }
  assert.strictEqual(state.inserts.length, 0, "addCategory: nama tidak aman TIDAK pernah di-insert");
  console.log("  PASS  tolak __proto__/constructor/prototype/__x/kosong/51-char (0 insert)");
}
{
  await setup({});
  await assert.rejects(() => S.addCategory("Sewa", "other"), /Tipe/i, "addCategory: tipe 'other' ditolak");
  assert.strictEqual(state.inserts.length, 0, "addCategory: tipe invalid tidak di-insert");
  console.log("  PASS  tipe invalid ditolak");
}
{
  await setup({ user: null });
  await assert.rejects(() => S.addCategory("Sewa", "out"), /Belum login/, "addCategory: belum login ditolak");
  assert.strictEqual(state.inserts.length, 0, "addCategory: belum login tidak di-insert");
  console.log("  PASS  belum login ditolak");
}

// =========================================================================
console.log("\n===== CATEGORIES: removeCategory =====");
{
  await setup({ txRows: [{ id: "t1", ts: NOW, date: "2026-08-01", type: "out", amount: 100, category: "Sewa", note: "" }] });
  await assert.rejects(() => S.removeCategory("Sewa", "out"), /masih dipakai/, "removeCategory: BLOKIR kategori terpakai");
  assert.strictEqual(state.deletes.length, 0, "removeCategory: terpakai -> TIDAK ada delete");
  console.log("  PASS  blokir kategori yang terpakai di transaksi (0 delete)");
}
{
  await setup({
    txRows: [{ id: "t1", ts: NOW, date: "2026-08-01", type: "out", amount: 100, category: "Makan", note: "" }],
    userRows: [{ name: "Sewa", type: "out" }],
  });
  const r = await S.removeCategory("Sewa", "out");
  assert.strictEqual(r, true, "removeCategory: tidak terpakai -> true");
  assert.strictEqual(state.deletes.length, 1, "removeCategory: 1x delete");
  assert.strictEqual(state.deletes[0].name, "Sewa", "removeCategory: delete filter name");
  assert.strictEqual(state.deletes[0].type, "out", "removeCategory: delete filter type");
  console.log("  PASS  hapus kategori tak terpakai (delete .eq name+.eq type)");
}
{
  await setup({});
  await assert.rejects(() => S.removeCategory("Makan", "out"), /sistem|bawaan/i, "removeCategory: kategori sistem ditolak");
  assert.strictEqual(state.deletes.length, 0, "removeCategory: sistem -> tidak ada delete");
  console.log("  PASS  kategori bawaan sistem tidak bisa dihapus");
}
{
  await setup({ userRows: [{ name: "Sewa", type: "out" }] });
  await assert.rejects(() => S.removeCategory("Sewa", "badtype"), /Tipe/i, "removeCategory: tipe invalid ditolak");
  assert.strictEqual(state.deletes.length, 0, "removeCategory: tipe invalid -> tidak ada delete");
  console.log("  PASS  tipe invalid ditolak");
}

// =========================================================================
console.log("\n===== CATEGORIES: isSafeCatName (direct) =====");
{
  assert.strictEqual(S.isSafeCatName("Sewa"), true, "isSafeCatName: 'Sewa' valid");
  assert.strictEqual(S.isSafeCatName("a".repeat(50)), true, "isSafeCatName: 50 char valid");
  assert.strictEqual(S.isSafeCatName("a".repeat(51)), false, "isSafeCatName: 51 char invalid");
  assert.strictEqual(S.isSafeCatName("__proto__"), false, "isSafeCatName: __proto__ invalid");
  assert.strictEqual(S.isSafeCatName(""), false, "isSafeCatName: kosong invalid");
  assert.strictEqual(S.isSafeCatName(123), false, "isSafeCatName: non-string invalid");
  console.log("  PASS  isSafeCatName (panjang, prototype-chain, tipe)");
}

// =========================================================================
console.log("\n===== CATEGORIES: addTx longgar (kategori custom lolos) =====");
{
  await setup({});
  const row = await S.addTx({ date: "2026-08-31", type: "out", amount: 50000, category: "Sewa", note: "kost" });
  assert.strictEqual(row.category, "Sewa", "addTx: kategori custom 'Sewa' diterima (validasi DB trigger jadi sumber kebenaran)");
  console.log("  PASS  addTx menerima kategori custom (non-default)");
}
{
  await setup({});
  await assert.rejects(() => S.addTx({ date: "2026-08-31", type: "out", amount: 50000, category: "__proto__", note: "" }), /Kategori/, "addTx: nama kategori tidak aman tetap ditolak client-side");
  console.log("  PASS  addTx tetap menolak kategori tidak aman");
}

console.log("\nSEMUA HIJAU: kategori custom per-user.");
