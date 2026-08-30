// js/supabase.js — Inisialisasi client Supabase (ESM)
// Dipakai sebagai <script type="module" src="js/supabase.js"></script>.
// Impor dari CDN dengan pinned version agar deterministik.
//
// Konfigurasi dibaca dari (urutan prioritas):
//   1. window.LK_CONFIG = { url, key }   (set inline di <head>)
//   2. localStorage lk_supabase_url / lk_supabase_key (untuk dev override)
//
// Key yang dipakai: publishable key (sb_publishable_*) atau anon key (eyJ...).
// JANGAN PERNAH pakai service_role key di frontend.

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.0/+esm";

const DEFAULT_URL  = "https://YOUR-PROJECT-REF.supabase.co";
const DEFAULT_KEY  = "YOUR_SUPABASE_PUBLISHABLE_KEY";

const cfg = {
  url:    (window.LK_CONFIG && (window.LK_CONFIG.url  || window.LK_CONFIG.anon)) || localStorage.getItem("lk_supabase_url") || DEFAULT_URL,
  key:    (window.LK_CONFIG && (window.LK_CONFIG.key  || window.LK_CONFIG.anon)) || localStorage.getItem("lk_supabase_key") || localStorage.getItem("lk_supabase_anon") || DEFAULT_KEY
};

// Sanity check: pastikan bukan service_role key
if (cfg.key.startsWith("sb_secret_") || cfg.key.includes("service_role")) {
  console.error(
    "[LK] FATAL: service_role key terdeteksi di frontend! " +
    "Segera ganti dengan publishable/anon key sebelum deploy."
  );
  throw new Error("Invalid Supabase key type");
}

if (!cfg.url || !cfg.key || cfg.key.startsWith("YOUR-")) {
  console.warn(
    "[LK] Supabase belum dikonfigurasi. Set window.LK_CONFIG atau " +
    "localStorage lk_supabase_url / lk_supabase_key."
  );
}

export const supabase = createClient(cfg.url, cfg.key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false
  }
});

// Helper: ambil user saat ini (null kalau belum login)
export async function currentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data && data.user ? data.user : null;
}
