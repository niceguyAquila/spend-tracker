alter table public.allowed_users
  add column if not exists display_name text,
  add column if not exists auth_user_id uuid;

alter table public.allowed_users
  drop constraint if exists allowed_users_display_name_check;

alter table public.allowed_users
  add constraint allowed_users_display_name_check
  check (display_name is null or char_length(trim(display_name)) > 0);

create unique index if not exists uq_allowed_users_auth_user_id
  on public.allowed_users(auth_user_id)
  where auth_user_id is not null;
