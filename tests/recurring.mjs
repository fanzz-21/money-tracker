// tests/recurring.mjs — Unit test Phase D (transaksi berulang / recurring).
// Mock supabase stateful (satu mock per proses, state di-mutasi per kasus
// via __SUPABASE_MOCK__) — Node ESM module cache = satu instance module,
// jadi semua kasus berbagi Recurring yang sama; state di-reset tiap setup.
// `today` di-inject ke maybeGenerate() — deterministik, tanpa network.
// Filter .eq() di-capture via closure (bukan `this`, agar robust).
//
// Cakupan:
//   - API surface (loadRules/createRule/toggleRule/deleteRule/maybeGenerate).
//   - maybeGenerate: DUE & belum generated -> 1 addTx + markGenerated;
//     idempotent per-bulan; belum due; due-tepat; active=false; catch-up
//     (2 aturan, hari 28).
//   - createRule: payload insert benar, belum login ditolak.
//   - toggleRule / deleteRule: filter .eq id benar.
//
// Run: node tests/recurring.mjs   (exit 0 = semua hijau)

import assert from "node:assert";
import { loadEsmModule } from "./helpers/esm-loader.mjs";

const USER = { id: "u-1", email: "t@t.id" };
const NOW = "2026-08-31T10:00:00.000Z";

// ---- mock supabase stateful ----
const state = {
  rules: [], user: USER,
  recInserts: [], txInserts: [], updates: [], deletes: [],
};
function resetState() {
  state.rules = []; state.user = USER;
  state.recInserts.length = 0; state.txInserts.length = 0;
  state.updates.length = 0; state.deletes.length = 0;
}
const thenable = (p) => ({ then: (res, rej) => Promise.resolve(p).then(res, rej) });

const mock = {
  auth: { getUser: async () => ({ data: { user: state.user }, error: null }) },
  from(table) {
    if (table === "recurring") {
      return {
        // loadRules: select("*").order("day")
        select: () => ({ order: () => thenable({ data: state.rules.slice(), error: null }) }),
        // createRule: insert(payload).select().single()
        insert: (payload) => {
          state.recInserts.push(payload);
          return {
            select: () => ({
              single: () => thenable({ data: { id: "rule-1", ...payload }, error: null }),
            }),
          };
        },
        // toggleRule / markGenerated: update(payload).eq("id", id)
        update: (payload) => {
          const filter = {};
          return {
            eq(k, v) { filter[k] = v; return this; },
            then: (res, rej) => Promise.resolve({ data: null, error: null })
              .then((r) => { state.updates.push({ payload, filter }); res(r); }, rej),
          };
        },
        // deleteRule: delete().eq("id", id)
        delete: () => {
          const filter = {};
          return {
            eq(k, v) { filter[k] = v; return this; },
            then: (res, rej) => Promise.resolve({ data: null, error: null })
              .then((r) => { state.deletes.push(filter); res(r); }, rej),
          };
        },
      };
    }
    if (table === "transactions") {
      return {
        select: () => ({ order: () => thenable({ data: [], error: null }) }),
        insert: (payload) => ({
          select: () => ({
            single: () => {
              state.txInserts.push(payload);
              return thenable({
                data: {
                  id: "tx-" + state.txInserts.length, ts: NOW, date: payload.date,
                  type: payload.type, amount: payload.amount,
                  category: payload.category, note: payload.note || "",
                },
                error: null,
              });
            },
          }),
        }),
      };
    }
    if (table === "categories") return { select: async () => ({ data: [], error: null }) };
    if (table === "user_categories") return { select: async () => ({ data: [], error: null }) };
    return { select: async () => ({ data: [], error: { message: "unexpected table: " + table } }) };
  },
};

// RED expectation: js/recurring.js belum ada -> ERR_MODULE_NOT_FOUND.
const { mod } = await loadEsmModule("js/recurring.js", { supabaseMock: mock });
const R = mod.default;

function rule(over = {}) {
  return {
    id: "rule-1", user_id: USER.id, name: "Internet", type: "out", amount: 100000,
    category: "Tagihan", note: "", day: 5, active: true, last_generated_month: null,
    ...over,
  };
}
function setup(partial = {}) {
  resetState();
  if (partial.rules) state.rules = partial.rules;
  if (partial.user !== undefined) state.user = partial.user;
}

// =========================================================================
console.log("===== RECURRING: API surface =====");
assert(typeof R.loadRules === "function", "loadRules ada");
assert(typeof R.createRule === "function", "createRule ada");
assert(typeof R.toggleRule === "function", "toggleRule ada");
assert(typeof R.deleteRule === "function", "deleteRule ada");
assert(typeof R.maybeGenerate === "function", "maybeGenerate ada");
console.log("  PASS  loadRules/createRule/toggleRule/deleteRule/maybeGenerate ada di Recurring");

// =========================================================================
console.log("\n===== RECURRING: maybeGenerate — due & belum generated =====");
{
  setup({ rules: [rule({ day: 5, last_generated_month: null })] });
  const created = await R.maybeGenerate({ items: [], today: new Date(2026, 7, 15) }); // 15 Aug 2026
  assert.strictEqual(created.length, 1, "1 aturan di-generate");
  assert.strictEqual(state.txInserts.length, 1, "1x insert ke transactions");
  const tx = state.txInserts[0];
  assert.strictEqual(tx.date, "2026-08-05", "date = ym + day (2026-08-05)");
  assert.strictEqual(tx.type, "out", "type dari aturan");
  assert.strictEqual(tx.amount, 100000, "amount dari aturan");
  assert.strictEqual(tx.category, "Tagihan", "category dari aturan");
  assert.strictEqual(tx.note, "Internet", "note = nama aturan");
  assert.strictEqual(tx.user_id, USER.id, "user_id dari session");
  const upd = state.updates.find((u) => u.payload && u.payload.last_generated_month === "2026-08");
  assert(upd, "markGenerated: update last_generated_month=2026-08");
  assert.strictEqual(upd.filter.id, "rule-1", "markGenerated: filter .eq id");
  console.log("  PASS  DUE -> 1 addTx (payload benar) + markGenerated(2026-08)");
}

