create table if not exists public.business_ledger_sub_types (
  id uuid primary key default gen_random_uuid(),
  entry_type_id uuid not null references public.business_ledger_types(id) on delete cascade,
  code text not null,
  name text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_ledger_sub_types_code_check check (char_length(trim(code)) >= 2),
  constraint business_ledger_sub_types_name_check check (char_length(trim(name)) >= 2)
);

create unique index if not exists uq_business_ledger_sub_types_type_code
  on public.business_ledger_sub_types(entry_type_id, lower(trim(code)));

create unique index if not exists uq_business_ledger_sub_types_type_name
  on public.business_ledger_sub_types(entry_type_id, lower(trim(name)));

create index if not exists idx_business_ledger_sub_types_type_active_sort
  on public.business_ledger_sub_types(entry_type_id, is_active, sort_order, name);

drop trigger if exists trg_business_ledger_sub_types_updated_at on public.business_ledger_sub_types;
create trigger trg_business_ledger_sub_types_updated_at
before update on public.business_ledger_sub_types
for each row execute function public.set_row_updated_at();

alter table public.business_ledger_entries
  add column if not exists entry_sub_type_id uuid null
    references public.business_ledger_sub_types(id) on delete set null;

create index if not exists idx_business_ledger_entries_sub_type
  on public.business_ledger_entries(entry_sub_type_id);

create or replace function public.business_ledger_entry_sub_type_matches()
returns trigger
language plpgsql
as $$
begin
  if NEW.entry_sub_type_id is null then
    return NEW;
  end if;
  if not exists (
    select 1
    from public.business_ledger_sub_types s
    where s.id = NEW.entry_sub_type_id
      and s.entry_type_id = NEW.entry_type_id
  ) then
    raise exception 'entry_sub_type_id (%) does not belong to entry_type_id (%)',
      NEW.entry_sub_type_id, NEW.entry_type_id;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_business_ledger_entries_sub_type_matches on public.business_ledger_entries;
create trigger trg_business_ledger_entries_sub_type_matches
before insert or update on public.business_ledger_entries
for each row execute function public.business_ledger_entry_sub_type_matches();

alter table public.business_ledger_sub_types enable row level security;

grant select, insert, update, delete on table public.business_ledger_sub_types to authenticated;
grant select, insert, update, delete on table public.business_ledger_sub_types to service_role;

drop policy if exists business_ledger_sub_types_select_admin on public.business_ledger_sub_types;
create policy business_ledger_sub_types_select_admin
on public.business_ledger_sub_types
for select
to authenticated
using (public.is_admin());

drop policy if exists business_ledger_sub_types_write_admin on public.business_ledger_sub_types;
create policy business_ledger_sub_types_write_admin
on public.business_ledger_sub_types
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());
