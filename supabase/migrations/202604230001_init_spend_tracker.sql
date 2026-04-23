create extension if not exists pgcrypto;

create table if not exists public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expense_categories_code_check check (char_length(trim(code)) > 0),
  constraint expense_categories_name_check check (char_length(trim(name)) > 0)
);

create table if not exists public.expense_subcategories (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.expense_categories(id),
  name text not null,
  normalized_name text generated always as (lower(trim(name))) stored,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expense_subcategories_name_check check (char_length(trim(name)) > 0),
  constraint expense_subcategories_unique_name_per_category unique (category_id, normalized_name)
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null,
  month_key date generated always as ((expense_date - ((extract(day from expense_date)::int - 1) * interval '1 day'))::date) stored,
  amount numeric(14,2) not null check (amount > 0),
  category_id uuid not null references public.expense_categories(id),
  subcategory_id uuid not null references public.expense_subcategories(id),
  note text,
  reference text,
  source text not null default 'manual',
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.expense_audit_logs (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  changed_by uuid,
  changed_at timestamptz not null default now(),
  old_row jsonb,
  new_row jsonb
);

create index if not exists idx_expenses_month_key on public.expenses(month_key);
create index if not exists idx_expenses_month_category on public.expenses(month_key, category_id);
create index if not exists idx_expenses_month_subcategory on public.expenses(month_key, subcategory_id);
create index if not exists idx_expenses_date on public.expenses(expense_date desc);

create unique index if not exists uq_expenses_dedupe
  on public.expenses(expense_date, amount, category_id, subcategory_id, coalesce(trim(note), ''), coalesce(trim(reference), ''));

create index if not exists idx_subcategories_category_active
  on public.expense_subcategories(category_id, is_active);

create or replace function public.ensure_expense_subcategory_belongs_to_category()
returns trigger
language plpgsql
as $$
declare
  expected_category_id uuid;
begin
  select category_id
  into expected_category_id
  from public.expense_subcategories
  where id = new.subcategory_id;

  if expected_category_id is null then
    raise exception 'Sub-category does not exist.';
  end if;

  if expected_category_id <> new.category_id then
    raise exception 'Sub-category must belong to the selected category.';
  end if;

  return new;
end;
$$;

create or replace function public.set_row_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_expense_categories_updated_at on public.expense_categories;
create trigger trg_expense_categories_updated_at
before update on public.expense_categories
for each row execute function public.set_row_updated_at();

drop trigger if exists trg_expense_subcategories_updated_at on public.expense_subcategories;
create trigger trg_expense_subcategories_updated_at
before update on public.expense_subcategories
for each row execute function public.set_row_updated_at();

drop trigger if exists trg_expenses_updated_at on public.expenses;
create trigger trg_expenses_updated_at
before update on public.expenses
for each row execute function public.set_row_updated_at();

drop trigger if exists trg_expenses_subcategory_category_match on public.expenses;
create trigger trg_expenses_subcategory_category_match
before insert or update on public.expenses
for each row execute function public.ensure_expense_subcategory_belongs_to_category();

create or replace function public.audit_expense_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.expense_audit_logs (expense_id, action, changed_by, new_row)
    values (new.id, 'insert', new.created_by, to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.expense_audit_logs (expense_id, action, changed_by, old_row, new_row)
    values (new.id, 'update', new.updated_by, to_jsonb(old), to_jsonb(new));
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.expense_audit_logs (expense_id, action, changed_by, old_row)
    values (old.id, 'delete', old.updated_by, to_jsonb(old));
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_audit_expenses on public.expenses;
create trigger trg_audit_expenses
after insert or update or delete on public.expenses
for each row execute function public.audit_expense_changes();

insert into public.expense_categories (code, name)
values
  ('PENGELUARAN_TETAP', 'Pengeluaran Tetap'),
  ('PENGELUARAN_VARIABLE', 'Pengeluaran Variable'),
  ('BIAYA_BANK', 'Biaya Bank'),
  ('TRANSFER_KELUAR', 'Transfer Keluar')
on conflict (code) do nothing;
