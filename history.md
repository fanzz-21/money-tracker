# Riwayat proyek LK

Proyek ini adalah aplikasi web laporan keuangan harian (Kas Harian).
Folder kerja: `/root/LK` di FzServer. Target deploy: Vercel (situs statis).
Aturan kode: maksimal 300 baris per file.

## Versi saat ini: 2.1.0 (Supabase + PWA)

Migrasi dari backend custom (sql.js + Vercel functions) ke **Supabase** (Postgres + Auth).
Frontend tetap static, semua logika pindah ke Supabase. RLS aktif: user hanya akses datanya sendiri.

## Struktur v2 (Supabase)

```
LK/
├── index.html          # Dashboard (ringkasan, chart aliran & kategori, transaksi hari ini)
├── login.html          # Login 2 langkah: email -> password (auto-register)
├── input.html          # Input transaksi (jenis, jumlah, kategori dinamis, note, tanggal)
├── history.html        # Riwayat (filter bulan/jenis/cari, hapus per item, ekspor CSV)
├── css/
│   └── ui.css
├── js/
│   ├── supabase.js     # Client Supabase (CDN ESM, pinned v2.45.0)
│   ├── auth.js         # signIn/signUp/signOut/requireAuth + error translation
│   ├── storage.js      # CRUD transaksi ke Supabase (API kompatibel dgn versi lokal)
│   ├── migrate.js      # One-time import localStorage -> Supabase
│   ├── theme.js        # Dark/light mode
│   ├── chart.js        # Canvas chart (flow line + category donut)
│   ├── dashboard.js    # Logika dashboard
│   ├── input.js        # Logika form input
│   ├── history.js      # Logika riwayat
│   ├── login.js        # Logika login 2 langkah
│   └── tailwind-config.js
├── supabase/
│   └── schema.sql      # Tabel transactions + RLS policies
├── vercel.json
├── history.md
└── README.md
```

## Fitur
- **Auth**: Supabase Auth (email + password, min. 6 karakter). Session persist via localStorage (`sb-*-auth-token`).
- **Transaksi**: CRUD ke Postgres. Auto-migrasi data lama dari localStorage saat login pertama.
- **Dashboard**: Ringkasan bulan ini + chart 6/12 bulan + donut kategori.
- **Riwayat**: Filter bulan, jenis, pencarian note. Hapus per item. Ekspor CSV.
- **Tema**: Dark/light mode persist. Aksesibilitas dasar, mobile-first.
- **Keamanan**: Row Level Security (RLS) — user hanya baca/tulis datanya sendiri.

## Alur login (Supabase)

1. User masukkan email di step 1.
2. User masukkan password di step 2.
3. `signIn` dicoba dulu.
4. Jika gagal dengan "Invalid credentials" -> otomatis fallback ke `signUp`.
5. Jika Supabase butuh email confirmation -> tampilkan pesan.
6. Setelah session ada, `migrateLocalToSupabase()` jalan (jika ada data lama).
7. Redirect ke `?next=` atau `index.html`.

## Schema Supabase (ringkasan)

```sql
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ts timestamptz not null default now(),
  date date not null,
  type text not null check (type in ('in', 'out')),
  amount integer not null check (amount > 0),
  category text not null,
  note text not null default ''
);
-- + index (user_id, date), (user_id, ts desc)
-- + RLS: select/insert/delete hanya untuk auth.uid() = user_id
```

## Verifikasi baris (wc -l, versi v2)
```
     79 history.html
    109 index.html
    111 input.html
     81 login.html
     87 css/ui.css
     52 js/supabase.js
    102 js/auth.js
    251 js/storage.js
     65 js/migrate.js
     43 js/theme.js
    219 js/chart.js
     85 js/dashboard.js
    105 js/input.js
    124 js/history.js
    150 js/login.js
     91 js/tailwind-config.js
     61 supabase/schema.sql
      9 vercel.json
```

## Fase migrasi (rencana)

- [x] **Fase 1** — Migrasi DB ke Supabase (Jalur A: full Supabase, hapus folder `api/`)
  - [x] Schema SQL + RLS
  - [x] `js/supabase.js` (client init)
  - [x] `js/auth.js` rewrite ke Supabase Auth
  - [x] `js/storage.js` rewrite ke Supabase (API kompatibel)
  - [x] HTML: tambah `type="module"` untuk supabase/auth/storage
  - [x] `js/migrate.js` one-time import localStorage
  - [x] Hapus folder `api/`, cleanup `vercel.json`
  - [x] `js/login.js` flow baru (signIn -> fallback signUp)
  - [x] Update README + history.md
- [x] **Fase 2** — Hardening
  - [x] **Client-side**: `storage.js` validasi kategori whitelist, amount max 1B, note max 500 char, error translation
  - [x] **Server-side** (perlu apply manual di dashboard): `supabase/hardening-patch.sql`
    - Tabel `categories` + RLS read-only
    - CHECK constraint: `amount <= 1000000000`, `length(note) <= 500`, `length(category) 1-50`
    - FK `category -> categories.id` (NOT VALID supaya row existing tidak di-recheck)
    - Trigger `tx_rate_limit`: max 60 transaksi/jam/user
    - View `transactions_monthly_summary` (RLS inherited)
  - [x] Penetration test: 7 attack vector diuji, 2 vulnerability ditemukan & diperbaiki (amount unbounded, no category whitelist)
