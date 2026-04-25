-- Refactor Big Book entries from brand-scoped to global admin-managed records.
-- Existing rows are backfilled to a null brand_id so entries are no longer bound to brands.

update public.business_ledger_entries
set brand_id = null
where brand_id is not null;

alter table public.business_ledger_entries
alter column brand_id drop not null;

alter table public.business_ledger_entries
drop constraint if exists business_ledger_entries_brand_id_fkey;

drop index if exists idx_business_ledger_entries_brand_date;
drop index if exists idx_business_ledger_entries_brand_type;
drop index if exists idx_business_ledger_entries_brand_direction;

create index if not exists idx_business_ledger_entries_date
  on public.business_ledger_entries(entry_date desc);

create index if not exists idx_business_ledger_entries_type
  on public.business_ledger_entries(entry_type_id);

create index if not exists idx_business_ledger_entries_direction
  on public.business_ledger_entries(entry_direction);

drop policy if exists business_ledger_entries_select_admin on public.business_ledger_entries;
create policy business_ledger_entries_select_admin
on public.business_ledger_entries
for select
to authenticated
using (public.is_admin());

drop policy if exists business_ledger_entries_insert_admin on public.business_ledger_entries;
create policy business_ledger_entries_insert_admin
on public.business_ledger_entries
for insert
to authenticated
with check (public.is_admin());

drop policy if exists business_ledger_entries_update_admin on public.business_ledger_entries;
create policy business_ledger_entries_update_admin
on public.business_ledger_entries
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists business_ledger_entries_delete_admin on public.business_ledger_entries;
create policy business_ledger_entries_delete_admin
on public.business_ledger_entries
for delete
to authenticated
using (public.is_admin());

drop policy if exists business_ledger_attachments_select_admin on public.business_ledger_attachments;
create policy business_ledger_attachments_select_admin
on public.business_ledger_attachments
for select
to authenticated
using (
  public.is_admin()
  and exists (
    select 1
    from public.business_ledger_entries ble
    where ble.id = business_ledger_attachments.ledger_entry_id
  )
);

drop policy if exists business_ledger_attachments_insert_admin on public.business_ledger_attachments;
create policy business_ledger_attachments_insert_admin
on public.business_ledger_attachments
for insert
to authenticated
with check (
  public.is_admin()
  and exists (
    select 1
    from public.business_ledger_entries ble
    where ble.id = business_ledger_attachments.ledger_entry_id
  )
);

drop policy if exists business_ledger_attachments_update_admin on public.business_ledger_attachments;
create policy business_ledger_attachments_update_admin
on public.business_ledger_attachments
for update
to authenticated
using (
  public.is_admin()
  and exists (
    select 1
    from public.business_ledger_entries ble
    where ble.id = business_ledger_attachments.ledger_entry_id
  )
)
with check (
  public.is_admin()
  and exists (
    select 1
    from public.business_ledger_entries ble
    where ble.id = business_ledger_attachments.ledger_entry_id
  )
);

drop policy if exists business_ledger_attachments_delete_admin on public.business_ledger_attachments;
create policy business_ledger_attachments_delete_admin
on public.business_ledger_attachments
for delete
to authenticated
using (
  public.is_admin()
  and exists (
    select 1
    from public.business_ledger_entries ble
    where ble.id = business_ledger_attachments.ledger_entry_id
  )
);
