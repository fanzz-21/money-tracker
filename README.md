# Money Tracker

Aplikasi catatan kas harian. Frontend static (HTML + JS ESM) dengan backend Supabase (Postgres + Auth + RLS).

- **Auth** — Supabase Auth (email + password, min. 6 karakter)
- **Storage** — Postgres via Supabase. RLS aktif: user hanya akses datanya sendiri
- **Multi-device** — login di device manapun, data otomatis tersedia

## Struktur

```
LK/
├── index.html          # Dashboard
├── login.html          # Login 2-langkah (email -> password, auto-register)
├── input.html          # Form input transaksi
├── history.html        # Riwayat + filter + ekspor CSV
├── profile.html        # Profil user + ganti password + budget
├── css/
│   └── ui.css
├── js/
│   ├── supabase.js     # Client Supabase (ESM, CDN pinned)
│   ├── auth.js         # signIn/signUp/signOut/requireAuth (ESM)
│   ├── storage.js      # CRUD transaksi ke Supabase + helper chart
│   ├── migrate.js      # One-time import localStorage -> Supabase
│   ├── theme.js, chart.js, dashboard.js, input.js, history.js, ...
├── supabase/
│   └── schema.sql      # Skema tabel + RLS (jalankan di Supabase SQL Editor)
├── vercel.json
└── history.md          # Catatan perubahan versi
```

## Setup

### 1. Buat project Supabase

1. Buka https://supabase.com/dashboard, buat project baru
2. Catat **Project URL** dan **publishable key** (Settings > API)
3. Jalankan `supabase/schema.sql` di SQL Editor
4. (Opsional) Matikan email confirmation: Auth > Providers > Email > Confirm email = OFF

### 2. Konfigurasi frontend

Semua konfigurasi Supabase terpusat di **satu file**: `js/config.js`.

```js
// js/config.js
window.LK_CONFIG = {
  url: "https://YOUR-PROJECT-REF.supabase.co",
  key: "YOUR_SUPABASE_PUBLISHABLE_KEY"
};
```

**Hanya edit di sini.** Setiap HTML (`index.html`, `login.html`, `input.html`,
`history.html`, `profile.html`) me-load `js/config.js` duluan sebelum module lain,
sehingga Anda tidak perlu copy-paste URL/key ke banyak tempat.

Atau override di dev tanpa edit file (lebih aman untuk live deploy):

```js
// DevTools console
localStorage.setItem("lk_supabase_url", "https://xxxxx.supabase.co");
localStorage.setItem("lk_supabase_key", "sb_publishable_...");
```

### 3. Deploy ke Vercel

```bash
npx vercel login      # hanya sekali
npx vercel --yes      # preview
npx vercel --prod     # production
```

Atau upload folder ini di https://vercel.com/new.

## Aturan

- Maks 300 baris per file
- Backend murni Supabase — tidak ada folder `api/`
- Semua script frontend ESM dimuat via CDN; tidak ada build step

## Keamanan

- **Publishable key** di frontend aman — RLS yang memproteksi data, BUKAN kerahasiaan key
- **service_role key** JANGAN pernah di-commit atau di-paste di frontend
- `js/supabase.js` punya guard yang throw error jika service_role key terdeteksi di config frontend
- Setelah fork/clone, selalu ganti placeholder di § Konfigurasi dengan key Supabase milikmu sendiri

## Migrasi dari versi lama

Jika sebelumnya pakai versi localStorage, data lama otomatis diimpor ke Supabase
saat login pertama kali. Lihat `js/migrate.js`.