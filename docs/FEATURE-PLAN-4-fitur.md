# Fintrack — 4 Fitur (Insight, Export, Custom Kategori, Recurring) Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.
> Setiap phase = independently shippable. Urutan A → D dipilih berdasar risiko & dependensi.

**Goal:** Tambah 4 fitur ke Fintrack: (7) ringkasan/insight bulanan, (2) ekspor CSV/Excel yang benar, (6) kategori custom per-user, (8) transaksi berulang (recurring) dengan auto-insert.

**Architecture:** App = static PWA (HTML + classic JS + ESM modules), data di Supabase (Postgres + RLS + Realtime). Pola: modul ESM (`js/*.js`) yang expose helper ke `window`, dikonsumsi page-script classic via `window.waitFor*`. Dua fitur (kategori, recurring) butuh **migrasi SQL** yang dijalankan user di Supabase SQL Editor (idempotent, sama seperti `supabase/schema.sql` yang sudah ada).

**Tech Stack:** Vanilla JS (classic + ESM), Supabase JS `@2.45.0` (pinned CDN), SheetJS (XLSX) via CDN pinned, Chart.js (sudah ada). Test: Node 18+ VM-harness (`tests/*.mjs`), pola sama dengan `tests/chart-skeleton.mjs`. Lint: ESLint strict.

---

## Temuan penting (baca dulu — mengubah scope)

1. **CSV export SUDAH ADA** di `js/history.js:236-241` + `history.html:47` (tombol `btn-export-csv` → `Storage.toCsv(items.filter(matchesFilter))`). Jadi saran #2 "Export CSV" **bukan fitur baru** — sudah jalan & sudah ikut filter.
   → **Scope #2 revisi:** (a) tambah **BOM `\uFEFF`** di CSV agar Excel tidak corrupt karakter non-ASCII (catatan, tanda `−`), (b) tambah tombol **Ekspor .xlsx** via SheetJS (ini yang bikin "Excel" beneran berguna), (c) nama file pakai brand `fintrack-` (sekarang `kas-harian-`).
2. **Tabel `categories` SUDAH ADA** di DB (global, `id text PK`, `type`), di-seed 9 baris. FK `transactions.category → categories(id)` (`NOT VALID`). → Custom kategori per-user butuh **tabel baru `user_categories`** + ganti FK jadi **trigger** (lihat Phase C).
3. **Helper agregat SUDAH ADA** di `js/storage.js`: `monthTotals`, `spendByCategory`, `flowSeries`, `lastMonths`. → Insight bulanan (Phase A) mostly pure-frontend, tidak perlu query baru.
4. **Rate limit** `tx_rate_limit` trigger: max 60 transaksi/jam/user. Generating beberapa recurring di satu kali buka = aman (jauh di bawah 60).
5. **Brand** sudah "Fintrack" (UI). Nama file ekspor & brand string mengikuti.
6. **Dua fitur butuh SQL manual** oleh user di Supabase SQL Editor (Phase C & D). Plan menyediakan file `.sql` idempotent. **Tanpa menjalankan SQL, fitur kategori/recurring tidak berfungsi** — ini step yang HARUS user lakukan (sama seperti deploy schema awal).

## Keputusan yang perlu dikonfirmasi (sebelum eksekusi)

- **Q1 (Recurrence generation):** pakai **client-side** (auto-insert saat app dibuka, tanpa server cron — tetap di free tier, tapi "catch-up" kalau dibuka akhir bulan) vs **Supabase Edge Function + scheduled** (tepat waktu, tapi perlu setup & kemungkinan keluar free tier). **Rekomendasi: client-side** (simpel, gratis, cukup untuk personal finance).
- **Q2 (UI recurring):** halaman baru `recurring.html` + link sidebar (konsisten dengan pattern input/history) vs section di `profile.html`. **Rekomendasi: halaman baru** (CRUD list lebih nyaman di halaman sendiri).
- **Q3 (Custom kategori, hapus kategori terpakai):** kalau kategori yang sudah dipakai di transaksi mau dihapus → **blokir** (saran) vs **rename transaksi ke "Lainnya"**. **Rekomendasi: blokir** (data tetap akurat, user pindahin manual kalau memang mau).
- **Q4 (Insight cards):** 3 kartu (Δ keluar vs bln lalU, kategori paling boros, proyeksi akhir bln). Oke?

