alter table public.business_ledger_entries
add column if not exists entry_direction text;

update public.business_ledger_entries
set entry_direction = 'spending'
where entry_direction is null;

alter table public.business_ledger_entries
alter column entry_direction set not null;

alter table public.business_ledger_entries
drop constraint if exists business_ledger_entries_direction_check;

alter table public.business_ledger_entries
add constraint business_ledger_entries_direction_check
check (entry_direction in ('spending', 'profit'));

create index if not exists idx_business_ledger_entries_brand_direction
  on public.business_ledger_entries(brand_id, entry_direction);