- [x] **Fase 3** — Fitur tambahan
  - [x] **Backup/restore JSON** (export semua transaksi, restore dari file)
  - [x] **Reset all** (hapus semua data dengan double-confirm)
  - [x] **Multi-device realtime** — `js/realtime.js` subscribe ke `postgres_changes` di tabel `transactions` filtered by user_id. INSERT/DELETE dari device apapun di-broadcast via `LK.broadcast("tx:added"/"tx:removed")` sehingga dashboard.js & history.js auto-rerender tanpa refresh. Idempotent + auto-reconnect 5 detik saat channel error.
  - [x] **Notifikasi budget per kategori** — `js/budget.js` (localStorage `lk_budgets_v1`). UI inline di input.html (progress bar per kategori + tombol Set via prompt). Warning di save() saat kategori over-budget (≥100%) atau hampir capai (≥80%). Card "Budget bulan ini" di dashboard.js dengan progress bar berwarna (hijau / kuning / merah). Tidak di-sync ke server (privasi).
  - [x] **PWA + service worker** — `manifest.webmanifest` (name, theme_color, start_url, scope, ikon SVG+PNG 192/512), `sw.js` (network-first navigasi, stale-while-revalidate static, skip Supabase/CDN, versioned cache), `js/pwa.js` (register SW + inject manifest/theme-color/apple-touch-icon ke head). Bisa install ke home screen, jalan offline setelah load pertama.
  - [x] **Refactor storage.js** — pecah 3 fungsi (exportToJSON, importFromJSON, clearAll) ke `js/storage-backup.js`. storage.js turun dari 382 → 276 baris. API publik `Storage.xxx` tetap kompatibel karena storage-backup.js patch singleton setelah di-load.
  - [x] **Cleanup history.md** — update label Fase 3, tambah deployment row.
  - [x] **Email confirm OFF** — dimatikan di dashboard Supabase Auth > Providers > Email.

## Catatan
- Chrome/Chromium tidak bisa dibuka di FzServer (headless gagal). Verifikasi via `curl` HTTP 200.
- Tidak ada folder `api/` lagi — semua backend adalah Supabase.
- Setiap halaman harus menyertakan `window.LK_CONFIG` sebelum `<script type="module" src="js/supabase.js">`.
- Email confirmation Supabase defaultnya ON. Untuk auto-login setelah daftar, matikan di Auth > Providers > Email > Confirm email = OFF.
- Project Supabase: `begnlasmgmobpyebzgsc` (publishable key + anon key sudah ter-config di semua HTML)
- Untuk deploy: `npx vercel --prod --yes` (perlu login Vercel dulu) atau via REST API (lihat /root/LK/.vercel/project.json).
- Vercel CLI 59+ wajib `outputDirectory` di `vercel.json` (sudah di-set ke `.`).

## Deployment history

| Date | ID | State | URL | Note |
|---|---|---|---|---|
| 2026-08-28 | dpl_b7mpopy8f (kas-harian-b7mpopy8f) | READY | https://kas-harian-swart.vercel.app | Security: XSS escape (escapeHTML) + CSP + X-Frame-Options + sw.js shell coverage fix |
| 2026-08-28 | dpl_32hCueEkHzhVLe1fXfK3YVjMxPJ5 | READY | https://kas-harian-swart.vercel.app | Fase 3 #1: backup/restore JSON + reset all |
| 2026-08-28 | dpl_5xx3vfDi8LUb7tnkDgSqeo8EFKjL | READY | https://kas-harian-swart.vercel.app | Hapus per-item: icon + label + visual feedback |
| 2026-08-28 | dpl_8ysVfjvVfdwKoxFiUKyBcjochjH1 | READY | https://kas-harian-swart.vercel.app | Fase 2: client-side hardening |
| 2026-08-28 | dpl_25TcFPo9PD1RMnhvVc9sTdKWpcjQ | READY | https://kas-harian-swart.vercel.app | UI redesign + cross-tab sync + no-redirect |
| 2026-08-28 | dpl_GBrnj7nrCXCBbMLD2LEd3CwxowSw | READY | https://kas-harian-swart.vercel.app | Username-only login + dark mode fix |
| 2026-08-28 | dpl_Ffdic1BqYAFp8GjmRppUtndzFLvt | READY | https://kas-harian-swart.vercel.app | Auth.logout + ready.js fix module loading race |
| 2026-08-28 | dpl_BcQEnZuXvVphKifREtFUgLf8j5g1 | READY | https://kas-harian-swart.vercel.app | Initial cache buster deploy |
| 2026-08-28 | dpl_EUJZDea7G9ZHiz5LFgyR6hzbQJJi | READY | https://kas-harian-swart.vercel.app | Migrasi ke Supabase + outputDirectory fix |
| 2026-08-28 | dpl_ATyaqqjgM4sphFn2gydRipgC4zL8 | ERROR | - | "No Output Directory named public" |
| 2026-08-21 | dpl_FdCxu2cZJsSquSDT6N3vXmsvroC3 | ERROR | - | sql.js + Vercel filesystem tidak kompatibel |
