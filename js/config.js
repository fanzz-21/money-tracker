// js/config.js — Konfigurasi Supabase terpusat (SATU file untuk semua halaman)
//
// Dipakai oleh semua HTML: <script src="js/config.js"> SEBELUM module lain.
// Setelah load, window.LK_CONFIG tersedia dan js/supabase.js akan
// otomatis baca dari situ (lihat urutan prioritas di sana).
//
// CATATAN KEAMANAN:
// - File ini BOLEH di-commit ke repo. Isinya hanya publishable key
//   (`sb_publishable_*`), yang memang dirancang publik — proteksi data
//   ada di RLS Postgres, BUKAN kerahasiaan key.
// - JANGAN PERNAH isi `sb_secret_*` atau service_role key di sini — file
//   ini di-load oleh browser. js/supabase.js punya guard yang throw fatal
//   kalau secret key terdeteksi.
// - Untuk dev/override tanpa edit file ini, set di DevTools console:
//     localStorage.setItem("lk_supabase_url", "...");
//     localStorage.setItem("lk_supabase_key", "...");

window.LK_CONFIG = {
  url: "https://begnlasmgmobpyebzgsc.supabase.co",
  key: "sb_publishable_AFDwKgE47-P3Z6TyxKYp-A_j_5JaZtD"
};