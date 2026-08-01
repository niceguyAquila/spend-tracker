create table if not exists public.business_ledger_action_by (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_ledger_action_by_code_check check (char_length(trim(code)) >= 2),
  constraint business_ledger_action_by_name_check check (char_length(trim(name)) >= 2)
);

create unique index if not exists uq_business_ledger_action_by_code
  on public.business_ledger_action_by(lower(trim(code)));

create unique index if not exists uq_business_ledger_action_by_name
  on public.business_ledger_action_by(lower(trim(name)));

create index if not exists idx_business_ledger_action_by_active_sort
  on public.business_ledger_action_by(is_active, sort_order, name);

drop trigger if exists trg_business_ledger_action_by_updated_at on public.business_ledger_action_by;
create trigger trg_business_ledger_action_by_updated_at
before update on public.business_ledger_action_by
for each row execute function public.set_row_updated_at();

alter table public.business_ledger_entries
  add column if not exists action_by_id uuid null
    references public.business_ledger_action_by(id) on delete set null;

create index if not exists idx_business_ledger_entries_action_by
  on public.business_ledger_entries(action_by_id);

alter table public.business_ledger_action_by enable row level security;

grant select, insert, update, delete on table public.business_ledger_action_by to authenticated;
grant select, insert, update, delete on table public.business_ledger_action_by to service_role;

drop policy if exists business_ledger_action_by_select_admin on public.business_ledger_action_by;
create policy business_ledger_action_by_select_admin
on public.business_ledger_action_by
for select
to authenticated
using (public.is_admin());

drop policy if exists business_ledger_action_by_write_admin on public.business_ledger_action_by;
create policy business_ledger_action_by_write_admin
on public.business_ledger_action_by
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());
