-- Transaction groups: a pure container (label + remark) that holds multiple
-- business_ledger_entries. Groups carry no amount of their own.

create table if not exists public.business_ledger_entry_groups (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  remark text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_ledger_entry_groups_label_check check (char_length(trim(label)) >= 2)
);

create index if not exists idx_business_ledger_entry_groups_created
  on public.business_ledger_entry_groups(created_at desc);

drop trigger if exists trg_business_ledger_entry_groups_updated_at on public.business_ledger_entry_groups;
create trigger trg_business_ledger_entry_groups_updated_at
before update on public.business_ledger_entry_groups
for each row execute function public.set_row_updated_at();

alter table public.business_ledger_entries
  add column if not exists group_id uuid null
    references public.business_ledger_entry_groups(id) on delete cascade;

create index if not exists idx_business_ledger_entries_group
  on public.business_ledger_entries(group_id);

alter table public.business_ledger_entry_groups enable row level security;

grant select, insert, update, delete on table public.business_ledger_entry_groups to authenticated;
grant select, insert, update, delete on table public.business_ledger_entry_groups to service_role;

drop policy if exists business_ledger_entry_groups_select_admin on public.business_ledger_entry_groups;
create policy business_ledger_entry_groups_select_admin
on public.business_ledger_entry_groups
for select
to authenticated
using (public.is_admin());

drop policy if exists business_ledger_entry_groups_insert_admin on public.business_ledger_entry_groups;
create policy business_ledger_entry_groups_insert_admin
on public.business_ledger_entry_groups
for insert
to authenticated
with check (public.is_admin());

drop policy if exists business_ledger_entry_groups_update_admin on public.business_ledger_entry_groups;
create policy business_ledger_entry_groups_update_admin
on public.business_ledger_entry_groups
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists business_ledger_entry_groups_delete_admin on public.business_ledger_entry_groups;
create policy business_ledger_entry_groups_delete_admin
on public.business_ledger_entry_groups
for delete
to authenticated
using (public.is_admin());