// =========================================================================
console.log("\n===== RECURRING: maybeGenerate — idempotent per-bulan =====");
{
  setup({ rules: [rule({ day: 5, last_generated_month: "2026-08" })] });
  const created = await R.maybeGenerate({ items: [], today: new Date(2026, 7, 20) });
  assert.strictEqual(created.length, 0, "sudah generated bulan ini -> tidak di-generate lagi");
  assert.strictEqual(state.txInserts.length, 0, "0 insert (idempotent)");
  console.log("  PASS  last_generated_month=ym -> TIDAK duplikat");
}

// =========================================================================
console.log("\n===== RECURRING: maybeGenerate — belum due =====");
{
  setup({ rules: [rule({ day: 20, last_generated_month: null })] });
  const created = await R.maybeGenerate({ items: [], today: new Date(2026, 7, 15) });
  assert.strictEqual(created.length, 0, "day 20 > hari 15 -> belum due");
  assert.strictEqual(state.txInserts.length, 0, "0 insert (belum due)");
  console.log("  PASS  belum jatuh tempo -> TIDAK di-generate");
}

// =========================================================================
console.log("\n===== RECURRING: maybeGenerate — due tepat di hari jatuh tempo =====");
{
  setup({ rules: [rule({ day: 15, last_generated_month: null })] });
  const created = await R.maybeGenerate({ items: [], today: new Date(2026, 7, 15) });
  assert.strictEqual(created.length, 1, "hari === rule.day -> due (bukan setelah)");
  assert.strictEqual(state.txInserts.length, 1, "1 insert saat due tepat");
  console.log("  PASS  today day === rule.day -> due");
}

// =========================================================================
console.log("\n===== RECURRING: maybeGenerate — active=false =====");
{
  setup({ rules: [rule({ day: 5, active: false, last_generated_month: null })] });
  const created = await R.maybeGenerate({ items: [], today: new Date(2026, 7, 15) });
  assert.strictEqual(created.length, 0, "active=false -> dilewati");
  assert.strictEqual(state.txInserts.length, 0, "0 insert (non-aktif)");
  console.log("  PASS  aturan non-aktif -> TIDAK di-generate");
}

// =========================================================================
console.log("\n===== RECURRING: maybeGenerate — backfill / catch-up (2 aturan) =====");
{
  setup({
    rules: [
      rule({ id: "r1", day: 5, name: "Internet" }),
      rule({ id: "r2", day: 28, name: "Listrik" }),
    ],
  });
  const created = await R.maybeGenerate({ items: [], today: new Date(2026, 7, 28) }); // 28 Aug
  assert.strictEqual(created.length, 2, "2 aturan due -> 2 transaksi");
  assert.strictEqual(state.txInserts.length, 2, "2 insert");
  assert.deepStrictEqual(
    state.txInserts.map((t) => t.date).sort(),
    ["2026-08-05", "2026-08-28"],
    "date sesuai masing-masing rule.day"
  );
  assert.strictEqual(state.updates.length, 2, "2x markGenerated");
  console.log("  PASS  catch-up akhir bulan: 2 aturan -> 2 insert + 2 markGenerated");
}

// =========================================================================
console.log("\n===== RECURRING: createRule =====");
{
  setup({});
  const row = await R.createRule({ name: "Internet", type: "out", amount: 100000, category: "Tagihan", note: "", day: 5 });
  assert.strictEqual(row.id, "rule-1", "createRule: mengembalikan row DB (single)");
  assert.strictEqual(state.recInserts.length, 1, "createRule: 1x insert");
  const p = state.recInserts[0];
  assert.strictEqual(p.user_id, USER.id, "payload: user_id dari session");
  assert.strictEqual(p.name, "Internet", "payload: name");
  assert.strictEqual(p.type, "out", "payload: type");
  assert.strictEqual(p.amount, 100000, "payload: amount");
  assert.strictEqual(p.category, "Tagihan", "payload: category");
  assert.strictEqual(p.day, 5, "payload: day");
  assert.strictEqual(p.active, true, "payload: active default true");
  console.log("  PASS  createRule happy path (payload insert benar + row single)");
}
{
  setup({ user: null });
  await assert.rejects(
    () => R.createRule({ name: "X", type: "out", amount: 1, category: "Makan", day: 1 }),
    /Belum login/,
    "createRule: belum login -> reject"
  );
  assert.strictEqual(state.recInserts.length, 0, "createRule: belum login -> 0 insert");
  console.log("  PASS  createRule: belum login ditolak");
}

// =========================================================================
console.log("\n===== RECURRING: toggleRule / deleteRule =====");
{
  setup({});
  await R.toggleRule("rule-9", false);
  assert.strictEqual(state.updates.length, 1, "toggleRule: 1x update");
  assert.deepStrictEqual(state.updates[0].payload, { active: false }, "toggleRule: payload {active:false}");
  assert.deepStrictEqual(state.updates[0].filter, { id: "rule-9" }, "toggleRule: filter .eq id");

  await R.deleteRule("rule-9");
  assert.strictEqual(state.deletes.length, 1, "deleteRule: 1x delete");
  assert.deepStrictEqual(state.deletes[0], { id: "rule-9" }, "deleteRule: filter .eq id");
  console.log("  PASS  toggleRule + deleteRule (filter .eq id benar)");
}

console.log("\nSEMUA HIJAU: transaksi berulang (recurring) deterministik.");
