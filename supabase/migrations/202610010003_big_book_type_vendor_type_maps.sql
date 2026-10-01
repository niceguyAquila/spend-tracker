-- 1:1 mapping from ledger Type → Vendor Type for auto-fill on create/edit.
create table if not exists public.business_ledger_type_vendor_type_maps (
  id uuid primary key default gen_random_uuid(),
  entry_type_id uuid not null references public.business_ledger_types(id) on delete cascade,
  vendor_type_id uuid not null references public.business_ledger_vendor_types(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_business_ledger_type_vendor_type_maps_type
  on public.business_ledger_type_vendor_type_maps(entry_type_id);

create index if not exists idx_business_ledger_type_vendor_type_maps_vendor_type
  on public.business_ledger_type_vendor_type_maps(vendor_type_id);

drop trigger if exists trg_business_ledger_type_vendor_type_maps_updated_at
  on public.business_ledger_type_vendor_type_maps;
create trigger trg_business_ledger_type_vendor_type_maps_updated_at
before update on public.business_ledger_type_vendor_type_maps
for each row execute function public.set_row_updated_at();

alter table public.business_ledger_type_vendor_type_maps enable row level security;

grant select, insert, update, delete on table public.business_ledger_type_vendor_type_maps to authenticated;
grant select, insert, update, delete on table public.business_ledger_type_vendor_type_maps to service_role;

drop policy if exists business_ledger_type_vendor_type_maps_select_admin
  on public.business_ledger_type_vendor_type_maps;
create policy business_ledger_type_vendor_type_maps_select_admin
on public.business_ledger_type_vendor_type_maps
for select
to authenticated
using (public.is_admin());

drop policy if exists business_ledger_type_vendor_type_maps_write_admin
  on public.business_ledger_type_vendor_type_maps;
create policy business_ledger_type_vendor_type_maps_write_admin
on public.business_ledger_type_vendor_type_maps
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());
