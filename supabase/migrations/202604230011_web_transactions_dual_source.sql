alter table public.web_transactions
  add column if not exists source_system text,
  add column if not exists external_txn_no text,
  add column if not exists raw_status text,
  add column if not exists canonical_status text,
  add column if not exists raw_type text,
  add column if not exists canonical_type text,
  add column if not exists raw_payload jsonb;

update public.web_transactions
set source_system = coalesce(source_system, 'payment_gateway'),
    external_txn_no = coalesce(external_txn_no, client_order_no),
    raw_status = coalesce(raw_status, status),
    canonical_status = coalesce(canonical_status, status),
    raw_type = coalesce(raw_type, payment_type),
    canonical_type = coalesce(canonical_type, payment_type)
where source_system is null
   or external_txn_no is null
   or raw_status is null
   or canonical_status is null
   or raw_type is null
   or canonical_type is null;

alter table public.web_transactions
  alter column source_system set not null,
  alter column external_txn_no set not null,
  alter column raw_status set not null,
  alter column canonical_status set not null,
  alter column raw_type set not null,
  alter column canonical_type set not null;

alter table public.web_transactions
  alter column client_order_no drop not null;

alter table public.web_transactions
  drop constraint if exists web_transactions_client_order_no_check;

alter table public.web_transactions
  add constraint web_transactions_external_txn_no_check
  check (char_length(trim(external_txn_no)) > 0);

drop index if exists uq_web_transactions_brand_client_order_no;

create unique index if not exists uq_web_transactions_brand_source_external
  on public.web_transactions(brand_id, source_system, external_txn_no);

create index if not exists idx_web_transactions_brand_source_create_time
  on public.web_transactions(brand_id, source_system, create_time desc);
