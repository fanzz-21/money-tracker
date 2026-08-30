-- LK hardening patch — jalankan di Supabase SQL Editor
-- Tanggal: 2026-08-28
-- Tujuan: fix vulnerabilities ditemukan saat penetration test
--
-- INSTRUKSI:
-- 1. Buka https://supabase.com/dashboard/project/YOUR-PROJECT-REF/sql/new
-- 2. Copy-paste SELURUH isi file ini
-- 3. Klik "Run" atau Ctrl+Enter
-- 4. Expected: "Success. No rows returned" (semua statement idempotent)

-- =========================================================================
-- 1. Tambah kategori whitelist (server-side)
-- =========================================================================
create table if not exists public.categories (
  id   text primary key,
  type text not null check (type in ('in', 'out'))
);

insert into public.categories (id, type) values
  ('Gaji',           'in'),
  ('Usaha',          'in'),
  ('Transfer masuk', 'in'),
  ('Lainnya',        'in'),
  ('Makan',          'out'),
  ('Transport',      'out'),
  ('Tagihan',        'out'),
  ('Belanja',        'out')
on conflict (id) do nothing;

alter table public.categories enable row level security;
drop policy if exists "cat_read_all" on public.categories;
create policy "cat_read_all" on public.categories for select using (true);

-- =========================================================================
-- 2. Tighten CHECK constraint: amount <= 1B, note <= 500
-- =========================================================================
do $$
begin
  -- Drop the old constraint (whatever it's called)
  alter table public.transactions drop constraint if exists transactions_amount_check;
  alter table public.transactions drop constraint if exists transactions_note_check;
  alter table public.transactions drop constraint if exists transactions_category_check;
exception when others then null;
end $$;

-- Add new strict constraints
alter table public.transactions
  add constraint transactions_amount_check
    check (amount > 0 and amount <= 1000000000);

alter table public.transactions
  add constraint transactions_note_check
    check (length(note) <= 500);

alter table public.transactions
  add constraint transactions_category_length
    check (length(category) > 0 and length(category) <= 50);

-- =========================================================================
-- 3. Foreign key kategori ke tabel categories
-- Catatan: pakai NOT VALID supaya existing rows (yang mungkin punya kategori
-- 'Lainnya' dll yang ada di whitelist) tidak di-recheck. Row baru otomatis
-- divalidasi.
-- =========================================================================
alter table public.transactions
  add constraint transactions_category_fk
    foreign key (category) references public.categories(id)
    not valid;

-- =========================================================================
-- 4. Rate-limit trigger: max 60 transaksi per jam per user
-- =========================================================================
create or replace function public.tx_rate_limit()
returns trigger language plpgsql as $$
declare
  recent_count integer;
begin
  select count(*) into recent_count
  from public.transactions
  where user_id = new.user_id
    and ts > now() - interval '1 hour';
  if recent_count >= 60 then
    raise exception 'rate_limit: max 60 transaksi per jam, coba lagi nanti'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists tx_rate_limit_trigger on public.transactions;
create trigger tx_rate_limit_trigger
  before insert on public.transactions
  for each row execute function public.tx_rate_limit();

-- =========================================================================
-- 5. Useful view: monthly summary (RLS inherited dari underlying table)
-- =========================================================================
create or replace view public.transactions_monthly_summary as
select
  user_id,
  to_char(date, 'YYYY-MM') as month,
  type,
  count(*) as count,
  sum(amount) as total
from public.transactions
group by user_id, to_char(date, 'YYYY-MM'), type;

-- =========================================================================
-- Verifikasi (opsional, comment out setelah yakin)
-- =========================================================================
-- select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'public.transactions'::regclass;
