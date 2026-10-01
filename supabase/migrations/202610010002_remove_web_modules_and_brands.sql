-- Accounting keeps Transaction Big Book and Credit Big Book.
-- Web Spending, Web Transaction, and brands move out of this database.
-- Ledger rows stay; access is the global admin role on allowed_users.

create or replace function public.is_finance_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.allowed_users au
    where au.normalized_email = lower(coalesce(auth.jwt() ->> 'email', ''))
      and au.is_active = true
      and au.role in ('finance', 'admin')
  );
$$;

revoke all on function public.is_finance_or_admin() from public;
grant execute on function public.is_finance_or_admin() to authenticated, service_role;

drop policy if exists credit_ledger_entries_select_admin on public.credit_ledger_entries;
create policy credit_ledger_entries_select_admin
on public.credit_ledger_entries
for select
to authenticated
using (public.is_admin());

drop policy if exists credit_ledger_entries_insert_admin on public.credit_ledger_entries;
create policy credit_ledger_entries_insert_admin
on public.credit_ledger_entries
for insert
to authenticated
with check (public.is_admin());

drop policy if exists credit_ledger_entries_update_admin on public.credit_ledger_entries;
create policy credit_ledger_entries_update_admin
on public.credit_ledger_entries
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists credit_ledger_entries_delete_admin on public.credit_ledger_entries;
create policy credit_ledger_entries_delete_admin
on public.credit_ledger_entries
for delete
to authenticated
using (public.is_admin());

drop policy if exists credit_ledger_attachments_select_admin on public.credit_ledger_attachments;
create policy credit_ledger_attachments_select_admin
on public.credit_ledger_attachments
for select
to authenticated
using (
  public.is_admin()
  and exists (
    select 1
    from public.credit_ledger_entries cle
    where cle.id = credit_ledger_attachments.ledger_entry_id
  )
);

drop policy if exists credit_ledger_attachments_insert_admin on public.credit_ledger_attachments;
create policy credit_ledger_attachments_insert_admin
on public.credit_ledger_attachments
for insert
to authenticated
with check (
  public.is_admin()
  and exists (
    select 1
    from public.credit_ledger_entries cle
    where cle.id = credit_ledger_attachments.ledger_entry_id
  )
);

drop policy if exists credit_ledger_attachments_update_admin on public.credit_ledger_attachments;
create policy credit_ledger_attachments_update_admin
on public.credit_ledger_attachments
for update
to authenticated
using (
  public.is_admin()
  and exists (
    select 1
    from public.credit_ledger_entries cle
    where cle.id = credit_ledger_attachments.ledger_entry_id
  )
)
with check (
  public.is_admin()
  and exists (
    select 1
    from public.credit_ledger_entries cle
    where cle.id = credit_ledger_attachments.ledger_entry_id
  )
);

drop policy if exists credit_ledger_attachments_delete_admin on public.credit_ledger_attachments;
create policy credit_ledger_attachments_delete_admin
on public.credit_ledger_attachments
for delete
to authenticated
using (
  public.is_admin()
  and exists (
    select 1
    from public.credit_ledger_entries cle
    where cle.id = credit_ledger_attachments.ledger_entry_id
  )
);

drop policy if exists credit_ledger_settlements_select_admin on public.credit_ledger_settlements;
create policy credit_ledger_settlements_select_admin
on public.credit_ledger_settlements
for select
to authenticated
using (
  public.is_admin()
  and exists (
    select 1
    from public.credit_ledger_entries cle
    where cle.id = credit_ledger_settlements.entry_id
  )
);

drop policy if exists credit_ledger_settlements_insert_admin on public.credit_ledger_settlements;
create policy credit_ledger_settlements_insert_admin
on public.credit_ledger_settlements
for insert
to authenticated
with check (
  public.is_admin()
  and exists (
    select 1
    from public.credit_ledger_entries cle
    where cle.id = credit_ledger_settlements.entry_id
  )
);

drop policy if exists credit_ledger_settlements_update_admin on public.credit_ledger_settlements;
create policy credit_ledger_settlements_update_admin
on public.credit_ledger_settlements
for update
to authenticated
using (
  public.is_admin()
  and exists (
    select 1
    from public.credit_ledger_entries cle
    where cle.id = credit_ledger_settlements.entry_id
  )
)
with check (
  public.is_admin()
  and exists (
    select 1
    from public.credit_ledger_entries cle
    where cle.id = credit_ledger_settlements.entry_id
  )
);

