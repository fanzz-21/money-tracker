-- supabase/migration-recurring.sql
-- Phase D — Transaksi berulang / recurring (fitur #8)
-- Idempotent — aman di-run ulang. Jalankan di Supabase SQL Editor
-- (https://supabase.com/dashboard/project/<project>/sql/new).
--
-- Pola: aturan berulang (nama, tipe, jumlah, kategori, tanggal 1-28,
-- catatan) disimpan di tabel `recurring`. Auto-insert ke `transactions`
-- dilakukan CLIENT-SIDE saat app dibuka (idempotent via kolom
-- `last_generated_month`, tanpa cron/server).
--
-- Catatan:
--   - RLS: user hanya bisa baca/tulis aturannya sendiri.
--   - `day` dibatasi 1-28 untuk menghindari masalah panjang bulan.
--   - `recurring.category` TIDAK pakai FK — kategori divalidasi saat
--     generate (insert ke `transactions` → trigger `tx_category_valid`).
--   - Insert otomatis tetap kena rate limit `tx_rate_limit` (60/jam/user);
--     volume recurring kecil sehingga aman.

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