> Kalau jawaban "gas", eksekusi pakai rekomendasi default (Q1 client-side, Q2 halaman baru, Q3 blokir, Q4 3 kartu).

---

## PHASE A — Insight Bulanan (fitur #7)  [paling dulu: tanpa DB, low risk]

**Objektif:** 3 kartu insight di atas dashboard: (1) "Keluar vs bulan lalu" dengan panah naik/turun + %, (2) "Kategori paling boros" (nama + Rp), (3) "Proyeksi akhir bulan" (run-rate).

**Files:**
- Modify: `js/storage.js` — tambah `prevMonthKey(ym)`, `monthComparison(items, ym)`, `spendByCategoryTop(items, ym)`, `projectMonthEnd(items, ym, today)`; expose di object `Storage` + export.
- Create: `js/insight.js` — modul render (classic, `waitFor*`), menghitung + mengisi DOM.
- Modify: `index.html` — section `insight-grid` (3 kartu + skeleton) di bawah `lk-grid-3` (ringkasan), sebelum chart.
- Modify: `index.html:134-145` — load `js/insight.js` setelah `dashboard.js`.
- Test: `tests/insight.mjs` — unit test fungsi math (inject `today`, tanpa `Date.now`).

**Step A1 — tulis failing test `tests/insight.mjs`** (pola VM-sandbox sama dengan `chart-skeleton.mjs`; stub `window`, `localStorage`, `crypto`, `supabase` module). Test deterministik:
```js
// seed items tetap, today = { ym:'2026-08', day:15 }
// monthComparison:
//   cur keluar=1_500_000, prev keluar=1_000_000 -> deltaKeluar = +50
//   prev = 0 -> delta = null (hindari div/0 & Infinity)
// projectMonthEnd:
//   kurun bln ini 15 hari, keluar=300_000 -> avg 20_000/hari
//   Agustus 31 hari -> proyeksi = 620_000
// spendByCategoryTop:
//   makan 500k, transport 200k -> top = { name:'Makan', amount:500000 }
```
Run: `node tests/insight.mjs` → Expected FAIL (fungsi belum ada).

**Step A2 — implementasi di `js/storage.js`** (pure, menerima `items` array + `ym`, `today` injectable):
```js
function prevMonthKey(ym){
  const [y,m] = String(ym).split("-").map(Number);
  const d = new Date(y, m-2, 1);
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0");
}
function monthComparison(items, ym){
  const cur  = monthTotals(items, ym);
  const prev = monthTotals(items, prevMonthKey(ym));
  const pct = (a,b) => (b === 0 ? null : Math.round(((a-b)/b)*1000)/10);
  return { cur, prev, deltaMasuk: pct(cur.masuk, prev.masuk), deltaKeluar: pct(cur.keluar, prev.keluar) };
}
function spendByCategoryTop(items, ym){
  const list = spendByCategory(items, ym);
  return list.length ? list[0] : null;
}
function projectMonthEnd(items, ym, today){
  // today = { ym:'YYYY-MM', day:int }  (injectable untuk test)
  const cur = monthTotals(items, ym);
  const day = today && today.day ? today.day : 0;
  const dim = new Date(Number(ym.slice(0,4)), Number(ym.slice(5))-1, 0).getDate();
  const avg = day > 0 ? cur.keluar / day : 0;
  return { projected: Math.round(avg*dim), basisDays: day, daysInMonth: dim, soFar: cur.keluar };
}
```
Expose: tambah ke object `Storage` (baris ~262-280) + daftar `export {...}` (baris ~284-288).
Run: `node tests/insight.mjs` → Expected PASS.

