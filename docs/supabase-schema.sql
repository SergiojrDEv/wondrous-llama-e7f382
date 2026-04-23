-- Finance Flow schema/migration for Supabase.
-- Safe to run in the SQL Editor on a project that already has the old transactions table.

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  date text,
  descricao text,
  cat text,
  subcat text,
  type text,
  val numeric,
  year int,
  month int,
  account text default 'Conta corrente',
  status text default 'paid',
  due_date text,
  payment_method text default 'pix',
  credit_card_id text,
  recurrence_id uuid,
  installment_group uuid,
  installment_number int,
  installment_total int,
  created_at timestamptz default now()
);

alter table public.transactions
  add column if not exists subcat text;

alter table public.transactions
  add column if not exists account text default 'Conta corrente';

alter table public.transactions
  add column if not exists created_at timestamptz default now();

alter table public.transactions
  add column if not exists status text default 'paid';

alter table public.transactions
  add column if not exists due_date text;

alter table public.transactions
  add column if not exists payment_method text default 'pix';

alter table public.transactions
  add column if not exists credit_card_id text;

alter table public.transactions
  add column if not exists recurrence_id uuid;

alter table public.transactions
  add column if not exists installment_group uuid;

alter table public.transactions
  add column if not exists installment_number int;

alter table public.transactions
  add column if not exists installment_total int;

alter table public.transactions enable row level security;

drop policy if exists "own data" on public.transactions;
drop policy if exists "Users can read own transactions" on public.transactions;
drop policy if exists "Users can insert own transactions" on public.transactions;
drop policy if exists "Users can update own transactions" on public.transactions;
drop policy if exists "Users can delete own transactions" on public.transactions;

create policy "Users can read own transactions"
on public.transactions
for select
using (auth.uid() = user_id);

create policy "Users can insert own transactions"
on public.transactions
for insert
with check (auth.uid() = user_id);

create policy "Users can update own transactions"
on public.transactions
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own transactions"
on public.transactions
for delete
using (auth.uid() = user_id);

create index if not exists transactions_user_date_idx
on public.transactions (user_id, date);

create index if not exists transactions_user_created_idx
on public.transactions (user_id, created_at);

create table if not exists public.finance_settings (
  user_id uuid primary key references auth.users on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.finance_settings enable row level security;

drop policy if exists "Users can read own settings" on public.finance_settings;
drop policy if exists "Users can insert own settings" on public.finance_settings;
drop policy if exists "Users can update own settings" on public.finance_settings;
drop policy if exists "Users can delete own settings" on public.finance_settings;

create policy "Users can read own settings"
on public.finance_settings
for select
using (auth.uid() = user_id);

create policy "Users can insert own settings"
on public.finance_settings
for insert
with check (auth.uid() = user_id);

create policy "Users can update own settings"
on public.finance_settings
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own settings"
on public.finance_settings
for delete
using (auth.uid() = user_id);

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users on delete cascade,
  full_name text not null default '',
  cpf text not null default '',
  phone text not null default '',
  birthdate date,
  updated_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

drop policy if exists "Users can read own profile" on public.user_profiles;
drop policy if exists "Users can insert own profile" on public.user_profiles;
drop policy if exists "Users can update own profile" on public.user_profiles;
drop policy if exists "Users can delete own profile" on public.user_profiles;

create policy "Users can read own profile"
on public.user_profiles
for select
using (auth.uid() = user_id);

create policy "Users can insert own profile"
on public.user_profiles
for insert
with check (auth.uid() = user_id);

create policy "Users can update own profile"
on public.user_profiles
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own profile"
on public.user_profiles
for delete
using (auth.uid() = user_id);
