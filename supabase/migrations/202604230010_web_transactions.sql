create table if not exists public.web_transactions (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  create_time timestamptz not null,
  last_update_time timestamptz not null,
  client_order_no text not null,
  aggregator_order_no text,
  status text not null,
  payment_type text not null,
  product_type text not null,
  currency_code text not null,
  original_amount numeric(18, 4) not null default 0,
  amount numeric(18, 4) not null default 0,
  crypto_currency_code text,
  crypto_amount numeric(18, 8),
  merchant_name text,
  merchant_rate numeric(9, 6),
  merchant_fee numeric(18, 6),
  source_file_name text,
  imported_at timestamptz not null default now(),
  imported_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint web_transactions_client_order_no_check check (char_length(trim(client_order_no)) > 0)
);

drop trigger if exists trg_web_transactions_updated_at on public.web_transactions;
create trigger trg_web_transactions_updated_at
before update on public.web_transactions
for each row execute function public.set_row_updated_at();

create unique index if not exists uq_web_transactions_brand_client_order_no
  on public.web_transactions(brand_id, client_order_no);
create index if not exists idx_web_transactions_brand_create_time
  on public.web_transactions(brand_id, create_time desc);
create index if not exists idx_web_transactions_brand_status
  on public.web_transactions(brand_id, status);
create index if not exists idx_web_transactions_brand_payment_type
  on public.web_transactions(brand_id, payment_type);

alter table public.web_transactions enable row level security;

grant select, insert, update, delete on table public.web_transactions to authenticated;
grant select, insert, update, delete on table public.web_transactions to service_role;

drop policy if exists web_transactions_select_authenticated on public.web_transactions;
create policy web_transactions_select_authenticated
on public.web_transactions
for select
to authenticated
using (public.has_brand_role(brand_id, array['viewer', 'finance', 'admin']));

drop policy if exists web_transactions_insert_finance on public.web_transactions;
create policy web_transactions_insert_finance
on public.web_transactions
for insert
to authenticated
with check (public.has_brand_role(brand_id, array['finance', 'admin']));

drop policy if exists web_transactions_update_finance on public.web_transactions;
create policy web_transactions_update_finance
on public.web_transactions
for update
to authenticated
using (public.has_brand_role(brand_id, array['finance', 'admin']))
with check (public.has_brand_role(brand_id, array['finance', 'admin']));

drop policy if exists web_transactions_delete_finance on public.web_transactions;
create policy web_transactions_delete_finance
on public.web_transactions
for delete
to authenticated
using (public.has_brand_role(brand_id, array['finance', 'admin']));
