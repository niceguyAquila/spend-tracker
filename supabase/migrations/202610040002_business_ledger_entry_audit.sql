-- Audit trail for Big Book ledger entries (separate table; trigger-written).
-- Optimistic concurrency uses existing updated_at; no schema change required there.

create table if not exists public.business_ledger_entry_audit_logs (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  changed_by uuid,
  changed_at timestamptz not null default now(),
  old_row jsonb,
  new_row jsonb
);

create index if not exists idx_business_ledger_entry_audit_logs_entry_changed
  on public.business_ledger_entry_audit_logs(entry_id, changed_at desc);

create index if not exists idx_business_ledger_entry_audit_logs_changed_at
  on public.business_ledger_entry_audit_logs(changed_at desc);

alter table public.business_ledger_entry_audit_logs enable row level security;

drop policy if exists business_ledger_entry_audit_logs_select_admin
  on public.business_ledger_entry_audit_logs;
create policy business_ledger_entry_audit_logs_select_admin
on public.business_ledger_entry_audit_logs
for select
to authenticated
using (public.is_admin());

-- Writes go through the security-definer trigger only (no direct insert/update/delete policies).

create or replace function public.audit_business_ledger_entry_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid;
begin
  actor_id := auth.uid();

  if tg_op = 'INSERT' then
    insert into public.business_ledger_entry_audit_logs (entry_id, action, changed_by, new_row)
    values (new.id, 'insert', coalesce(actor_id, new.created_by), to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.business_ledger_entry_audit_logs (entry_id, action, changed_by, old_row, new_row)
    values (new.id, 'update', coalesce(actor_id, new.updated_by), to_jsonb(old), to_jsonb(new));
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.business_ledger_entry_audit_logs (entry_id, action, changed_by, old_row)
    values (old.id, 'delete', coalesce(actor_id, old.updated_by), to_jsonb(old));
    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_audit_business_ledger_entries on public.business_ledger_entries;
create trigger trg_audit_business_ledger_entries
after insert or update or delete on public.business_ledger_entries
for each row execute function public.audit_business_ledger_entry_changes();
