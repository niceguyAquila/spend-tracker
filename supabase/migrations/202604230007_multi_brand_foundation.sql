create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint brands_code_check check (char_length(trim(code)) > 0),
  constraint brands_name_check check (char_length(trim(name)) > 0)
);

drop trigger if exists trg_brands_updated_at on public.brands;
create trigger trg_brands_updated_at
before update on public.brands
for each row execute function public.set_row_updated_at();

insert into public.brands (code, name)
values ('ZENPLAY', 'ZenPlay')
on conflict (code) do nothing;

create table if not exists public.user_brand_roles (
  id uuid primary key default gen_random_uuid(),
  allowed_user_id uuid not null references public.allowed_users(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  role text not null check (role in ('admin', 'finance', 'viewer')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_brand_roles_unique_user_brand unique (allowed_user_id, brand_id)
);

drop trigger if exists trg_user_brand_roles_updated_at on public.user_brand_roles;
create trigger trg_user_brand_roles_updated_at
before update on public.user_brand_roles
for each row execute function public.set_row_updated_at();

do $$
declare
  zenplay_brand_id uuid;
begin
  select id into zenplay_brand_id from public.brands where code = 'ZENPLAY' limit 1;

  alter table public.expense_categories add column if not exists brand_id uuid references public.brands(id);
  alter table public.expense_subcategories add column if not exists brand_id uuid references public.brands(id);
  alter table public.expenses add column if not exists brand_id uuid references public.brands(id);
  alter table public.expense_audit_logs add column if not exists brand_id uuid references public.brands(id);

  update public.expense_categories set brand_id = zenplay_brand_id where brand_id is null;
  update public.expense_subcategories set brand_id = zenplay_brand_id where brand_id is null;
  update public.expenses set brand_id = zenplay_brand_id where brand_id is null;
  update public.expense_audit_logs set brand_id = zenplay_brand_id where brand_id is null;

  alter table public.expense_categories alter column brand_id set not null;
  alter table public.expense_subcategories alter column brand_id set not null;
  alter table public.expenses alter column brand_id set not null;
  alter table public.expense_audit_logs alter column brand_id set not null;
end $$;

create index if not exists idx_expense_categories_brand on public.expense_categories(brand_id);
create index if not exists idx_expense_subcategories_brand on public.expense_subcategories(brand_id);
create index if not exists idx_expenses_brand on public.expenses(brand_id);
create index if not exists idx_expense_audit_logs_brand on public.expense_audit_logs(brand_id);
create index if not exists idx_user_brand_roles_brand on public.user_brand_roles(brand_id);
create index if not exists idx_user_brand_roles_user on public.user_brand_roles(allowed_user_id);

alter table public.expense_categories drop constraint if exists expense_categories_code_key;
alter table public.expense_categories drop constraint if exists expense_categories_name_key;

create unique index if not exists uq_expense_categories_brand_code
  on public.expense_categories(brand_id, code);
create unique index if not exists uq_expense_categories_brand_name
  on public.expense_categories(brand_id, name);

drop index if exists uq_expenses_dedupe;
create unique index if not exists uq_expenses_dedupe
  on public.expenses(brand_id, expense_date, amount, category_id, subcategory_id, coalesce(trim(note), ''), coalesce(trim(reference), ''));

create or replace function public.ensure_expense_subcategory_belongs_to_category()
returns trigger
language plpgsql
as $$
declare
  expected_category_id uuid;
  expected_brand_id uuid;
begin
  select category_id, brand_id
  into expected_category_id, expected_brand_id
  from public.expense_subcategories
  where id = new.subcategory_id;

  if expected_category_id is null then
    raise exception 'Sub-category does not exist.';
  end if;

  if expected_category_id <> new.category_id then
    raise exception 'Sub-category must belong to the selected category.';
  end if;

  if expected_brand_id <> new.brand_id then
    raise exception 'Sub-category must belong to the selected brand.';
  end if;

  return new;
end;
$$;

create or replace function public.audit_expense_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.expense_audit_logs (expense_id, brand_id, action, changed_by, new_row)
    values (new.id, new.brand_id, 'insert', new.created_by, to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.expense_audit_logs (expense_id, brand_id, action, changed_by, old_row, new_row)
    values (new.id, new.brand_id, 'update', new.updated_by, to_jsonb(old), to_jsonb(new));
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.expense_audit_logs (expense_id, brand_id, action, changed_by, old_row)
    values (old.id, old.brand_id, 'delete', old.updated_by, to_jsonb(old));
    return old;
  end if;
  return null;
end;
$$;

insert into public.user_brand_roles (allowed_user_id, brand_id, role, is_active)
select au.id, b.id, au.role, au.is_active
from public.allowed_users au
cross join lateral (
  select id from public.brands where code = 'ZENPLAY' limit 1
) b
on conflict (allowed_user_id, brand_id) do update
set role = excluded.role,
    is_active = excluded.is_active;