**Step A3 — UI `index.html`:** setelah `</section>` dari `lk-grid-3` (ringkasan), sebelum `<!-- Chart aliran -->`, sisipkan:
```html
<!-- Insight -->
<section class="lk-grid-3" aria-label="Insight bulan ini" id="insight-grid" hidden>
  <article class="lk-card p-4 min-w-0">
    <p class="text-xs uppercase tracking-wide text-[var(--lk-text-muted)] mb-1">Keluar vs bulan lalu</p>
    <p id="ins-delta" class="text-xl font-semibold truncate">&mdash;</p>
  </article>
  <article class="lk-card p-4 min-w-0">
    <p class="text-xs uppercase tracking-wide text-[var(--lk-text-muted)] mb-1">Kategori paling boros</p>
    <p id="ins-top" class="text-xl font-semibold truncate">&mdash;</p>
  </article>
  <article class="lk-card p-4 min-w-0">
    <p class="text-xs uppercase tracking-wide text-[var(--lk-text-muted)] mb-1">Proyeksi akhir bulan</p>
    <p id="ins-proj" class="text-xl font-semibold truncate">&mdash;</p>
  </article>
</section>
```
**Step A4 — `js/insight.js`** (classic IIFE, `await window.waitForStorage()`; panggil `renderInsight(items)` — hook ke `render()` dashboard via `window.LK.broadcast`/`on` ATAU panggil langsung dari `dashboard.js` `render()`; pilih: **panggil langsung** — tambah `if (window.Insight) window.Insight.render(items);` di `dashboard.js` `render()`). Isi: format `Rp`, panah `↑/↓` + warna (naik = merah untuk keluar, turun = hijau), `&mdash;` kalau data belum ada. Render via `textContent` (XSS-immune, konsisten dengan app).
**Step A5 — load + commit:** tambah `<script src="js/insight.js?v=1"></script>` setelah `dashboard.js`. `node --check js/insight.js`, `npm run smoke`, `node tests/insight.mjs`. Commit `feat(dashboard): insight bulanan (Δ vs bln lalu, top kategori, proyeksi)`.

**Verifikasi Phase A:** buka dasbor → 3 kartu terisi (bukan skeleton), angka cocok manual (Δ% & proyeksi), skeleton hilang seperti pola chart.

---

## PHASE B — Ekspor CSV/Excel (fitur #2, penyempurnaan)  [low risk, tanpa DB]

**Objektif:** CSV pakai BOM (Excel-safe) + tombol Ekspor .xlsx (SheetJS) + nama file ber-brand.

**Files:**
- Modify: `js/storage.js` — `toCsv` (sudah ada) + tambah `toCsvBom(items)` yang prepended `\uFEFF`; (opsional) helper buat rows XLSX.
- Create: `js/exports.js` — modul download (Blob + SheetJS), `csv(items)`, `xlsx(items)`, `json(items)`. Mengurangi bloat `history.js` (sudah 363 baris).
- Modify: `history.html:47-68` — tambah tombol `btn-export-xlsx` di dekat `btn-export-csv`.
- Modify: `js/history.js` — `bindExport()` (baris 235-254): pakai `Exports` (BOM + xlsx), nama file `fintrack-riwayat-YYYY-MM-DD.*`.
- Test: `tests/exports.mjs` — `toCsvBom` menghasilkan `\uFEFF` di depan + header + escaping quote (deterministik).

**Step B1 — failing test `tests/exports.mjs`:** items tetap → assert `toCsvBom(items).charCodeAt(0) === 0xFEFF`, header baris pertama `tanggal,jenis,...`, catatan dengan `"` di-escape jadi `""`, newline benar.
Run: `node tests/exports.mjs` → FAIL.

**Step B2 — `js/storage.js`:**
```js
function toCsvBom(items){ return "\uFEFF" + toCsv(items); }
```
Expose di `Storage` + export.
Run: PASS.

**Step B3 — `js/exports.js`** (module, import `Storage`):
```js
import Storage from "./storage.js";
function downloadBlob(blob, filename){
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
function baseName(){ return "fintrack-riwayat-" + Storage.todayISO(); }
function csv(items){ downloadBlob(new Blob([Storage.toCsvBom(items)], { type:"text/csv;charset=utf-8;" }), baseName()+".csv"); }
async function xlsx(items){
  const XLSX = await import("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js");
  const rows = items.map(t => ({
    tanggal: t.date,
    jenis: t.type === "in" ? "masuk" : "keluar",
    jumlah: t.amount,
    kategori: t.category,
    keterangan: t.note || "",
    waktu: t.ts
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Riwayat");
  XLSX.writeFile(wb, baseName()+".xlsx");
}
export const Exports = { csv, xlsx, downloadBlob, baseName };
window.Exports = Exports;
export default Exports;
```
**Step B4 — `history.html`:** di samping `btn-export-csv`, tambah:
```html
<button id="btn-export-xlsx" class="lk-btn-secondary text-sm flex items-center gap-1" style="flex:0 0 auto" title="Ekspor hasil filter ke Excel">
  <span class="material-symbols-outlined text-lg">table_chart</span><span class="hidden sm:inline">Excel</span>
</button>
```
**Step B5 — `history.js` `bindExport()`:** load `window.waitForExports()` (atau import), ganti `exportCsvBtn` handler → `Exports.csv(items.filter(matchesFilter))`; tambah `exportXlsxBtn` handler → `Exports.xlsx(items.filter(matchesFilter))`; JSON → `Exports.downloadBlob(...)` + nama `fintrack-backup-*.json`. (Pertahankan toast.)
**Step B6 — load + commit:** `history.html` load `js/exports.js` (module) sebelum `history.js`. `node --check`, `npm run smoke`, `node tests/exports.mjs`. Commit `feat(export): BOM untuk CSV + ekspor .xlsx (SheetJS) + nama file Fintrack`.

