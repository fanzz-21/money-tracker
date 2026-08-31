// js/recurring.js — Transaksi berulang / recurring (Phase D, fitur #8).
//
// Model (sesuai Q1-final, client-side, tanpa cron/server):
//   - "Aturan berulang" = baris di tabel `recurring` (nama, tipe, jumlah,
//     kategori, tanggal 1-28, catatan, active, last_generated_month).
//   - `maybeGenerate({ today })` dipanggil saat app dibuka. Untuk tiap aturan
//     aktif yang sudah jatuh tempo bulan ini (today.day >= rule.day) dan belum
//     di-generate bulan ini (last_generated_month !== ym), insert 1 transaksi
//     ke `transactions` (lewat Storage.addTx -> kena RLS + rate limit +
//     trigger kategori), lalu tandai `last_generated_month = ym`.
//   - IDEMPOTEN PER BULAN: dipanggil berapa kali pun di bulan yang sama,
//     tiap aturan hanya di-generate sekali (guard last_generated_month).
//   - CATCH-UP: kalau user tidak buka app pas tanggal jatuh tempo, insert
//     terjadi saat app berikutnya dibuka (bukan tepat di tanggal).
//
// Keamanan: validasi client-side (mirror addTx) + sumber kebenaran = RLS +
// check constraint DB. Semua pesan Bahasa Indonesia.
//
// API publik (window.Recurring):
//   loadRules()                     -> Promise<Rule[]>   (urutan day)
//   createRule({name,type,amount,category,note,day}) -> Promise<Rule>
//   toggleRule(id, active)          -> Promise<void>
//   deleteRule(id)                  -> Promise<void>
//   maybeGenerate({ today })         -> Promise<Rule[]>  (yang baru dibuat)
//
// `markGenerated` sengaja TIDAK di-export (internal) — hanya dipakai
// maybeGenerate.

import { supabase } from "./supabase.js";
import Storage from "./storage.js";

const MAX_AMOUNT = 1000000000; // 1 miliar (sama dengan addTx)
const MAX_NAME = 100;
const MAX_NOTE = 500;

function monthKeyOf(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}

// Muat aturan berulang milik user (urut per tanggal).
async function loadRules() {
  const { data, error } = await supabase
    .from("recurring")
    .select("*")
    .order("day");
  if (error) throw new Error(error.message);
  return data || [];
}

// Buat aturan baru. Validasi client-side mirror addTx; sumber kebenaran
// akhir = check constraint DB (length range, type in ('in','out'), day 1-28).
async function createRule({ name, type, amount, category, note, day }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Belum login.");

  const cleanName = String(name || "").trim();
  if (!cleanName) throw new Error("Nama aturan wajib diisi.");
  if (cleanName.length > MAX_NAME) throw new Error("Nama aturan terlalu panjang (maks 100).");
  if (!["in", "out"].includes(type)) throw new Error("Tipe tidak valid.");
  const n = Math.round(Number(amount));
  if (!Number.isFinite(n) || n < 1) throw new Error("Jumlah tidak valid (min 1).");
  if (n > MAX_AMOUNT) throw new Error("Jumlah terlalu besar.");
  if (!Storage.isSafeCatName(category)) throw new Error(`Kategori "${category}" tidak dikenal.`);
  const d = Math.round(Number(day));
  if (!Number.isFinite(d) || d < 1 || d > 28) throw new Error("Tanggal harus 1-28.");
  const cleanNote = String(note || "").trim().slice(0, MAX_NOTE);

  const { data, error } = await supabase
    .from("recurring")
    .insert({
      user_id: user.id,
      name: cleanName,
      type,
      amount: n,
      category,
      note: cleanNote,
      day: d,
      active: true
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// Ubah status aktif/non-aktif aturan.
async function toggleRule(id, active) {
  const { error } = await supabase
    .from("recurring")
    .update({ active: !!active })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// Hapus aturan.
async function deleteRule(id) {
  const { error } = await supabase
    .from("recurring")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// (internal) Tandai aturan sudah di-generate di bulan ym.
async function markGenerated(id, ym) {
  const { error } = await supabase
    .from("recurring")
    .update({ last_generated_month: ym })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// Core: generate transaksi untuk aturan yang sudah jatuh tempo bulan ini
// dan belum di-generate. Idempotent per-bulan. `opts.today` di-inject supaya
// test deterministik; `opts.items` diterima untuk kompatibilitas API (belum
// dipakai untuk dedup — dedup murni via last_generated_month).
async function maybeGenerate(opts = {}) {
  const today = opts.today || new Date();
  const ym = monthKeyOf(today);
  const day = today.getDate();

  const rules = await loadRules();
  const created = [];
  for (const r of rules) {
    if (!r.active) continue;                 // non-aktif dilewati
    if (r.last_generated_month === ym) continue; // sudah di-generate bln ini
    if (day < r.day) continue;               // belum jatuh tempo bln ini
    const date = ym + "-" + String(r.day).padStart(2, "0");
    await Storage.addTx({
      date,
      type: r.type,
      amount: r.amount,
      category: r.category,
      note: r.name
    });
    await markGenerated(r.id, ym);
    created.push(r);
  }
  return created;
}

const Recurring = {
  loadRules,
  createRule,
  toggleRule,
  deleteRule,
  maybeGenerate
};

window.Recurring = Recurring;
export default Recurring;
export { loadRules, createRule, toggleRule, deleteRule, maybeGenerate };
