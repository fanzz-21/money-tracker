# Kas Harian (LK)

Aplikasi laporan keuangan harian. Frontend static (HTML + JS) dengan backend Supabase (Postgres + Auth).

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
├── css/
│   └── ui.css
├── js/
│   ├── supabase.js     # Client Supabase (ESM, CDN pinned)
│   ├── auth.js         # signIn/signUp/signOut/requireAuth (ESM)
│   ├── storage.js      # CRUD transaksi ke Supabase + helper chart
│   ├── migrate.js      # One-time import localStorage -> Supabase
│   ├── theme.js
│   ├── chart.js
│   ├── dashboard.js
│   ├── input.js
│   ├── history.js
│   ├── login.js
│   └── tailwind-config.js
├── supabase/
│   └── schema.sql      # Skema tabel + RLS (jalankan di Supabase SQL Editor)
├── vercel.json
├── history.md
└── README.md
```

## Setup

### 1. Buat project Supabase

1. Buka https://supabase.com/dashboard, buat project baru
2. Catat **Project URL** dan **anon public key** (Settings > API)
3. Jalankan `supabase/schema.sql` di SQL Editor
4. (Opsional) Matikan email confirmation: Auth > Providers > Email > Confirm email = OFF

### 2. Konfigurasi frontend

Konfigurasi Supabase sudah ter-set di semua HTML (`window.LK_CONFIG = { url, key }`).
Project: `begnlasmgmobpyebzgsc` dengan publishable key.

Untuk override di dev:

```js
localStorage.setItem("lk_supabase_url", "https://xxxxx.supabase.co");
localStorage.setItem("lk_supabase_key", "sb_publishable_...");
```

### 3. Deploy ke Vercel

```bash
cd /root/LK
npx vercel login   # hanya sekali
npx vercel --yes
```

Atau upload folder ini di https://vercel.com/new.

## Aturan

- Maks 300 baris per file
- Backend murni Supabase — tidak ada folder `api/` lagi
- Semua script frontend ESM dimuat via CDN; tidak ada build step

## Keamanan

- **Publishable key** di frontend aman — user hanya bisa akses datanya sendiri (RLS)
- **service_role key** JANGAN pernah di-commit atau di-paste di frontend
- `js/supabase.js` punya guard yang throw error jika service_role key terdeteksi di config frontend

## Migrasi dari versi lama

Jika sebelumnya pakai versi localStorage, data lama otomatis diimpor ke Supabase
saat login pertama kali. Lihat `js/migrate.js`.