**Verifikasi Phase B:** di Riwayat, klik CSV → file terbuka di Excel tanpa karakter berantakan; klik Excel → `.xlsx` valid (buka di Excel/Google Sheets, kolom rapi); filter dulu → CSV/XLSX hanya isi hasil filter.

---

## PHASE C — Custom Kategori per-user (fitur #6)  [butuh SQL — medium risk]

**Objektif:** User bisa tambah/hapus kategori (selain 5 default), per akun. Nama kategori tetap `text` di `transactions.category` (tanpa id→name lookup di seluruh UI — CSV/backup/history tetap rapi).

**Arsitektur (Option D, direkomendasikan):**
- `categories` (sudah ada) = **default sistem** (9 baris, `user_id` null, dibaca semua).
- `user_categories` (BARU) = **custom per-user** (`id uuid`, `user_id`, `name`, `type`, `unique(user_id,name,type)`).
- `transactions.category` tetap **text** (menyimpan **nama** tampilan). **Ganti FK** `transactions_category_fk` → **trigger** `tx_category_valid()` yang validasi: nama ada di `categories` (sistem) **ATAU** di `user_categories` milik user. → Tidak ada perubahan lapisan display (tampil tetap nama), CSV/backup tetap pakai nama.

**Files:**
- Create: `supabase/migration-categories.sql` (idempotent — user run di Supabase SQL Editor).
- Modify: `js/storage.js` — `loadCategories()` (merge sistem+custom → `Storage.CATS`), `addCategory(name,type)`, `removeCategory(name,type)` (blokir kalau terpakai); longgarkan validasi `addTx` agar kategori custom lolos (sumber kebenaran = DB trigger).
- Create: `js/categories-ui.js` — panel CRUD (form tambah: nama+tipe; list custom + hapus; blokir hapus kategori terpakai).
- Modify: `profile.html` — section "Kategori" (di bawah "Budget Bulanan").
- Modify: `js/input.js:38` — dropdown dari `Storage.CATS` yang sudah di-populate `loadCategories()` (panggil saat init input.js).
- Test: `tests/categories.mjs` — validasi `addCategory` (duplikat, panjang, nama spesial `__proto__`), `removeCategory` blokir kalau terpakai (mock supabase).

**Step C1 — `supabase/migration-categories.sql`:**
```sql
-- idempotent; run di Supabase SQL Editor
create table if not exists public.user_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 50),
  type text not null check (type in ('in','out')),
  created_at timestamptz not null default now(),
  unique (user_id, name, type)
);
alter table public.user_categories enable row level security;
drop policy if exists "uc_all_own" on public.user_categories;
create policy "uc_all_own" on public.user_categories for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Ganti FK kategori -> trigger (validasi: sistem ATAU custom user)
alter table public.transactions drop constraint if exists transactions_category_fk;
create or replace function public.tx_category_valid()
returns trigger language plpgsql as $$
begin
  if not exists (select 1 from public.categories c where c.id = new.category)
     and not exists (select 1 from public.user_categories u
                     where u.user_id = new.user_id and u.name = new.category) then
    raise exception 'category not found' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
drop trigger if exists tx_category_valid_trigger on public.transactions;
create trigger tx_category_valid_trigger
  before insert on public.transactions for each row execute function public.tx_category_valid();
```
> **Catatan:** `categories` (sistem) tidak perlu di-touch. Trigger memakai `new.user_id` — pastikan `transactions` punya `user_id` (sudah ada).

**Step C2 — failing test `tests/categories.mjs`:** mock `supabase.from(...).select/insert/delete`. Assert: `addCategory("Sewa","out")` → insert ke `user_categories`; duplikat → tolak; nama `__proto__`/`constructor` → tolak (pakai `isSafeCat`-style); `removeCategory` saat kategori terpakai di `items` → **blokir** (tidak delete).
Run: FAIL.

