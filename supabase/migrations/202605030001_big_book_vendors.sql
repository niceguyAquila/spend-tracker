create table if not exists public.business_ledger_vendor_types (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_ledger_vendor_types_code_check check (char_length(trim(code)) >= 2),
  constraint business_ledger_vendor_types_name_check check (char_length(trim(name)) >= 2)
);

create unique index if not exists uq_business_ledger_vendor_types_code
  on public.business_ledger_vendor_types(lower(trim(code)));

create unique index if not exists uq_business_ledger_vendor_types_name
  on public.business_ledger_vendor_types(lower(trim(name)));

create index if not exists idx_business_ledger_vendor_types_active_sort
  on public.business_ledger_vendor_types(is_active, sort_order, name);

drop trigger if exists trg_business_ledger_vendor_types_updated_at on public.business_ledger_vendor_types;
create trigger trg_business_ledger_vendor_types_updated_at
before update on public.business_ledger_vendor_types
for each row execute function public.set_row_updated_at();

create table if not exists public.business_ledger_vendors (
  id uuid primary key default gen_random_uuid(),
  vendor_type_id uuid not null references public.business_ledger_vendor_types(id) on delete cascade,
  code text not null,
  name text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_ledger_vendors_code_check check (char_length(trim(code)) >= 2),
  constraint business_ledger_vendors_name_check check (char_length(trim(name)) >= 2)
);

create unique index if not exists uq_business_ledger_vendors_type_code
  on public.business_ledger_vendors(vendor_type_id, lower(trim(code)));

create unique index if not exists uq_business_ledger_vendors_type_name
  on public.business_ledger_vendors(vendor_type_id, lower(trim(name)));

create index if not exists idx_business_ledger_vendors_type_active_sort
  on public.business_ledger_vendors(vendor_type_id, is_active, sort_order, name);

drop trigger if exists trg_business_ledger_vendors_updated_at on public.business_ledger_vendors;
create trigger trg_business_ledger_vendors_updated_at
before update on public.business_ledger_vendors
for each row execute function public.set_row_updated_at();

alter table public.business_ledger_entries
  add column if not exists vendor_type_id uuid null
    references public.business_ledger_vendor_types(id) on delete set null;

alter table public.business_ledger_entries
  add column if not exists vendor_id uuid null
    references public.business_ledger_vendors(id) on delete set null;

create index if not exists idx_business_ledger_entries_vendor_type
  on public.business_ledger_entries(vendor_type_id);

create index if not exists idx_business_ledger_entries_vendor
  on public.business_ledger_entries(vendor_id);

create or replace function public.business_ledger_entry_vendor_matches()
returns trigger
language plpgsql
as $$
begin
  if NEW.vendor_id is null and NEW.vendor_type_id is null then
    return NEW;
  end if;

  if NEW.vendor_id is not null and NEW.vendor_type_id is null then
    raise exception 'vendor_type_id is required when vendor_id is set';
  end if;

  if NEW.vendor_id is null then
    return NEW;
  end if;

  if not exists (
    select 1
    from public.business_ledger_vendors v
    where v.id = NEW.vendor_id
      and v.vendor_type_id = NEW.vendor_type_id
  ) then
    raise exception 'vendor_id (%) does not belong to vendor_type_id (%)',
      NEW.vendor_id, NEW.vendor_type_id;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_business_ledger_entries_vendor_matches on public.business_ledger_entries;
create trigger trg_business_ledger_entries_vendor_matches
before insert or update on public.business_ledger_entries
for each row execute function public.business_ledger_entry_vendor_matches();

alter table public.business_ledger_vendor_types enable row level security;
alter table public.business_ledger_vendors enable row level security;

grant select, insert, update, delete on table public.business_ledger_vendor_types to authenticated;
grant select, insert, update, delete on table public.business_ledger_vendors to authenticated;
grant select, insert, update, delete on table public.business_ledger_vendor_types to service_role;
grant select, insert, update, delete on table public.business_ledger_vendors to service_role;

drop policy if exists business_ledger_vendor_types_select_admin on public.business_ledger_vendor_types;
create policy business_ledger_vendor_types_select_admin
on public.business_ledger_vendor_types
for select
to authenticated
using (public.is_admin());

drop policy if exists business_ledger_vendor_types_write_admin on public.business_ledger_vendor_types;
create policy business_ledger_vendor_types_write_admin
on public.business_ledger_vendor_types
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists business_ledger_vendors_select_admin on public.business_ledger_vendors;
create policy business_ledger_vendors_select_admin
on public.business_ledger_vendors
for select
to authenticated
using (public.is_admin());

drop policy if exists business_ledger_vendors_write_admin on public.business_ledger_vendors;
create policy business_ledger_vendors_write_admin
on public.business_ledger_vendors
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

insert into public.business_ledger_vendor_types (code, name, sort_order)
values
  ('MERCHANT', 'Merchant', 10),
  ('PARTNER', 'Partner', 20),
  ('CLIENT', 'Client', 30)
on conflict do nothing;

insert into public.business_ledger_vendors (vendor_type_id, code, name, sort_order)
select vt.id, v.code, v.name, v.sort_order
from public.business_ledger_vendor_types vt
join (
  values
    ('MERCHANT', 'RBEE', 'Rbee', 10),
    ('MERCHANT', 'MSEK', 'Msek', 20),
    ('MERCHANT', 'WON', 'Won', 30),
    ('PARTNER', 'KILO', 'Kilo', 10),
    ('PARTNER', 'DZ', 'DZ', 20),
    ('PARTNER', 'DB', 'DB', 30),
    ('PARTNER', 'AF', 'AF', 40),
    ('PARTNER', 'AS', 'AS', 50),
    ('CLIENT', 'HCM', 'HCM', 10),
    ('CLIENT', 'SELATAN', 'Selatan', 20)
) as v(type_code, code, name, sort_order)
  on vt.code = v.type_code
on conflict do nothing;
