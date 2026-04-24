-- Finance Flow V2 relational schema for Supabase/Postgres.
-- This is the target architecture schema for the next evolution step.
-- It does not replace docs/supabase-schema.sql yet; use it as the next migration base.

create extension if not exists pgcrypto;

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users on delete cascade,
  full_name text not null default '',
  cpf text not null default '',
  phone text not null default '',
  birthdate date,
  preferred_currency text not null default 'BRL',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint user_profiles_currency_check check (preferred_currency in ('BRL', 'USD', 'EUR'))
);

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  kind text not null default 'cash',
  color text not null default '#0b7285',
  institution text,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accounts_kind_check check (kind in ('cash', 'checking', 'savings', 'investment', 'credit_card', 'wallet')),
  constraint accounts_color_check check (color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint accounts_name_not_blank check (length(trim(name)) > 0),
  constraint accounts_user_name_unique unique (user_id, name)
);

create table if not exists public.credit_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  account_id uuid references public.accounts on delete set null,
  name text not null,
  brand text,
  color text not null default '#635bff',
  closing_day int not null default 25,
  due_day int not null default 10,
  credit_limit numeric(14,2),
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint credit_cards_name_not_blank check (length(trim(name)) > 0),
  constraint credit_cards_color_check check (color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint credit_cards_closing_day_check check (closing_day between 1 and 31),
  constraint credit_cards_due_day_check check (due_day between 1 and 31),
  constraint credit_cards_limit_check check (credit_limit is null or credit_limit >= 0)
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  kind text not null,
  name text not null,
  slug text not null,
  color text not null default '#667085',
  monthly_limit numeric(14,2),
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_kind_check check (kind in ('expense', 'income', 'investment')),
  constraint categories_color_check check (color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint categories_name_not_blank check (length(trim(name)) > 0),
  constraint categories_limit_check check (monthly_limit is null or monthly_limit >= 0),
  constraint categories_user_slug_unique unique (user_id, kind, slug)
);

create table if not exists public.category_tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  category_id uuid not null references public.categories on delete cascade,
  name text not null,
  slug text not null,
  color text not null default '#667085',
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint category_tags_name_not_blank check (length(trim(name)) > 0),
  constraint category_tags_color_check check (color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint category_tags_user_slug_unique unique (user_id, category_id, slug)
);

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  category_id uuid not null references public.categories on delete cascade,
  period_kind text not null,
  amount numeric(14,2) not null,
  starts_on date not null default current_date,
  ends_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint budgets_period_kind_check check (period_kind in ('weekly', 'monthly')),
  constraint budgets_amount_check check (amount >= 0)
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  target_amount numeric(14,2) not null,
  current_amount numeric(14,2) not null default 0,
  target_date date,
  linked_category_id uuid references public.categories on delete set null,
  color text not null default '#635bff',
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint goals_name_not_blank check (length(trim(name)) > 0),
  constraint goals_target_amount_check check (target_amount > 0),
  constraint goals_current_amount_check check (current_amount >= 0),
  constraint goals_color_check check (color ~ '^#[0-9A-Fa-f]{6}$')
);

create table if not exists public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  title text not null,
  transaction_kind text not null,
  amount numeric(14,2) not null,
  category_id uuid references public.categories on delete set null,
  category_tag_id uuid references public.category_tags on delete set null,
  account_id uuid references public.accounts on delete set null,
  credit_card_id uuid references public.credit_cards on delete set null,
  payment_method text not null default 'pix',
  cadence text not null,
  interval_count int not null default 1,
  starts_on date not null,
  ends_on date,
  next_run_on date,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurring_rules_title_not_blank check (length(trim(title)) > 0),
  constraint recurring_rules_amount_check check (amount > 0),
  constraint recurring_rules_kind_check check (transaction_kind in ('expense', 'income', 'investment')),
  constraint recurring_rules_payment_method_check check (payment_method in ('pix', 'debit', 'credit', 'cash', 'transfer')),
  constraint recurring_rules_cadence_check check (cadence in ('daily', 'weekly', 'monthly', 'yearly')),
  constraint recurring_rules_interval_count_check check (interval_count > 0),
  constraint recurring_rules_status_check check (status in ('active', 'paused', 'ended'))
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  transaction_kind text not null,
  status text not null default 'paid',
  description text not null,
  notes text,
  amount numeric(14,2) not null,
  transaction_date date not null,
  due_date date,
  paid_at timestamptz,
  category_id uuid references public.categories on delete set null,
  category_tag_id uuid references public.category_tags on delete set null,
  account_id uuid references public.accounts on delete set null,
  credit_card_id uuid references public.credit_cards on delete set null,
  payment_method text not null default 'pix',
  recurring_rule_id uuid references public.recurring_rules on delete set null,
  installment_group_id uuid,
  installment_number int,
  installment_total int,
  external_ref text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_kind_check check (transaction_kind in ('expense', 'income', 'investment')),
  constraint transactions_status_check check (status in ('paid', 'pending', 'planned', 'cancelled')),
  constraint transactions_amount_check check (amount > 0),
  constraint transactions_payment_method_check check (payment_method in ('pix', 'debit', 'credit', 'cash', 'transfer')),
  constraint transactions_installment_number_check check (installment_number is null or installment_number > 0),
  constraint transactions_installment_total_check check (installment_total is null or installment_total > 0),
  constraint transactions_installment_pair_check check (
    (installment_number is null and installment_total is null)
    or (installment_number is not null and installment_total is not null and installment_number <= installment_total)
  )
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  actor_type text not null default 'user',
  actor_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now(),
  constraint audit_logs_action_check check (action in ('create', 'update', 'delete', 'sync', 'import'))
);

