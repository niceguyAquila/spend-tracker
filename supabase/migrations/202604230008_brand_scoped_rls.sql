alter table public.brands enable row level security;
alter table public.user_brand_roles enable row level security;

grant select on table public.brands to authenticated;
grant select on table public.user_brand_roles to authenticated;
grant insert, update, delete on table public.brands to authenticated;
grant insert, update, delete on table public.user_brand_roles to authenticated;
grant select, insert, update, delete on table public.brands to service_role;
grant select, insert, update, delete on table public.user_brand_roles to service_role;

create or replace function public.is_admin()
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
      and au.role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, service_role;

create or replace function public.current_allowed_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select au.id
  from public.allowed_users au
  where au.normalized_email = lower(coalesce(auth.jwt() ->> 'email', ''))
    and au.is_active = true
  limit 1;
$$;

create or replace function public.has_brand_role(input_brand_id uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_brand_roles ubr
    where ubr.allowed_user_id = public.current_allowed_user_id()
      and ubr.brand_id = input_brand_id
      and ubr.is_active = true
      and ubr.role = any (allowed_roles)
  );
$$;

create or replace function public.is_finance_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_brand_roles ubr
    where ubr.allowed_user_id = public.current_allowed_user_id()
      and ubr.is_active = true
      and ubr.role in ('finance', 'admin')
  );
$$;

revoke all on function public.current_allowed_user_id() from public;
grant execute on function public.current_allowed_user_id() to authenticated, service_role;
revoke all on function public.has_brand_role(uuid, text[]) from public;
grant execute on function public.has_brand_role(uuid, text[]) to authenticated, service_role;
revoke all on function public.is_finance_or_admin() from public;
grant execute on function public.is_finance_or_admin() to authenticated, service_role;

drop policy if exists brands_select_authenticated on public.brands;
create policy brands_select_authenticated
on public.brands
for select
to authenticated
using (
  exists (
    select 1
    from public.user_brand_roles ubr
    where ubr.brand_id = brands.id
      and ubr.allowed_user_id = public.current_allowed_user_id()
      and ubr.is_active = true
  )
);

drop policy if exists brands_write_admin on public.brands;
create policy brands_write_admin
on public.brands
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists user_brand_roles_select_self_or_admin on public.user_brand_roles;
create policy user_brand_roles_select_self_or_admin
on public.user_brand_roles
for select
to authenticated
using (
  allowed_user_id = public.current_allowed_user_id()
  or public.is_admin()
);

drop policy if exists user_brand_roles_write_admin on public.user_brand_roles;
create policy user_brand_roles_write_admin
on public.user_brand_roles
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists category_select_authenticated on public.expense_categories;
create policy category_select_authenticated
on public.expense_categories
for select
to authenticated
using (public.has_brand_role(brand_id, array['viewer', 'finance', 'admin']));

drop policy if exists category_write_finance on public.expense_categories;
create policy category_write_finance
on public.expense_categories
for all
to authenticated
using (public.has_brand_role(brand_id, array['finance', 'admin']))
with check (public.has_brand_role(brand_id, array['finance', 'admin']));

drop policy if exists subcategory_select_authenticated on public.expense_subcategories;
create policy subcategory_select_authenticated
on public.expense_subcategories
for select
to authenticated
using (public.has_brand_role(brand_id, array['viewer', 'finance', 'admin']));

drop policy if exists subcategory_write_finance on public.expense_subcategories;
create policy subcategory_write_finance
on public.expense_subcategories
for all
to authenticated
using (public.has_brand_role(brand_id, array['finance', 'admin']))
with check (public.has_brand_role(brand_id, array['finance', 'admin']));

drop policy if exists expenses_select_authenticated on public.expenses;
create policy expenses_select_authenticated
on public.expenses
for select
to authenticated
using (public.has_brand_role(brand_id, array['viewer', 'finance', 'admin']));

drop policy if exists expenses_insert_finance on public.expenses;
create policy expenses_insert_finance
on public.expenses
for insert
to authenticated
with check (public.has_brand_role(brand_id, array['finance', 'admin']));

drop policy if exists expenses_update_finance on public.expenses;
create policy expenses_update_finance
on public.expenses
for update
to authenticated
using (public.has_brand_role(brand_id, array['finance', 'admin']))
with check (public.has_brand_role(brand_id, array['finance', 'admin']));

drop policy if exists expenses_delete_finance on public.expenses;
create policy expenses_delete_finance
on public.expenses
for delete
to authenticated
using (public.has_brand_role(brand_id, array['finance', 'admin']));

drop policy if exists audit_select_finance on public.expense_audit_logs;
create policy audit_select_finance
on public.expense_audit_logs
for select
to authenticated
using (public.has_brand_role(brand_id, array['finance', 'admin']));
