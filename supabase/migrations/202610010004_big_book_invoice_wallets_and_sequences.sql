-- Invoice payment wallets (printed on invoice PDF notes) + daily invoice number sequences.
-- Invoice numbers use format ddmmyy-x where x increments per calendar day.

create table if not exists public.big_book_invoice_wallets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  network text not null,
  address text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint big_book_invoice_wallets_name_check check (char_length(trim(name)) >= 2),
  constraint big_book_invoice_wallets_network_check check (char_length(trim(network)) >= 2),
  constraint big_book_invoice_wallets_address_check check (char_length(trim(address)) >= 4)
);

create unique index if not exists uq_big_book_invoice_wallets_name
  on public.big_book_invoice_wallets(lower(trim(name)));

create index if not exists idx_big_book_invoice_wallets_active_sort
  on public.big_book_invoice_wallets(is_active, sort_order, name);

drop trigger if exists trg_big_book_invoice_wallets_updated_at on public.big_book_invoice_wallets;
create trigger trg_big_book_invoice_wallets_updated_at
before update on public.big_book_invoice_wallets
for each row execute function public.set_row_updated_at();

alter table public.big_book_invoice_wallets enable row level security;

grant select, insert, update, delete on table public.big_book_invoice_wallets to authenticated;
grant select, insert, update, delete on table public.big_book_invoice_wallets to service_role;

drop policy if exists big_book_invoice_wallets_select_admin on public.big_book_invoice_wallets;
create policy big_book_invoice_wallets_select_admin
on public.big_book_invoice_wallets
for select
to authenticated
using (public.is_admin());

drop policy if exists big_book_invoice_wallets_write_admin on public.big_book_invoice_wallets;
create policy big_book_invoice_wallets_write_admin
on public.big_book_invoice_wallets
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Daily sequence counter only (no full invoice document storage in v1).
create table if not exists public.big_book_invoice_daily_sequences (
  invoice_day date primary key,
  last_seq integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint big_book_invoice_daily_sequences_last_seq_check check (last_seq >= 0)
);

drop trigger if exists trg_big_book_invoice_daily_sequences_updated_at
  on public.big_book_invoice_daily_sequences;
create trigger trg_big_book_invoice_daily_sequences_updated_at
before update on public.big_book_invoice_daily_sequences
for each row execute function public.set_row_updated_at();

alter table public.big_book_invoice_daily_sequences enable row level security;

grant select, insert, update, delete on table public.big_book_invoice_daily_sequences to authenticated;
grant select, insert, update, delete on table public.big_book_invoice_daily_sequences to service_role;

drop policy if exists big_book_invoice_daily_sequences_select_admin
  on public.big_book_invoice_daily_sequences;
create policy big_book_invoice_daily_sequences_select_admin
on public.big_book_invoice_daily_sequences
for select
to authenticated
using (public.is_admin());

drop policy if exists big_book_invoice_daily_sequences_write_admin
  on public.big_book_invoice_daily_sequences;
create policy big_book_invoice_daily_sequences_write_admin
on public.big_book_invoice_daily_sequences
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Atomically allocate the next invoice number for a calendar day (ddmmyy-x).
create or replace function public.allocate_big_book_invoice_number(p_day date default (timezone('utc', now()))::date)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  next_seq integer;
  day_token text;
begin
  if p_day is null then
    p_day := (timezone('utc', now()))::date;
  end if;

  insert into public.big_book_invoice_daily_sequences as seq (invoice_day, last_seq)
  values (p_day, 1)
  on conflict (invoice_day) do update
    set last_seq = seq.last_seq + 1
  returning seq.last_seq into next_seq;

  day_token := to_char(p_day, 'DDMMYY');
  return day_token || '-' || next_seq::text;
end;
$$;

revoke all on function public.allocate_big_book_invoice_number(date) from public;
grant execute on function public.allocate_big_book_invoice_number(date) to authenticated;
grant execute on function public.allocate_big_book_invoice_number(date) to service_role;
