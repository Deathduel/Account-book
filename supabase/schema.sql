-- ============================================================
-- 简账（个人极简记账本）Supabase PostgreSQL 建表脚本
-- 使用方式：打开 Supabase Dashboard -> SQL Editor -> 粘贴并 Run
-- ============================================================

-- 1. 收支流水表（金额统一存整数“分”，避免浮点精度问题）
create table if not exists public.transactions (
  id           bigint generated always as identity primary key,
  type         text not null check (type in ('expense', 'income')),
  amount_cents integer not null check (amount_cents > 0),
  category_id  text not null,
  occurred_on  date not null,
  note         text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_transactions_occurred_on
  on public.transactions (occurred_on desc, id desc);

create index if not exists idx_transactions_type_date
  on public.transactions (type, occurred_on desc);

-- 2. 预算配置表（单行存月度总预算与分类预算 JSON）
create table if not exists public.budgets (
  id             text primary key default 'default',
  monthly_cents  integer not null default 200000,
  categories     jsonb not null default '{}'::jsonb,
  updated_at     timestamptz not null default now()
);

insert into public.budgets (id, monthly_cents, categories)
values ('default', 200000, '{}'::jsonb)
on conflict (id) do nothing;

-- 开启 RLS（阻止外部匿名直接读写），仅放行服务端 service_role / secret key 访问
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;

-- 显式授予 service_role 完整读写与自增序列权限（避免未勾选 Grant API access 时报权限不足）
grant usage on schema public to service_role;
grant all on table public.transactions to service_role;
grant all on table public.budgets to service_role;
grant all on all sequences in schema public to service_role;
