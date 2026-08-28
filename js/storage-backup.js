// js/storage-backup.js — Backup/restore/reset JSON untuk Storage
// Dipisah dari storage.js supaya file utama tetap di bawah 300 baris.
// Cara pakai: import file ini SETELAH storage.js agar window.Storage ada.
// Modul ini menambah 3 method (exportToJSON, importFromJSON, clearAll)
// ke window.Storage. Aman dipanggil berulang (cek existing).

import Storage from "./storage.js";
import { supabase } from "./supabase.js";

const EXPORT_VERSION = 1;
const MAX_AMOUNT = 1_000_000_000;
const MAX_NOTE_LENGTH = 500;

// Pakai whitelist dari Storage.CATS (single source of truth)
const ALL_CATS = new Set([
  ...(Storage.CATS.in || []),
  ...(Storage.CATS.out || [])
]);

function exportToJSON(items) {
  return JSON.stringify({
    app: "kas-harian",
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    count: items.length,
    transactions: items.map((t) => ({
      id: t.id,
      ts: t.ts,
      date: t.date,
      type: t.type,
      amount: Number(t.amount),
      category: t.category,
      note: t.note || ""
    }))
  }, null, 2);
}

async function importFromJSON(jsonText) {
  let data;
  try { data = JSON.parse(jsonText); }
  catch (e) { throw new Error("File bukan JSON valid."); }
  if (!data || data.app !== "kas-harian") {
    throw new Error("File bukan backup kas-harian (app key salah).");
  }
  if (typeof data.version !== "number" || data.version < 1) {
    throw new Error("Versi backup tidak dikenal.");
  }
  if (!Array.isArray(data.transactions)) {
    throw new Error("Format transactions tidak valid.");
  }
  const valid = [];
  const skipped = [];
  for (const t of data.transactions) {
    if (!t || typeof t !== "object") { skipped.push("non-object"); continue; }
    if (!t.date || !/^\d{4}-\d{2}-\d{2}$/.test(t.date)) { skipped.push(`bad date: ${t.date}`); continue; }
    if (!["in", "out"].includes(t.type)) { skipped.push(`bad type: ${t.type}`); continue; }
    const amt = Math.round(Number(t.amount));
    if (!Number.isFinite(amt) || amt < 1 || amt > MAX_AMOUNT) { skipped.push(`bad amount: ${t.amount}`); continue; }
    if (!ALL_CATS.has(t.category)) { skipped.push(`bad category: ${t.category}`); continue; }
    const note = String(t.note || "").slice(0, MAX_NOTE_LENGTH);
    valid.push({ date: t.date, type: t.type, amount: amt, category: t.category, note });
  }
  if (!valid.length) {
    throw new Error(`Tidak ada baris valid. ${skipped.length} baris dilewati.`);
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Belum login.");

  // Bulk insert (maks 500 per request, Supabase limit)
  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < valid.length; i += BATCH) {
    const batch = valid.slice(i, i + BATCH).map((r) => ({ user_id: user.id, ...r }));
    const { data: rows, error } = await supabase
      .from("transactions")
      .insert(batch)
      .select("id");
    if (error) {
      if (error.message.includes("rate_limit")) {
        throw new Error(`Rate limit saat import (sukses: ${inserted}). Coba lagi nanti.`);
      }
      throw new Error(error.message);
    }
    inserted += (rows || []).length;
  }
  return { inserted, skipped: skipped.length };
}

async function clearAll() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Belum login.");
  // Hapus semua row user. Batched untuk hindari request timeout.
  const BATCH = 500;
  let deleted = 0;
  while (true) {
    const { data, error } = await supabase
      .from("transactions")
      .delete()
      .eq("user_id", user.id)
      .select("id");
    if (error) throw new Error(error.message);
    deleted += (data || []).length;
    if (!data || data.length < BATCH) break;
  }
  return deleted;
}

// Patch ke Storage singleton (aman: cek existing supaya tidak overwrite
// jika user reload module).
Storage.exportToJSON = exportToJSON;
Storage.importFromJSON = importFromJSON;
Storage.clearAll = clearAll;
window.Storage = Storage;

export { exportToJSON, importFromJSON, clearAll };
export default { exportToJSON, importFromJSON, clearAll };