**Step C3 — `js/storage.js`:**
```js
let _catsLoaded = false;
async function loadCategories(){
  const [sys, usr] = await Promise.all([
    supabase.from("categories").select("id,type"),
    supabase.from("user_categories").select("name,type")
  ]);
  const inSet = new Set(), outSet = new Set();
  (sys.data||[]).forEach(c => (c.type==="in"?inSet:outSet).add(c.id));
  (usr.data||[]).forEach(c => (c.type==="in"?inSet:outSet).add(c.name));
  const base = { in: CATS.in.slice(), out: CATS.out.slice() };
  base.in  = Array.from(new Set([...base.in,  ...inSet]));
  base.out = Array.from(new Set([...base.out, ...outSet]));
  CATS.in = base.in; CATS.out = base.out;
  _catsLoaded = true;
  return { in: CATS.in.slice(), out: CATS.out.slice() };
}
async function addCategory(name, type){
  const n = String(name||"").trim();
  if(!isSafeCatName(n)) throw new Error("Nama kategori tidak valid.");
  if(!["in","out"].includes(type)) throw new Error("Tipe tidak valid.");
  const { data:{ user } } = await supabase.auth.getUser();
  if(!user) throw new Error("Belum login.");
  const { error } = await supabase.from("user_categories").insert({ user_id:user.id, name:n, type });
  if(error) throw new Error(error.message.includes("duplicate") ? "Kategori sudah ada." : error.message);
  _catsLoaded = false;
  return n;
}
async function removeCategory(name, type){
  if(CATS_IN_USE.has(name)) throw new Error("Kategori masih dipakai di transaksi. Pindahkan dulu.");
  const { data:{ user } } = await supabase.auth.getUser();
  if(!user) throw new Error("Belum login.");
  const { error } = await supabase.from("user_categories").delete().eq("name", name).eq("type", type);
  if(error) throw new Error(error.message);
  _catsLoaded = false;
  return true;
}
```
(`isSafeCatName` = reuse logika `budget.js`: 1-50 char, tolak `__proto__`/`constructor`/`prototype`/`__*`. `CATS_IN_USE` = Set nama yang ada di `items` — isi dari `loadAll`/`render`.)
- **Longgarkan `addTx` (baris 106):** ganti `if (!ALL_CATS.has(category))` → hanya validasi `isSafeCatName(category)` (sumber kebenaran = DB trigger). (Biarkan trigger menolak kategori yang tidak ada.)
Expose `loadCategories, addCategory, removeCategory` di `Storage` + export.
Run: PASS.

**Step C4 — `js/categories-ui.js` + `profile.html`:** section "Kategori" (kartu): form (input nama + select in/out + tombol Tambah), list kategori custom (hanya yang user, tandai default terpisah) + tombol hapus per baris. Handler pakai `Storage.addCategory/removeCategory` + `Storage.loadCategories()` ulang + toast. Render via `textContent`/`createElement` (XSS-immune).
**Step C5 — `js/input.js:38`:** di awal init (setelah `waitForStorage`), panggil `await Storage.loadCategories()` sebelum build dropdown, supaya dropdown memuat custom.
**Step C6 — load + commit:** `profile.html` load `js/categories-ui.js` (module) + `loadCategories`. `node --check` semua, `npm run smoke`, `node tests/categories.mjs`. Commit `feat(categories): kategori custom per-user (user_categories + trigger validasi)`.

**⚠️ Step C7 — user ACTION (wajib):** jalankan `supabase/migration-categories.sql` di Supabase SQL Editor. Tanpa ini, `user_categories` tidak ada → fitur error. Setelah itu baru deploy/test.

**Verifikasi Phase C:** Profile → tambah kategori "Sewa" (out) → muncul di dropdown input → simpan transaksi "Sewa" sukses. Hapus kategori "Sewa" yang terpakai → diblokir. Hapus yang kosong → hilang. Custom tidak bocor ke user lain (RLS). Test lintas-device (realtime) kategori muncul.

---

## PHASE D — Transaksi Berulang / Recurring (fitur #8)  [butuh SQL — medium-high risk]

**Objektif:** Aturan berulang (nama, tipe, jumlah, kategori, tanggal 1-28, catatan) → auto-insert tiap bulan saat app dibuka (client-side, idempotent, tanpa cron).