drop policy if exists credit_ledger_settlements_delete_admin on public.credit_ledger_settlements;
create policy credit_ledger_settlements_delete_admin
on public.credit_ledger_settlements
for delete
to authenticated
using (
  public.is_admin()
  and exists (
    select 1
    from public.credit_ledger_entries cle
    where cle.id = credit_ledger_settlements.entry_id
  )
);

drop policy if exists credit_ledger_settlement_attachments_select_admin
  on public.credit_ledger_settlement_attachments;
create policy credit_ledger_settlement_attachments_select_admin
on public.credit_ledger_settlement_attachments
for select
to authenticated
using (
  public.is_admin()
  and exists (
    select 1
    from public.credit_ledger_settlements cls
    join public.credit_ledger_entries cle on cle.id = cls.entry_id
    where cls.id = credit_ledger_settlement_attachments.settlement_id
  )
);

drop policy if exists credit_ledger_settlement_attachments_insert_admin
  on public.credit_ledger_settlement_attachments;
create policy credit_ledger_settlement_attachments_insert_admin
on public.credit_ledger_settlement_attachments
for insert
to authenticated
with check (
  public.is_admin()
  and exists (
    select 1
    from public.credit_ledger_settlements cls
    join public.credit_ledger_entries cle on cle.id = cls.entry_id
    where cls.id = credit_ledger_settlement_attachments.settlement_id
  )
);

drop policy if exists credit_ledger_settlement_attachments_update_admin
  on public.credit_ledger_settlement_attachments;
create policy credit_ledger_settlement_attachments_update_admin
on public.credit_ledger_settlement_attachments
for update
to authenticated
using (
  public.is_admin()
  and exists (
    select 1
    from public.credit_ledger_settlements cls
    join public.credit_ledger_entries cle on cle.id = cls.entry_id
    where cls.id = credit_ledger_settlement_attachments.settlement_id
  )
)
with check (
  public.is_admin()
  and exists (
    select 1
    from public.credit_ledger_settlements cls
    join public.credit_ledger_entries cle on cle.id = cls.entry_id
    where cls.id = credit_ledger_settlement_attachments.settlement_id
  )
);

drop policy if exists credit_ledger_settlement_attachments_delete_admin
  on public.credit_ledger_settlement_attachments;
create policy credit_ledger_settlement_attachments_delete_admin
on public.credit_ledger_settlement_attachments
for delete
to authenticated
using (
  public.is_admin()
  and exists (
    select 1
    from public.credit_ledger_settlements cls
    join public.credit_ledger_entries cle on cle.id = cls.entry_id
    where cls.id = credit_ledger_settlement_attachments.settlement_id
  )
);

drop function if exists public.get_big_book_pocket_web_spending();
drop function if exists public.get_expense_monthly_summary(uuid);
drop function if exists public.get_expense_monthly_summary();
drop function if exists public.get_expense_category_split(uuid, date);
drop function if exists public.get_expense_category_split(date);
drop function if exists public.get_subcategory_movement(uuid, date);
drop function if exists public.get_subcategory_movement(date);
drop function if exists public.audit_expense_changes() cascade;
drop function if exists public.ensure_expense_subcategory_belongs_to_category() cascade;

drop table if exists public.expense_audit_logs cascade;
drop table if exists public.expenses cascade;
drop table if exists public.expense_staff cascade;
drop table if exists public.expense_types cascade;
drop table if exists public.expense_categories cascade;
drop table if exists public.expense_subcategories cascade;
drop table if exists public.web_transactions cascade;

alter table public.big_book_actor_pockets
  drop column if exists linked_brand_id;

drop index if exists uq_big_book_actor_pockets_linked_brand;

alter table public.credit_ledger_entries
  drop column if exists brand_id;

alter table public.business_ledger_entries
  drop column if exists brand_id;

drop function if exists public.has_brand_role(uuid, text[]);
drop function if exists public.current_allowed_user_id();

drop table if exists public.user_brand_roles cascade;
drop table if exists public.brands cascade;
