-- Workbook-aligned extensions for the existing Feedshop Supabase schema.
-- Apply only after the existing base schema has created products, purchases,
-- expenses, sales and profiles. This does not create or seed any user accounts.

alter table public.products add column if not exists code text;
alter table public.products add column if not exists category text;
alter table public.products add column if not exists unit text;
alter table public.products add column if not exists buy numeric(18,2) not null default 0;
alter table public.products add column if not exists retail numeric(18,2) not null default 0;
alter table public.products add column if not exists wholesale numeric(18,2) not null default 0;
alter table public.products add column if not exists opening numeric(18,3) not null default 0;
alter table public.products add column if not exists reorder numeric(18,3) not null default 0;

alter table public.purchases add column if not exists note text;
alter table public.expenses add column if not exists note text;

create table if not exists public.returns (
  id uuid primary key,
  sale_id uuid not null references public.sales(id) on delete restrict,
  day date not null,
  invoice text,
  product_id uuid not null references public.products(id) on delete restrict,
  customer text,
  qty numeric(18,3) not null check (qty > 0),
  price numeric(18,2) not null default 0 check (price >= 0),
  cost numeric(18,2) not null default 0 check (cost >= 0),
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.parties (
  id uuid primary key,
  name text not null,
  kind text not null default 'مشترک' check (kind in ('مشتری', 'تأمین‌کننده', 'مشترک')),
  phone text,
  opening_balance numeric(18,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.bank_transactions (
  id uuid primary key,
  day date not null,
  title text not null,
  kind text not null check (kind in ('مانده افتتاحیه', 'واریز', 'برداشت', 'دریافت وام', 'پرداخت قسط وام')),
  deposit numeric(18,2) not null default 0 check (deposit >= 0),
  withdrawal numeric(18,2) not null default 0 check (withdrawal >= 0),
  created_at timestamptz not null default now(),
  check ((deposit = 0) or (withdrawal = 0))
);

create index if not exists returns_day_idx on public.returns(day desc);
create index if not exists returns_invoice_idx on public.returns(invoice);
create index if not exists returns_sale_id_idx on public.returns(sale_id);
create index if not exists parties_name_idx on public.parties(name);
create index if not exists bank_transactions_day_idx on public.bank_transactions(day desc);

-- Authenticated staff may read. Only a user whose profile role is admin may
-- mutate these new tables; no public/anonymous policy is created.
alter table public.returns enable row level security;
alter table public.parties enable row level security;
alter table public.bank_transactions enable row level security;

drop policy if exists returns_authenticated_read on public.returns;
create policy returns_authenticated_read on public.returns
  for select to authenticated using (true);
drop policy if exists returns_admin_write on public.returns;
create policy returns_admin_write on public.returns
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists parties_authenticated_read on public.parties;
create policy parties_authenticated_read on public.parties
  for select to authenticated using (true);
drop policy if exists parties_admin_write on public.parties;
create policy parties_admin_write on public.parties
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists bank_transactions_authenticated_read on public.bank_transactions;
create policy bank_transactions_authenticated_read on public.bank_transactions
  for select to authenticated using (true);
drop policy if exists bank_transactions_admin_write on public.bank_transactions;
create policy bank_transactions_admin_write on public.bank_transactions
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
