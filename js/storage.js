// js/storage.js — Storage transaksi (Supabase backend, ESM)
// API publik (kompatibel dengan versi localStorage lama):
//   Storage.CATS                    -> { in: [...], out: [...] }
//   Storage.todayISO()              -> "YYYY-MM-DD"
//   Storage.uid()                   -> string  (uuid, fallback untuk client-side)
//   Storage.loadAll()               -> Promise<Transaction[]>
//   Storage.addTx({date,type,amount,category,note}) -> Promise<Transaction>
//   Storage.removeTx(id)            -> Promise<boolean>
//   Storage.clearDate(date)         -> Promise<number>  (count dihapus)
//   Storage.byDate(items, date)     -> Transaction[]   (filter+sort, sync)
//   Storage.totals(items, date)     -> {masuk,keluar,net,all}  (sync)
//   Storage.toCsv(items)            -> string  (sync)
//   Storage.monthKey(iso)           -> "YYYY-MM"
//   Storage.lastMonths(n)           -> ["YYYY-MM", ...]
//   Storage.monthTotals(items, ym)  -> {masuk,keluar,net}  (sync)
//   Storage.flowSeries(items, n)    -> [{ym,label,masuk,keluar}]
//   Storage.spendByCategory(items, ym?) -> [{name,amount}]
//
// Catatan migrasi:
// - items sekarang adalah array biasa hasil query (bukan array sinkron).
// - Semua helper chart/totals/byDate tetap menerima array (sync) supaya
//   tidak perlu ubah dashboard.js / history.js / input.js.
// - loadAll() otomatis populate cache internal untuk sinkronisasi
//   instan di render().

import { supabase } from "./supabase.js";

const CATS = {
  in: ["Gaji", "Usaha", "Transfer masuk", "Lainnya"],
  out: ["Makan", "Transport", "Tagihan", "Belanja", "Lainnya"]
};

const ALL_CATS = new Set([...CATS.in, ...CATS.out]);

const MAX_AMOUNT = 1_000_000_000;       // 1 miliar
const MAX_NOTE_LENGTH = 500;            // chars
const MAX_CATEGORY_LENGTH = 50;         // chars

let _cache = null;
let _inflight = null;

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}

function uid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return String(Date.now()) + "-" + Math.random().toString(36).slice(2, 10);
}

function rowFromDb(r) {
  // Map snake_case DB columns -> camelCase internal
  return {
    id: r.id,
    ts: r.ts,
    date: typeof r.date === "string" ? r.date : r.date.slice(0, 10),
    type: r.type,
    amount: Number(r.amount),
    category: r.category,
    note: r.note || ""
  };
}

async function loadAll({ force = false } = {}) {
  if (!force && _cache) return _cache;
  if (_inflight) return _inflight;

  _inflight = (async () => {
    const { data, error } = await supabase
      .from("transactions")
      .select("id,ts,date,type,amount,category,note")
      .order("ts", { ascending: false });
    if (error) {
      _inflight = null;
      throw new Error(error.message);
    }
    _cache = (data || []).map(rowFromDb);
    _inflight = null;
    return _cache;
  })();

  return _inflight;
}

function invalidate() {
  _cache = null;
}

async function addTx({ date, type, amount, category, note }) {
  if (!date || !type || !category) throw new Error("Field wajib kosong.");
  if (!["in", "out"].includes(type)) throw new Error("Tipe tidak valid.");
  const n = Math.round(Number(amount));
  if (!Number.isFinite(n) || n < 1) throw new Error("Jumlah tidak valid (min 1).");
  if (n > MAX_AMOUNT) throw new Error(`Jumlah terlalu besar (maks ${MAX_AMOUNT.toLocaleString("id-ID")}).`);
  if (!ALL_CATS.has(category)) throw new Error(`Kategori "${category}" tidak dikenal.`);
  const cleanNote = String(note || "").trim().slice(0, MAX_NOTE_LENGTH);
  if (category.length > MAX_CATEGORY_LENGTH) throw new Error("Kategori terlalu panjang.");

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Belum login.");

  const { data, error } = await supabase
    .from("transactions")
    .insert({
      user_id: user.id,
      date,
      type,
      amount: n,
      category,
      note: cleanNote
    })
    .select()
    .single();

  if (error) {
    // Translate Supabase error ke Bahasa Indonesia
    if (error.message.includes("rate_limit")) {
      throw new Error("Terlalu banyak transaksi. Coba lagi nanti.");
    }
    if (error.message.includes("check constraint") || error.message.includes("violates")) {
      throw new Error("Data tidak valid (cek jumlah, kategori, atau panjang note).");
    }
    throw new Error(error.message);
  }
  const row = rowFromDb(data);
  if (_cache) _cache = [row, ..._cache];
  return row;
}

