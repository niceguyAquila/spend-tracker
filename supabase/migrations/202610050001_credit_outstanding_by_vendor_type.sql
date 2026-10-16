-- Credit outstanding: bucket by Vendor Type + Actor + Currency (parallel to Future Credit by ledger Type).

drop function if exists public.get_big_book_vendor_actor_outstanding(uuid[], uuid[], uuid[], text[], date, date);

create or replace function public.get_big_book_vendor_actor_outstanding(
  p_actor_ids uuid[] default null,
  p_vendor_ids uuid[] default null,
  p_vendor_type_ids uuid[] default null,
  p_currency_codes text[] default null,
  p_date_from date default null,
  p_date_to date default null
)
returns table (
  vendor_type_id uuid,
  vendor_type_name text,
  actor_id uuid,
  actor_code text,
  actor_display_name text,
  currency text,
  outstanding numeric,
  open_credit_count bigint,
  open_future_credit_count bigint
)
language sql
stable
as $$
  select
    e.vendor_type_id,
    coalesce(vt.name, '-') as vendor_type_name,
    e.responsible_actor_id as actor_id,
    a.actor_code::text,
    a.display_name as actor_display_name,
    e.currency_code as currency,
    sum(abs(e.amount))::numeric as outstanding,
    count(*)::bigint as open_credit_count,
    0::bigint as open_future_credit_count
  from public.business_ledger_entries e
  join public.big_book_actors a on a.id = e.responsible_actor_id
  left join public.business_ledger_vendor_types vt on vt.id = e.vendor_type_id
  where e.is_credit = true
    and e.is_future_credit = false
    and e.credit_settled_at is null
    and (p_actor_ids is null or e.responsible_actor_id = any(p_actor_ids))
    and (p_vendor_ids is null or e.vendor_id = any(p_vendor_ids))
    and (p_vendor_type_ids is null or e.vendor_type_id = any(p_vendor_type_ids))
    and (p_currency_codes is null or e.currency_code = any(p_currency_codes))
    and (p_date_from is null or e.entry_date >= p_date_from)
    and (p_date_to is null or e.entry_date <= p_date_to)
  group by
    e.vendor_type_id, vt.name,
    e.responsible_actor_id, a.actor_code, a.display_name, e.currency_code
  having sum(abs(e.amount)) > 0
  order by
    case e.currency_code
      when 'IDR' then 0 when 'MYR' then 1 when 'USDT' then 2 when 'TRX' then 3 else 4
    end,
    outstanding desc,
    coalesce(vt.name, '-'),
    a.display_name;
$$;

revoke all on function public.get_big_book_vendor_actor_outstanding(uuid[], uuid[], uuid[], text[], date, date) from anon;
grant execute on function public.get_big_book_vendor_actor_outstanding(uuid[], uuid[], uuid[], text[], date, date) to authenticated;
