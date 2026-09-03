-- supabase/migration-savings.sql
-- Fitur Tabungan / Savings Goals (Phase E)
-- Idempotent — aman di-run ulang. Jalankan di Supabase SQL Editor.
--
-- Model: user bisa buat banyak target tabungan (nama, target amount,
-- deadline opsional, catatan). Progress dihitung client-side dari
-- transaksi yang di-tag ke goal ini (via kolom savings_goal_id di
-- transactions, atau manual tracking).
--
-- Untuk simplicity awal: progress disimpan sebagai kolom `saved_amount`
-- yang di-update client-side saat user "menabung" (insert transaksi
-- dengan tag goal). Ini menghindari trigger kompleks dan tetap
-- idempotent.

create table if not exists public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 100),
  target_amount integer not null check (target_amount > 0 and target_amount <= 1000000000),
  saved_amount integer not null default 0 check (saved_amount >= 0),
  deadline date null,
  note text not null default '' check (length(note) <= 500),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_savings_goals_user on public.savings_goals (user_id, active);

alter table public.savings_goals enable row level security;

drop policy if exists "savings_all_own" on public.savings_goals;
create policy "savings_all_own" on public.savings_goals for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

</content>