async function removeTx(id) {
  const { error } = await supabase.from("transactions").delete().eq("id", id);
  if (error) throw new Error(error.message);
  if (_cache) _cache = _cache.filter((t) => t.id !== id);
  return true;
}

async function clearDate(date) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Belum login.");
  const { data, error } = await supabase
    .from("transactions")
    .delete()
    .eq("user_id", user.id)
    .eq("date", date)
    .select("id");
  if (error) throw new Error(error.message);
  const count = (data || []).length;
  if (_cache) _cache = _cache.filter((t) => t.date !== date);
  return count;
}

// =========================================================================
// Backup & restore (exportToJSON / importFromJSON / clearAll) dipindah ke
// js/storage-backup.js. Import di HTML setelah storage.js.
// =========================================================================

// -------- sync helpers (menerima array, sama seperti versi localStorage) ----

function byDate(items, date) {
  return items
    .filter((t) => t.date === date)
    .sort((a, b) => (a.ts < b.ts ? 1 : -1));
}

function totals(items, date) {
  let masuk = 0;
  let keluar = 0;
  let all = 0;
  for (const t of items) {
    const n = Number(t.amount) || 0;
    const signed = t.type === "in" ? n : -n;
    all += signed;
    if (t.date === date) {
      if (t.type === "in") masuk += n;
      else keluar += n;
    }
  }
  return { masuk, keluar, net: masuk - keluar, all };
}

function toCsv(items) {
  const head = "tanggal,jenis,jumlah,kategori,keterangan,waktu";
  const lines = items.map((t) => {
    const note = String(t.note || "").replaceAll('"', '""');
    return [
      t.date,
      t.type === "in" ? "masuk" : "keluar",
      t.amount,
      t.category,
      '"' + note + '"',
      t.ts
    ].join(",");
  });
  return [head].concat(lines).join("\n");
}

function monthKey(iso) {
  return String(iso || "").slice(0, 7);
}

function lastMonths(n) {
  const out = [];
  const d = new Date();
  d.setDate(1);
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    const ym = x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0");
    out.push(ym);
  }
  return out;
}

function monthTotals(items, ym) {
  let masuk = 0;
  let keluar = 0;
  for (const t of items) {
    if (monthKey(t.date) !== ym) continue;
    const n = Number(t.amount) || 0;
    if (t.type === "in") masuk += n;
    else keluar += n;
  }
  return { masuk, keluar, net: masuk - keluar };
}

function flowSeries(items, n) {
  return lastMonths(n).map((ym) => {
    const t = monthTotals(items, ym);
    return { ym, label: ym.slice(5), masuk: t.masuk, keluar: t.keluar };
  });
}

function spendByCategory(items, ym) {
  const map = {};
  for (const t of items) {
    if (t.type !== "out") continue;
    if (ym && monthKey(t.date) !== ym) continue;
    const k = t.category || "Lainnya";
    map[k] = (map[k] || 0) + (Number(t.amount) || 0);
  }
  return Object.keys(map)
    .map((name) => ({ name, amount: map[name] }))
    .sort((a, b) => b.amount - a.amount);
}

// Ekspos ke window untuk kompatibilitas dengan kode non-modular
// (dashboard.js, history.js, input.js masih pakai `Storage.xxx`).
const Storage = {
  CATS,
  todayISO,
  uid,
  loadAll,
  addTx,
  removeTx,
  clearDate,
  byDate,
  totals,
  toCsv,
  monthKey,
  lastMonths,
  monthTotals,
  flowSeries,
  spendByCategory
  // exportToJSON / importFromJSON / clearAll ditambahkan oleh storage-backup.js
};

window.Storage = Storage;
export default Storage;
export {
  CATS, todayISO, uid, loadAll, addTx, removeTx, clearDate,
  byDate, totals, toCsv, monthKey, lastMonths, monthTotals,
  flowSeries, spendByCategory
};
