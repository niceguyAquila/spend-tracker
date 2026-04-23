create or replace function public.get_expense_monthly_summary()
returns table (
  month_key date,
  total_amount numeric
)
language sql
stable
as $$
  select e.month_key, sum(e.amount)::numeric as total_amount
  from public.expenses e
  group by e.month_key
  order by e.month_key;
$$;

create or replace function public.get_expense_category_split(input_month date default null)
returns table (
  category_name text,
  total_amount numeric
)
language sql
stable
as $$
  select c.name as category_name, coalesce(sum(e.amount), 0)::numeric as total_amount
  from public.expense_categories c
  left join public.expenses e
    on e.category_id = c.id
    and (input_month is null or e.month_key = input_month)
  where c.is_active = true
  group by c.name
  order by total_amount desc;
$$;

create or replace function public.get_subcategory_movement(input_month date default null)
returns table (
  subcategory_name text,
  delta_amount numeric
)
language sql
stable
as $$
with month_reference as (
  select coalesce(input_month, date_trunc('month', now())::date) as selected_month
),
current_period as (
  select e.subcategory_id, sum(e.amount)::numeric as total_amount
  from public.expenses e
  cross join month_reference mr
  where e.month_key = mr.selected_month
  group by e.subcategory_id
),
previous_period as (
  select e.subcategory_id, sum(e.amount)::numeric as total_amount
  from public.expenses e
  cross join month_reference mr
  where e.month_key = (mr.selected_month - interval '1 month')::date
  group by e.subcategory_id
)
select
  s.name as subcategory_name,
  (coalesce(cp.total_amount, 0) - coalesce(pp.total_amount, 0))::numeric as delta_amount
from public.expense_subcategories s
left join current_period cp on cp.subcategory_id = s.id
left join previous_period pp on pp.subcategory_id = s.id
where s.is_active = true
order by delta_amount desc;
$$;
