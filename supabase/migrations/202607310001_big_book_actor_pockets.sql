create table if not exists public.big_book_actor_pockets (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.big_book_actors(id) on delete cascade,
  code text not null,
  name text not null,
  currency_code text not null default 'IDR',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint big_book_actor_pockets_code_check check (char_length(trim(code)) >= 2),
  constraint big_book_actor_pockets_name_check check (char_length(trim(name)) >= 2),
  constraint big_book_actor_pockets_currency_check check (currency_code in ('IDR'))
);

create unique index if not exists uq_big_book_actor_pockets_actor_code
  on public.big_book_actor_pockets(actor_id, lower(trim(code)));

create unique index if not exists uq_big_book_actor_pockets_actor_name
  on public.big_book_actor_pockets(actor_id, lower(trim(name)));

create index if not exists idx_big_book_actor_pockets_actor_active_sort
  on public.big_book_actor_pockets(actor_id, is_active, sort_order, name);

drop trigger if exists trg_big_book_actor_pockets_updated_at on public.big_book_actor_pockets;
create trigger trg_big_book_actor_pockets_updated_at
before update on public.big_book_actor_pockets
for each row execute function public.set_row_updated_at();

alter table public.business_ledger_entries
  add column if not exists pocket_id uuid null
    references public.big_book_actor_pockets(id) on delete set null;

create index if not exists idx_business_ledger_entries_pocket
  on public.business_ledger_entries(pocket_id);

create or replace function public.business_ledger_entry_pocket_matches()
returns trigger
language plpgsql
as $$
declare
  pocket_actor_id uuid;
  pocket_currency text;
begin
  if NEW.pocket_id is null then
    return NEW;
  end if;

  select p.actor_id, p.currency_code
    into pocket_actor_id, pocket_currency
  from public.big_book_actor_pockets p
  where p.id = NEW.pocket_id;

  if pocket_actor_id is null then
    raise exception 'pocket_id (%) does not exist', NEW.pocket_id;
  end if;

  if pocket_actor_id <> NEW.responsible_actor_id then
    raise exception 'pocket_id (%) does not belong to responsible_actor_id (%)',
      NEW.pocket_id, NEW.responsible_actor_id;
  end if;

  if pocket_currency <> NEW.currency_code then
    raise exception 'pocket_id (%) is a % pocket and cannot be used on a % entry',
      NEW.pocket_id, pocket_currency, NEW.currency_code;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_business_ledger_entries_pocket_matches on public.business_ledger_entries;
create trigger trg_business_ledger_entries_pocket_matches
before insert or update on public.business_ledger_entries
for each row execute function public.business_ledger_entry_pocket_matches();

alter table public.big_book_actor_pockets enable row level security;

grant select, insert, update, delete on table public.big_book_actor_pockets to authenticated;
grant select, insert, update, delete on table public.big_book_actor_pockets to service_role;

drop policy if exists big_book_actor_pockets_select_admin on public.big_book_actor_pockets;
create policy big_book_actor_pockets_select_admin
on public.big_book_actor_pockets
for select
to authenticated
using (public.is_admin());

drop policy if exists big_book_actor_pockets_write_admin on public.big_book_actor_pockets;
create policy big_book_actor_pockets_write_admin
on public.big_book_actor_pockets
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());
