// js/migrate.js — Migrasi data localStorage lama ke Supabase (one-time)
// Dipanggil otomatis dari auth.js setelah login berhasil jika:
//   - localStorage["kas-harian-v1"] ada
//   - localStorage["lk_migrated_v1"] belum ada
//
// Hanya jalan untuk user yang baru pertama login (created flag dari signUp
// atau signIn). Setelah berhasil, key localStorage lama dihapus.

import { supabase } from "./supabase.js";

const OLD_KEY = "kas-harian-v1";
const MIGRATED_FLAG = "lk_migrated_v1";

function loadLocal() {
  try {
    const raw = localStorage.getItem(OLD_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function clearLocal() {
  localStorage.removeItem(OLD_KEY);
  localStorage.setItem(MIGRATED_FLAG, new Date().toISOString());
}

export async function migrateLocalToSupabase() {
  if (localStorage.getItem(MIGRATED_FLAG)) return { skipped: true };
  const items = loadLocal();
  if (!items.length) {
    localStorage.setItem(MIGRATED_FLAG, new Date().toISOString());
    return { skipped: true, count: 0 };
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { skipped: true, reason: "not-logged-in" };

  // Map ke schema DB. Skip jika id bentrok (sudah pernah migrasi parsial).
  const rows = items.map((t) => ({
    id: t.id && /^[0-9a-f-]{36}$/i.test(String(t.id)) ? t.id : undefined,
    user_id: user.id,
    ts: t.ts || new Date().toISOString(),
    date: t.date,
    type: t.type === "in" ? "in" : "out",
    amount: Math.max(1, Math.round(Number(t.amount) || 0)),
    category: String(t.category || "Lainnya"),
    note: String(t.note || "")
  })).filter((r) => r.date && r.type && r.amount >= 1);

  if (!rows.length) {
    clearLocal();
    return { skipped: true, count: 0 };
  }

  const { error } = await supabase.from("transactions").insert(rows);
  if (error) {
    console.error("[LK] Migrasi gagal:", error.message);
    return { skipped: true, error: error.message };
  }
  clearLocal();
  return { ok: true, count: rows.length };
}
