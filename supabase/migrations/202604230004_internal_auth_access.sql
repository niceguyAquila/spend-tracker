create table if not exists public.allowed_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  normalized_email text generated always as (lower(trim(email))) stored,
  role text not null check (role in ('admin', 'finance', 'viewer')),
  is_active boolean not null default true,
  invited_by uuid,
  invited_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint allowed_users_email_check check (position('@' in email) > 1)
);

create unique index if not exists uq_allowed_users_normalized_email on public.allowed_users(normalized_email);

drop trigger if exists trg_allowed_users_updated_at on public.allowed_users;
create trigger trg_allowed_users_updated_at
before update on public.allowed_users
for each row execute function public.set_row_updated_at();

alter table public.allowed_users enable row level security;

grant usage on schema public to service_role;
grant select, insert, update, delete on table public.allowed_users to service_role;
grant usage on schema public to authenticated;
grant select on table public.allowed_users to authenticated;

drop policy if exists allowed_users_select_self_or_admin on public.allowed_users;
create policy allowed_users_select_self_or_admin
on public.allowed_users
for select
to authenticated
using (
  normalized_email = lower(coalesce(auth.jwt() ->> 'email', ''))
  or public.is_finance_or_admin()
);

drop policy if exists allowed_users_write_admin on public.allowed_users;
create policy allowed_users_write_admin
on public.allowed_users
for all
to authenticated
using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin')
with check ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

-- Override role helper to read from allowed_users instead of JWT metadata.
-- This keeps RLS aligned with internal allowlist role management.
create or replace function public.is_finance_or_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  current_role text;
begin
  select role
  into current_role
  from public.allowed_users
  where normalized_email = lower(coalesce(auth.jwt() ->> 'email', ''))
    and is_active = true
  limit 1;

  return current_role in ('finance', 'admin');
end;
$$;

revoke all on function public.is_finance_or_admin() from public;
grant execute on function public.is_finance_or_admin() to authenticated, service_role;