create table if not exists public.finance_settings (
  user_id uuid primary key references auth.users on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists accounts_user_kind_idx on public.accounts (user_id, kind) where is_archived = false;
create index if not exists credit_cards_user_idx on public.credit_cards (user_id) where is_archived = false;
create index if not exists categories_user_kind_idx on public.categories (user_id, kind) where is_archived = false;
create index if not exists category_tags_category_idx on public.category_tags (category_id) where is_archived = false;
create index if not exists budgets_user_period_idx on public.budgets (user_id, period_kind, starts_on desc);
create index if not exists goals_user_idx on public.goals (user_id) where is_archived = false;
create index if not exists recurring_rules_user_status_idx on public.recurring_rules (user_id, status, next_run_on);
create index if not exists transactions_user_date_idx on public.transactions (user_id, transaction_date desc);
create index if not exists transactions_user_status_idx on public.transactions (user_id, status);
create index if not exists transactions_user_card_idx on public.transactions (user_id, credit_card_id, due_date);
create index if not exists transactions_installment_group_idx on public.transactions (user_id, installment_group_id);
create index if not exists audit_logs_user_entity_idx on public.audit_logs (user_id, entity_type, created_at desc);

alter table public.user_profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.credit_cards enable row level security;
alter table public.categories enable row level security;
alter table public.category_tags enable row level security;
alter table public.budgets enable row level security;
alter table public.goals enable row level security;
alter table public.recurring_rules enable row level security;
alter table public.transactions enable row level security;
alter table public.audit_logs enable row level security;
alter table public.finance_settings enable row level security;

drop policy if exists "Users can read own profile" on public.user_profiles;
drop policy if exists "Users can insert own profile" on public.user_profiles;
drop policy if exists "Users can update own profile" on public.user_profiles;
drop policy if exists "Users can delete own profile" on public.user_profiles;
create policy "Users can read own profile" on public.user_profiles for select using (auth.uid() = user_id);
create policy "Users can insert own profile" on public.user_profiles for insert with check (auth.uid() = user_id);
create policy "Users can update own profile" on public.user_profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own profile" on public.user_profiles for delete using (auth.uid() = user_id);

drop policy if exists "Users can read own accounts" on public.accounts;
drop policy if exists "Users can insert own accounts" on public.accounts;
drop policy if exists "Users can update own accounts" on public.accounts;
drop policy if exists "Users can delete own accounts" on public.accounts;
create policy "Users can read own accounts" on public.accounts for select using (auth.uid() = user_id);
create policy "Users can insert own accounts" on public.accounts for insert with check (auth.uid() = user_id);
create policy "Users can update own accounts" on public.accounts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own accounts" on public.accounts for delete using (auth.uid() = user_id);

drop policy if exists "Users can read own credit cards" on public.credit_cards;
drop policy if exists "Users can insert own credit cards" on public.credit_cards;
drop policy if exists "Users can update own credit cards" on public.credit_cards;
drop policy if exists "Users can delete own credit cards" on public.credit_cards;
create policy "Users can read own credit cards" on public.credit_cards for select using (auth.uid() = user_id);
create policy "Users can insert own credit cards" on public.credit_cards for insert with check (auth.uid() = user_id);
create policy "Users can update own credit cards" on public.credit_cards for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own credit cards" on public.credit_cards for delete using (auth.uid() = user_id);

drop policy if exists "Users can read own categories" on public.categories;
drop policy if exists "Users can insert own categories" on public.categories;
drop policy if exists "Users can update own categories" on public.categories;
drop policy if exists "Users can delete own categories" on public.categories;
create policy "Users can read own categories" on public.categories for select using (auth.uid() = user_id);
create policy "Users can insert own categories" on public.categories for insert with check (auth.uid() = user_id);
create policy "Users can update own categories" on public.categories for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own categories" on public.categories for delete using (auth.uid() = user_id);

drop policy if exists "Users can read own category tags" on public.category_tags;
drop policy if exists "Users can insert own category tags" on public.category_tags;
drop policy if exists "Users can update own category tags" on public.category_tags;
drop policy if exists "Users can delete own category tags" on public.category_tags;
create policy "Users can read own category tags" on public.category_tags for select using (auth.uid() = user_id);
create policy "Users can insert own category tags" on public.category_tags for insert with check (auth.uid() = user_id);
create policy "Users can update own category tags" on public.category_tags for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own category tags" on public.category_tags for delete using (auth.uid() = user_id);

drop policy if exists "Users can read own budgets" on public.budgets;
drop policy if exists "Users can insert own budgets" on public.budgets;
drop policy if exists "Users can update own budgets" on public.budgets;
drop policy if exists "Users can delete own budgets" on public.budgets;
create policy "Users can read own budgets" on public.budgets for select using (auth.uid() = user_id);
create policy "Users can insert own budgets" on public.budgets for insert with check (auth.uid() = user_id);
create policy "Users can update own budgets" on public.budgets for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own budgets" on public.budgets for delete using (auth.uid() = user_id);

drop policy if exists "Users can read own goals" on public.goals;
drop policy if exists "Users can insert own goals" on public.goals;
drop policy if exists "Users can update own goals" on public.goals;
drop policy if exists "Users can delete own goals" on public.goals;
create policy "Users can read own goals" on public.goals for select using (auth.uid() = user_id);
create policy "Users can insert own goals" on public.goals for insert with check (auth.uid() = user_id);
create policy "Users can update own goals" on public.goals for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own goals" on public.goals for delete using (auth.uid() = user_id);

drop policy if exists "Users can read own recurring rules" on public.recurring_rules;
drop policy if exists "Users can insert own recurring rules" on public.recurring_rules;
drop policy if exists "Users can update own recurring rules" on public.recurring_rules;
drop policy if exists "Users can delete own recurring rules" on public.recurring_rules;
create policy "Users can read own recurring rules" on public.recurring_rules for select using (auth.uid() = user_id);
create policy "Users can insert own recurring rules" on public.recurring_rules for insert with check (auth.uid() = user_id);
create policy "Users can update own recurring rules" on public.recurring_rules for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own recurring rules" on public.recurring_rules for delete using (auth.uid() = user_id);

drop policy if exists "Users can read own transactions" on public.transactions;
drop policy if exists "Users can insert own transactions" on public.transactions;
drop policy if exists "Users can update own transactions" on public.transactions;
drop policy if exists "Users can delete own transactions" on public.transactions;
create policy "Users can read own transactions" on public.transactions for select using (auth.uid() = user_id);
create policy "Users can insert own transactions" on public.transactions for insert with check (auth.uid() = user_id);
create policy "Users can update own transactions" on public.transactions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own transactions" on public.transactions for delete using (auth.uid() = user_id);

drop policy if exists "Users can read own audit logs" on public.audit_logs;
drop policy if exists "Users can insert own audit logs" on public.audit_logs;
create policy "Users can read own audit logs" on public.audit_logs for select using (auth.uid() = user_id);
create policy "Users can insert own audit logs" on public.audit_logs for insert with check (auth.uid() = user_id);

drop policy if exists "Users can read own settings" on public.finance_settings;
drop policy if exists "Users can insert own settings" on public.finance_settings;
drop policy if exists "Users can update own settings" on public.finance_settings;
drop policy if exists "Users can delete own settings" on public.finance_settings;
create policy "Users can read own settings" on public.finance_settings for select using (auth.uid() = user_id);
create policy "Users can insert own settings" on public.finance_settings for insert with check (auth.uid() = user_id);
create policy "Users can update own settings" on public.finance_settings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own settings" on public.finance_settings for delete using (auth.uid() = user_id);