**Files:**
- Create: `supabase/migration-recurring.sql` (idempotent).
- Create: `js/recurring.js` — `loadRules()`, `createRule()`, `toggleRule()`, `deleteRule()`, **`maybeGenerate({items,today})`** (logika core, testable).
- Create: `recurring.html` — halaman CRUD (form + list + toggle).
- Modify: `index.html` / sidebar (`js/sidebar.js`) — link "Berulang" (ikon `repeat`).
- Modify: `js/dashboard.js` / `index.html` — panggil `Recurring.maybeGenerate(...)` saat app load (setelah data load) + toast "N transaksi berulang ditambahkan".
- Test: `tests/recurring.mjs` — `maybeGenerate` (due + idempotency + belum-due + active=false; mock supabase, inject `today`).

**Step D1 — `supabase/migration-recurring.sql`:**
```sql
create table if not exists public.recurring (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 100),
  type text not null check (type in ('in','out')),
  amount integer not null check (amount > 0 and amount <= 1000000000),
  category text not null check (length(category) between 1 and 50),
  note text not null default '' check (length(note) <= 500),
  day integer not null check (day between 1 and 28),
  active boolean not null default true,
  last_generated_month text null,
  created_at timestamptz not null default now()
);
create index if not exists idx_recurring_user on public.recurring (user_id, active);
alter table public.recurring enable row level security;
drop policy if exists "rec_all_own" on public.recurring;
create policy "rec_all_own" on public.recurring for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
```
> `recurring.category` tidak perlu constraint FK (divalidasi saat generate → insert ke `transactions` → trigger `tx_category_valid`). `day 1-28` menghindari masalah panjang bulan.

**Step D2 — failing test `tests/recurring.mjs`** (mock supabase `.from("recurring").select/update`, `Storage.addTx`; `today` injectable):
```js
// rule { day:5, active:true, last_generated_month:null }, today day=15, ym='2026-08'
//   -> DUE & belum generated -> 1x addTx + update last_generated_month='2026-08'
// rule terakhir_generated='2026-08' -> TIDAK di-generate lagi (idempotent)
// rule day=20, today day=15 -> belum due -> TIDAK
// rule active:false -> TIDAK
// assert jumlah addTx dipanggil & payload (date='2026-08-05', category, amount, note=name)
```
Run: FAIL.

**Step D3 — `js/recurring.js`:**
```js
import { supabase } from "./supabase.js";
import Storage from "./storage.js";
function monthKeyOf(d){ return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0"); }
async function loadRules(){ const {data,error}=await supabase.from("recurring").select("*").order("day"); if(error) throw new Error(error.message); return data||[]; }
async function createRule({name,type,amount,category,note,day}){
  const { data:{ user } } = await supabase.auth.getUser(); if(!user) throw new Error("Belum login.");
  const { data, error } = await supabase.from("recurring").insert({ user_id:user.id, name,type,amount,category,note:note||"", day, active:true }).select().single();
  if(error) throw new Error(error.message);
  return data;
}
async function toggleRule(id, active){ await supabase.from("recurring").update({ active }).eq("id", id); }
async function deleteRule(id){ await supabase.from("recurring").delete().eq("id", id); }
async function markGenerated(id, ym){ await supabase.from("recurring").update({ last_generated_month: ym }).eq("id", id); }

async function maybeGenerate({ items, today = new Date() } = {}){
  const ym  = monthKeyOf(today);
  const day = today.getDate();
  const rules = await loadRules();
  const created = [];
  for (const r of rules){
    if (!r.active) continue;
    if (r.last_generated_month === ym) continue;   // idempotent per-bulan
    if (day < r.day) continue;                      // belum jatuh tempo bln ini
    const date = ym + "-" + String(r.day).padStart(2,"0");
    await Storage.addTx({ date, type:r.type, amount:r.amount, category:r.category, note:r.name });
    await markGenerated(r.id, ym);
    created.push(r);
  }
  return created;
}
export const Recurring = { loadRules, createRule, toggleRule, deleteRule, maybeGenerate };
window.Recurring = Recurring;
export default Recurring;
```
Run: PASS.

