alter table public.expense_categories enable row level security;
alter table public.expense_subcategories enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_audit_logs enable row level security;

grant usage on schema public to authenticated;
grant select on table public.expense_categories to authenticated;
grant select on table public.expense_subcategories to authenticated;
grant select on table public.expenses to authenticated;
grant insert, update, delete on table public.expenses to authenticated;
grant insert, update on table public.expense_subcategories to authenticated;

create or replace function public.is_finance_or_admin()
returns boolean
language sql
stable
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') in ('finance', 'admin'),
    false
  );
$$;

drop policy if exists category_select_authenticated on public.expense_categories;
create policy category_select_authenticated
on public.expense_categories
for select
to authenticated
using (true);

drop policy if exists category_select_anon on public.expense_categories;

drop policy if exists category_write_finance on public.expense_categories;
create policy category_write_finance
on public.expense_categories
for all
to authenticated
using (
  exists (
    select 1
    from public.allowed_users au
    where au.normalized_email = lower(coalesce(auth.jwt() ->> 'email', ''))
      and au.is_active = true
      and au.role in ('finance', 'admin')
  )
)
with check (
  exists (
    select 1
    from public.allowed_users au
    where au.normalized_email = lower(coalesce(auth.jwt() ->> 'email', ''))
      and au.is_active = true
      and au.role in ('finance', 'admin')
  )
);

drop policy if exists subcategory_select_authenticated on public.expense_subcategories;
create policy subcategory_select_authenticated
on public.expense_subcategories
for select
to authenticated
using (true);

drop policy if exists subcategory_select_anon on public.expense_subcategories;

drop policy if exists subcategory_write_finance on public.expense_subcategories;
create policy subcategory_write_finance
on public.expense_subcategories
for all
to authenticated
using (
  exists (
    select 1
    from public.allowed_users au
    where au.normalized_email = lower(coalesce(auth.jwt() ->> 'email', ''))
      and au.is_active = true
      and au.role in ('finance', 'admin')
  )
)
with check (
  exists (
    select 1
    from public.allowed_users au
    where au.normalized_email = lower(coalesce(auth.jwt() ->> 'email', ''))
      and au.is_active = true
      and au.role in ('finance', 'admin')
  )
);

drop policy if exists subcategory_insert_anon on public.expense_subcategories;
drop policy if exists subcategory_update_anon on public.expense_subcategories;

drop policy if exists expenses_select_authenticated on public.expenses;
create policy expenses_select_authenticated
on public.expenses
for select
to authenticated
using (true);

drop policy if exists expenses_select_anon on public.expenses;

drop policy if exists expenses_insert_finance on public.expenses;
create policy expenses_insert_finance
on public.expenses
for insert
to authenticated
with check (
  exists (
    select 1
    from public.allowed_users au
    where au.normalized_email = lower(coalesce(auth.jwt() ->> 'email', ''))
      and au.is_active = true
      and au.role in ('finance', 'admin')
  )
);

drop policy if exists expenses_insert_anon on public.expenses;

drop policy if exists expenses_update_finance on public.expenses;
create policy expenses_update_finance
on public.expenses
for update
to authenticated
using (
  exists (
    select 1
    from public.allowed_users au
    where au.normalized_email = lower(coalesce(auth.jwt() ->> 'email', ''))
      and au.is_active = true
      and au.role in ('finance', 'admin')
  )
)
with check (
  exists (
    select 1
    from public.allowed_users au
    where au.normalized_email = lower(coalesce(auth.jwt() ->> 'email', ''))
      and au.is_active = true
      and au.role in ('finance', 'admin')
  )
);

drop policy if exists expenses_update_anon on public.expenses;

drop policy if exists expenses_delete_finance on public.expenses;
create policy expenses_delete_finance
on public.expenses
for delete
to authenticated
using (
  exists (
    select 1
    from public.allowed_users au
    where au.normalized_email = lower(coalesce(auth.jwt() ->> 'email', ''))
      and au.is_active = true
      and au.role in ('finance', 'admin')
  )
);

drop policy if exists expenses_delete_anon on public.expenses;

drop policy if exists audit_select_finance on public.expense_audit_logs;
create policy audit_select_finance
on public.expense_audit_logs
for select
to authenticated
using (
  exists (
    select 1
    from public.allowed_users au
    where au.normalized_email = lower(coalesce(auth.jwt() ->> 'email', ''))
      and au.is_active = true
      and au.role in ('finance', 'admin')
  )
);

revoke all on public.expense_audit_logs from authenticated;
grant select on public.expense_audit_logs to authenticated;

grant execute on function public.get_expense_monthly_summary() to authenticated;
grant execute on function public.get_expense_category_split(date) to authenticated;
grant execute on function public.get_subcategory_movement(date) to authenticated;
revoke execute on function public.get_expense_monthly_summary() from anon;
revoke execute on function public.get_expense_category_split(date) from anon;
revoke execute on function public.get_subcategory_movement(date) from anon;
