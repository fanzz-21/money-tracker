-- supabase/migration-categories.sql
-- Phase C — Custom kategori per-user (fitur #6)
-- Idempotent — aman di-run ulang. Jalankan di Supabase SQL Editor
-- (https://supabase.com/dashboard/project/<project>/sql/new).
--
-- Efek:
--   1. Tabel baru public.user_categories (kategori custom per akun, RLS:
--      user hanya bisa baca/tulis miliknya sendiri).
--   2. Constraint FK lama transactions_category_fk DITIADAKAN dan diganti
--      trigger BEFORE INSERT tx_category_valid: kategori sah jika nama ada
--      di categories (sistem) ATAU di user_categories milik user tersebut.

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
