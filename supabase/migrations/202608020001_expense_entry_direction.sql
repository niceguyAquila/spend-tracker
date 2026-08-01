-- Add entry_direction to expenses so Web Spending can record inflow (profit)
-- as well as outflow (spending). Sign comes from direction; amount stays > 0.

alter table public.expenses
  add column if not exists entry_direction text not null default 'spending';

alter table public.expenses drop constraint if exists expenses_entry_direction_check;
alter table public.expenses add constraint expenses_entry_direction_check
  check (entry_direction in ('spending', 'profit'));

-- Rebuild dedupe so an In and an Out of the same date/amount/category can coexist.
drop index if exists uq_expenses_dedupe;
create unique index if not exists uq_expenses_dedupe
  on public.expenses(
    brand_id,
    entry_direction,
    expense_date,
    amount,
    category_id,
    subcategory_id,
    coalesce(trim(note), ''),
    coalesce(trim(reference), '')
  );

create index if not exists idx_expenses_brand_direction
  on public.expenses(brand_id, entry_direction);