**Step D4 — `recurring.html` + `js/recurring.js` UI:** halaman (layout mirip input.html): form (nama, tipe, jumlah, kategori [dari `Storage.loadCategories`], tanggal 1-28, catatan) + list aturan (toggle aktif, hapus, tampilkan "terakhir dibuat bln X"). CRUD handler + toast. Load `recurring.html` via sidebar link.
**Step D5 — sidebar:** di `js/sidebar.js` (list link) + `index.html` (sidebar desktop/mobile) tambah item "Berulang" → `recurring.html`, ikon `repeat`.
**Step D6 — auto-generate saat load:** di `js/dashboard.js` `render()` (atau after initial load di `index`), setelah `items` siap: `Recurring.maybeGenerate({ items, today:new Date() }).then(c => { if(c.length){ toast(c.length+" transaksi berulang ditambahkan"); refreshFromBroadcast(); } }).catch(console.warn)`. **Idempotent** — aman dipanggil tiap buka (guard `last_generated_month`).
**Step D7 — load + commit:** `recurring.html` load `js/recurring.js`. `node --check`, `npm run smoke`, `node tests/recurring.mjs`. Commit `feat(recurring): transaksi berulang + auto-insert idempotent saat app dibuka`.

**⚠️ Step D8 — user ACTION (wajib):** jalankan `supabase/migration-recurring.sql` di Supabase SQL Editor.

**Verifikasi Phase D:** buat aturan "Internet 100.000 out, tanggal 1". Buka app di tanggal ≥1 → 1 transaksi "Internet" muncul (note="Internet"), toast muncul. Buka ulang bulan sama → TIDAK duplikat (idempotent). Toggle off → tidak lagi di-generate. Test edge: tanggal 28, dua aturan, catch-up akhir bulan.

---

## Cross-cutting

**Urutan eksekusi & ship:**
1. **Phase A** (insight) → ship.
2. **Phase B** (export) → ship.
3. **Phase C** (kategori) → user run SQL → ship.
4. **Phase D** (recurring) → user run SQL → ship.
> A & B tanpa SQL (cepat). C & D butuh user run SQL di Supabase sebelum berfungsi.

**Test & lint (setiap phase):** `node tests/<phase>.mjs`, `npm run smoke` (12/12), `npm run lint`, `npm run lint:strict`, `node --check` semua file JS baru/ubah. Target: tetap 0 error, smoke 12/12.

**Verifikasi eksternal (setelah push + user run SQL):** push `master` → auto-deploy Vercel (~2 detik, sudah terbukti). Buka `https://kas-harian-swart.vercel.app` → hard refresh → verifikasi fitur live.

**Commit convention:** `feat(<scope>): ...` per phase (1 commit/phase, atau 2 kalau UI terpisah). Setelah semua: Codacy re-analyze (target tetap A/100, 0 issues).

## Risiko & tradeoff
- **Recurring auto-insert = penulisan data otomatis** → wajib idempotent (`last_generated_month`) & test edge case; rate-limit 60/jam aman untuk volume kecil. Tradeoff client-side: kalau user tidak buka app di awal bulan, insert "catch-up" saat buka (bukan tepat di tanggal). Sudah dijelaskan ke user.
- **Drop FK → trigger (Phase C)** mengubah jaminan DB dari constraint jadi logika PL/pgSQL. Mitigasi: trigger `NOT VALID`-style tidak; trigger sebelum-insert (menolak saat write), test + verifikasi manual. Data lama tetap valid (trigger hanya ke row baru).
- **SheetJS via CDN** menambah dependency; pinned `@0.18.5`. Kalau CDN down, tombol Excel gagal (CSV tetap jalan). Mitigasi: toast error.
- **Kategori "Lainnya"** ada di kedua tipe (in & out) → custom per-tipe (`unique(user_id,name,type)`) sudah akomodasi.
- **Brand:** nama file ekspor → `fintrack-*` (konsisten dengan UI).
- **Tanpa SQL, Phase C/D gagal** — plan menegaskan step user ACTION agar tidak setengah jalan.

## Keputusan (SUDAH DITEKAN user, 2026-08-31)

Semua 4 keputusan dikonfirmasi user — eksekusi pakai:

- **Q1 (Resolusi recurring):** **Client-side** — auto-insert saat app dibuka, idempotent via `last_generated_month`, tanpa cron/server. Tetap di free tier.
- **Q2 (UI recurring):** **Halaman baru** `recurring.html` + link sidebar "Berulang" (ikon `repeat`).
- **Q3 (Hapus kategori terpakai):** **Blokir** — tidak bisa hapus selama masih dipakai transaksi; user memindahkan manual dulu.
- **Q4 (Kartu insight):** **3 kartu** — (1) Δ keluar vs bulan lalu, (2) kategori paling boros, (3) proyeksi akhir bulan (run-rate).
