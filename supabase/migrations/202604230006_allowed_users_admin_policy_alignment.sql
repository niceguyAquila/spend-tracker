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

drop policy if exists allowed_users_write_admin on public.allowed_users;
create policy allowed_users_write_admin
on public.allowed_users
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());
