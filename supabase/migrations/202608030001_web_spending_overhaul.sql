-- Web Spending table overhaul:
-- - wipe existing expense rows (no backfill)
-- - drop sub-category concept entirely
-- - rename note -> description, reference -> remarks
-- - widen amount, add multi-currency
-- - add brand-scoped expense_types and expense_staff lookups
-- - keep entry_direction column name; UI label becomes "Cash flow"

-- 1. Wipe existing data so schema changes need no backfill.
delete from public.expense_audit_logs;
delete from public.expenses;

-- 2. Drop the subcategory-belongs-to-category trigger and function first
--    (they dereference new.subcategory_id and would break every write).
drop trigger if exists trg_expenses_subcategory_category_match on public.expenses;
drop function if exists public.ensure_expense_subcategory_belongs_to_category();

-- 3. Drop the unused subcategory movement RPCs.
drop function if exists public.get_subcategory_movement(uuid, date);
drop function if exists public.get_subcategory_movement(date);

-- 4. Drop indexes that reference subcategory_id / old column names.
drop index if exists idx_expenses_month_subcategory;
drop index if exists uq_expenses_dedupe;

-- 5. Drop the subcategory FK column.
alter table public.expenses drop column if exists subcategory_id;

-- 6. Rename note / reference.
alter table public.expenses rename column note to description;
alter table public.expenses rename column reference to remarks;

-- 7. Widen amount so USDT/TRX fit at 4 decimals.
alter table public.expenses
  alter column amount type numeric(18, 4);

-- 8. Add multi-currency (default IDR for any residual rows; table was wiped above).
alter table public.expenses
  add column if not exists currency_code text not null default 'IDR';

alter table public.expenses drop constraint if exists expenses_currency_code_check;
alter table public.expenses add constraint expenses_currency_code_check
  check (currency_code in ('IDR', 'MYR', 'USDT', 'TRX'));

create index if not exists idx_expenses_brand_currency
  on public.expenses(brand_id, currency_code);

-- 9. Brand-scoped Type lookup.
create table if not exists public.expense_types (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  code text not null,
  name text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expense_types_code_check check (char_length(trim(code)) >= 2),
  constraint expense_types_name_check check (char_length(trim(name)) >= 2)
);

create unique index if not exists uq_expense_types_brand_code
  on public.expense_types(brand_id, lower(trim(code)));
create unique index if not exists uq_expense_types_brand_name
  on public.expense_types(brand_id, lower(trim(name)));
create index if not exists idx_expense_types_brand_active_sort
  on public.expense_types(brand_id, is_active, sort_order, name);

drop trigger if exists trg_expense_types_updated_at on public.expense_types;
create trigger trg_expense_types_updated_at
before update on public.expense_types
for each row execute function public.set_row_updated_at();

alter table public.expense_types enable row level security;
grant select, insert, update, delete on table public.expense_types to authenticated;
grant select, insert, update, delete on table public.expense_types to service_role;

drop policy if exists expense_types_select_authenticated on public.expense_types;
create policy expense_types_select_authenticated
on public.expense_types
for select
to authenticated
using (public.has_brand_role(brand_id, array['viewer', 'finance', 'admin']));

drop policy if exists expense_types_write_finance on public.expense_types;
create policy expense_types_write_finance
on public.expense_types
for all
to authenticated
using (public.has_brand_role(brand_id, array['finance', 'admin']))
with check (public.has_brand_role(brand_id, array['finance', 'admin']));

-- 9b. Brand-scoped Staff lookup.
create table if not exists public.expense_staff (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  code text not null,
  name text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expense_staff_code_check check (char_length(trim(code)) >= 2),
  constraint expense_staff_name_check check (char_length(trim(name)) >= 2)
);

create unique index if not exists uq_expense_staff_brand_code
  on public.expense_staff(brand_id, lower(trim(code)));
create unique index if not exists uq_expense_staff_brand_name
  on public.expense_staff(brand_id, lower(trim(name)));
create index if not exists idx_expense_staff_brand_active_sort
  on public.expense_staff(brand_id, is_active, sort_order, name);

drop trigger if exists trg_expense_staff_updated_at on public.expense_staff;
create trigger trg_expense_staff_updated_at
before update on public.expense_staff
for each row execute function public.set_row_updated_at();

alter table public.expense_staff enable row level security;
grant select, insert, update, delete on table public.expense_staff to authenticated;
grant select, insert, update, delete on table public.expense_staff to service_role;

drop policy if exists expense_staff_select_authenticated on public.expense_staff;
create policy expense_staff_select_authenticated
on public.expense_staff
for select
to authenticated
using (public.has_brand_role(brand_id, array['viewer', 'finance', 'admin']));

drop policy if exists expense_staff_write_finance on public.expense_staff;
create policy expense_staff_write_finance
on public.expense_staff
for all
to authenticated
using (public.has_brand_role(brand_id, array['finance', 'admin']))
with check (public.has_brand_role(brand_id, array['finance', 'admin']));

-- 10. Nullable FKs on expenses (on delete set null so lookups can be deleted).
alter table public.expenses
  add column if not exists type_id uuid null
    references public.expense_types(id) on delete set null;

alter table public.expenses
  add column if not exists staff_id uuid null
    references public.expense_staff(id) on delete set null;

create index if not exists idx_expenses_type on public.expenses(type_id);
create index if not exists idx_expenses_staff on public.expenses(staff_id);

-- 11. Rebuild dedupe. Nullable FKs are coalesced because Postgres treats NULLs
-- as distinct and two type-less rows would otherwise never conflict.
create unique index if not exists uq_expenses_dedupe
  on public.expenses(
    brand_id,
    entry_direction,
    expense_date,
    currency_code,
    amount,
    category_id,
    coalesce(type_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(staff_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(trim(description), ''),
    coalesce(trim(remarks), '')
  );

-- 12. Drop the sub-categories table (policies/indexes/triggers go with it).
drop table if exists public.expense_subcategories cascade;

-- 13. Pocket Web Spending net is IDR-only (pockets are IDR-only).
create or replace function public.get_big_book_pocket_web_spending()
returns table (
  pocket_id uuid,
  brand_id uuid,
  brand_name text,
  net numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id as pocket_id,
    b.id as brand_id,
    b.name as brand_name,
    coalesce((
      select sum(
        case
          when e.entry_direction = 'spending' then -abs(e.amount)
          else abs(e.amount)
        end
      )
      from public.expenses e
      where e.brand_id = b.id
        and e.currency_code = 'IDR'
    ), 0)::numeric as net
  from public.big_book_actor_pockets p
  join public.brands b on b.id = p.linked_brand_id
  where public.is_admin();
$$;

revoke all on function public.get_big_book_pocket_web_spending() from public;
grant execute on function public.get_big_book_pocket_web_spending() to authenticated, service_role;
