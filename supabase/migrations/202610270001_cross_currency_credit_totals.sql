-- Cross-currency credit settlements stay on the ledger.
-- Totals count the payment in its currency and only the uncovered remainder
-- of the credit. Same-currency settlements are unchanged. Applied amounts
-- that were never recorded are not guessed.

create or replace function public.get_big_book_ledger_page(
  p_page integer default 0,
  p_page_size integer default 20,
  p_sort_by text default 'entry_date',
  p_sort_dir text default 'desc',
  p_type_ids uuid[] default null,
  p_currency_codes text[] default null,
  p_directions text[] default null,
  p_actor_ids uuid[] default null,
  p_vendor_type_ids uuid[] default null,
  p_vendor_ids uuid[] default null,
  p_pocket_ids uuid[] default null,
  p_action_by_ids uuid[] default null,
  p_credit_flags text[] default null,
  p_credit_statuses text[] default null,
  p_date_from date default null,
  p_date_to date default null,
  p_query text default null
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_page integer := greatest(0, coalesce(p_page, 0));
  v_page_size integer := greatest(1, coalesce(p_page_size, 20));
  v_sort_by text := coalesce(nullif(trim(p_sort_by), ''), 'entry_date');
  v_sort_dir text := case when lower(coalesce(p_sort_dir, 'desc')) = 'asc' then 'asc' else 'desc' end;
  v_pocket_filter_active boolean := p_pocket_ids is not null and cardinality(p_pocket_ids) > 0;
  v_query text := nullif(trim(coalesce(p_query, '')), '');
  v_result jsonb;
begin
  with filtered as (
    select
      e.id,
      e.group_id,
      e.entry_date,
      e.created_at,
      e.amount,
      e.currency_code,
      e.entry_direction,
      e.pocket_id,
      e.is_credit,
      e.is_debt,
      e.is_future_credit,
      e.explanation,
      e.entry_type_id,
      e.vendor_type_id,
      e.vendor_id,
      e.action_by_id,
      e.responsible_actor_id,
      case v_sort_by
        when 'entry_date' then e.entry_date::text
        when 'entry_direction' then e.entry_direction
        when 'explanation' then nullif(trim(e.explanation), '')
        when 'amount' then null
        when 'type_name' then nullif(trim(t.name), '')
        when 'vendor_type_name' then nullif(trim(vt.name), '')
        when 'vendor_name' then nullif(trim(v.name), '')
        when 'actor_display_name' then nullif(trim(a.display_name), '')
        when 'action_by_name' then nullif(trim(ab.name), '')
        when 'pocket_name' then nullif(trim(p.name), '')
        else e.entry_date::text
      end as sort_value_text,
      case when v_sort_by = 'amount' then e.amount else null end as sort_value_num
    from public.business_ledger_entries e
    left join public.business_ledger_types t on t.id = e.entry_type_id
    left join public.business_ledger_vendor_types vt on vt.id = e.vendor_type_id
    left join public.business_ledger_vendors v on v.id = e.vendor_id
    left join public.big_book_actors a on a.id = e.responsible_actor_id
    left join public.business_ledger_action_by ab on ab.id = e.action_by_id
    left join public.big_book_actor_pockets p on p.id = e.pocket_id
    where (p_type_ids is null or e.entry_type_id = any(p_type_ids))
      and (p_currency_codes is null or e.currency_code = any(p_currency_codes))
      and (p_directions is null or e.entry_direction = any(p_directions))
      and (p_actor_ids is null or e.responsible_actor_id = any(p_actor_ids))
      and (p_vendor_type_ids is null or e.vendor_type_id = any(p_vendor_type_ids))
      and (p_vendor_ids is null or e.vendor_id = any(p_vendor_ids))
      and (p_pocket_ids is null or e.pocket_id = any(p_pocket_ids))
      and (p_action_by_ids is null or e.action_by_id = any(p_action_by_ids))
      and (p_date_from is null or e.entry_date >= p_date_from)
      and (p_date_to is null or e.entry_date <= p_date_to)
      and (
        v_query is null
        or e.explanation ilike '%' || v_query || '%'
        or coalesce(e.remark, '') ilike '%' || v_query || '%'
      )
      and (
        p_credit_flags is null
        or (
          ('credit' = any(p_credit_flags) and e.is_credit = true and e.is_future_credit = false)
          or ('future_credit' = any(p_credit_flags) and e.is_credit = true and e.is_future_credit = true)
          or (
            'settlement' = any(p_credit_flags)
            and exists (
              select 1 from public.business_ledger_settlement_allocations sa
              where sa.payment_entry_id = e.id
            )
          )
          or (
            'none' = any(p_credit_flags)
            and e.is_credit = false
            and not exists (
              select 1 from public.business_ledger_settlement_allocations sa
              where sa.payment_entry_id = e.id
            )
          )
        )
      )
      and (
        p_credit_statuses is null
        or (
          ('open' = any(p_credit_statuses) and e.is_credit = true and e.credit_settled_at is null)
          or ('settled' = any(p_credit_statuses) and e.credit_settled_at is not null)
        )
      )
  ),
  group_winners as (
    select distinct on (f.group_id)
      f.group_id as id,
      'group'::text as kind,
      f.entry_date as sort_date,
      f.created_at as sort_created_at,
      f.sort_value_text,
      f.sort_value_num,
      f.currency_code as sort_currency
    from filtered f
    where f.group_id is not null
    order by
      f.group_id,
      case
        when v_sort_by = 'amount' then
          case when f.sort_value_num is null then 1 else 0 end
        else
          case when f.sort_value_text is null or trim(f.sort_value_text) = '' then 1 else 0 end
      end,
      case when v_sort_dir = 'asc' and v_sort_by = 'amount' then f.sort_value_num end asc nulls last,
      case when v_sort_dir = 'desc' and v_sort_by = 'amount' then f.sort_value_num end desc nulls last,
      case when v_sort_dir = 'asc' and v_sort_by <> 'amount' then lower(f.sort_value_text) end asc nulls last,
      case when v_sort_dir = 'desc' and v_sort_by <> 'amount' then lower(f.sort_value_text) end desc nulls last,
      case when v_sort_dir = 'asc' then f.entry_date end asc,
      case when v_sort_dir = 'desc' then f.entry_date end desc,
      case when v_sort_dir = 'asc' then f.created_at end asc,
      case when v_sort_dir = 'desc' then f.created_at end desc,
      f.id
  ),
  standalone as (
    select
      f.id,
      'entry'::text as kind,
      f.entry_date as sort_date,
      f.created_at as sort_created_at,
      f.sort_value_text,
      f.sort_value_num,
      f.currency_code as sort_currency
    from filtered f
    where f.group_id is null
  ),
  display_keys as (
    select * from standalone
    union all
    select * from group_winners
  ),
  ordered_keys as (
    select
      dk.*,
      count(*) over ()::integer as total_count,
      row_number() over (
        order by
          case
            when v_sort_by = 'amount' then
              case when dk.sort_value_num is null then 1 else 0 end
            else
              case when dk.sort_value_text is null or trim(dk.sort_value_text) = '' then 1 else 0 end
          end,
          case when v_sort_dir = 'asc' and v_sort_by = 'amount' then dk.sort_value_num end asc nulls last,
          case when v_sort_dir = 'desc' and v_sort_by = 'amount' then dk.sort_value_num end desc nulls last,
          case when v_sort_by = 'amount' then dk.sort_currency end asc,
          case when v_sort_dir = 'asc' and v_sort_by <> 'amount' then lower(dk.sort_value_text) end asc nulls last,
          case when v_sort_dir = 'desc' and v_sort_by <> 'amount' then lower(dk.sort_value_text) end desc nulls last,
          dk.sort_date desc,
          dk.sort_created_at desc,
          dk.id
      ) as rn
    from display_keys dk
  ),
  page_keys as (
    select kind, id, sort_date, total_count
    from ordered_keys
    where rn > v_page * v_page_size
      and rn <= (v_page + 1) * v_page_size
  ),
  page_entry_ids as (
    select id from page_keys where kind = 'entry'
  ),
  page_group_ids as (
    select id from page_keys where kind = 'group'
  ),
  page_rows as (
    select f.*
    from filtered f
    where (f.group_id is null and f.id in (select id from page_entry_ids))
       or (f.group_id is not null and f.group_id in (select id from page_group_ids))
  ),
  cross_currency_applied as (
    select
      a.obligation_entry_id,
      coalesce(sum(a.applied_amount), 0) as applied
    from public.business_ledger_settlement_allocations a
    join filtered obligation on obligation.id = a.obligation_entry_id
    join public.business_ledger_entries payment on payment.id = a.payment_entry_id
    where obligation.is_credit
      and not obligation.is_future_credit
      and not obligation.is_debt
      and payment.currency_code <> obligation.currency_code
      and a.applied_amount is not null
    group by a.obligation_entry_id
  ),
  grand_total_rows as (
    select
      f.*,
      case
        when f.is_credit then greatest(0, f.amount - coalesce(x.applied, 0))
        else f.amount
      end as counted_amount
    from filtered f
    left join cross_currency_applied x on x.obligation_entry_id = f.id
    where (v_pocket_filter_active or f.pocket_id is null)
      and f.is_debt = false
      and f.is_future_credit = false
  ),
  page_total_rows as (
    select
      pr.*,
      case
        when pr.is_credit then greatest(0, pr.amount - coalesce(x.applied, 0))
        else pr.amount
      end as counted_amount
    from page_rows pr
    left join cross_currency_applied x on x.obligation_entry_id = pr.id
    where (v_pocket_filter_active or pr.pocket_id is null)
      and pr.is_debt = false
      and pr.is_future_credit = false
  ),
  currency_totals as (
    select
      'grand'::text as scope,
      g.currency_code as currency,
      coalesce(sum(case when g.entry_direction = 'spending' then g.counted_amount else 0 end), 0)::numeric as spending,
      coalesce(sum(case when g.entry_direction = 'profit' then g.counted_amount else 0 end), 0)::numeric as profit
    from grand_total_rows g
    where g.counted_amount <> 0
    group by g.currency_code
    union all
    select
      'page'::text as scope,
      p.currency_code as currency,
      coalesce(sum(case when p.entry_direction = 'spending' then p.counted_amount else 0 end), 0)::numeric as spending,
      coalesce(sum(case when p.entry_direction = 'profit' then p.counted_amount else 0 end), 0)::numeric as profit
    from page_total_rows p
    where p.counted_amount <> 0
    group by p.currency_code
  )
  select jsonb_build_object(
    'totalCount', coalesce((select total_count from ordered_keys limit 1), 0),
    'pageKeys', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('kind', pk.kind, 'id', pk.id, 'sort_date', pk.sort_date)
          order by pk.sort_date desc, pk.id
        )
        from (
          select ok.kind, ok.id, ok.sort_date, ok.rn
          from ordered_keys ok
          where ok.rn > v_page * v_page_size
            and ok.rn <= (v_page + 1) * v_page_size
          order by ok.rn
        ) pk
      ),
      '[]'::jsonb
    ),
    'totals', jsonb_build_object(
      'pageTotals', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'currency', ct.currency,
              'spending', ct.spending,
              'profit', ct.profit,
              'net', ct.profit - ct.spending
            )
            order by
              case ct.currency
                when 'IDR' then 0 when 'MYR' then 1 when 'USDT' then 2 when 'TRX' then 3 else 4
              end
          )
          from currency_totals ct
          where ct.scope = 'page'
        ),
        '[]'::jsonb
      ),
      'pageEntryCount', (select count(*)::integer from page_rows),
      'grandTotals', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'currency', ct.currency,
              'spending', ct.spending,
              'profit', ct.profit,
              'net', ct.profit - ct.spending
            )
            order by
              case ct.currency
                when 'IDR' then 0 when 'MYR' then 1 when 'USDT' then 2 when 'TRX' then 3 else 4
              end
          )
          from currency_totals ct
          where ct.scope = 'grand'
        ),
        '[]'::jsonb
      ),
      'grandEntryCount', (select count(*)::integer from filtered),
      'pagePocketExcludedCount', (
        select (count(*) - count(*) filter (
          where v_pocket_filter_active or pocket_id is null
        ))::integer
        from page_rows
      ),
      'grandPocketExcludedCount', (
        select (count(*) - count(*) filter (
          where v_pocket_filter_active or pocket_id is null
        ))::integer
        from filtered
      )
    )
  )
  into v_result;

  return coalesce(v_result, jsonb_build_object(
    'totalCount', 0,
    'pageKeys', '[]'::jsonb,
    'totals', jsonb_build_object(
      'pageTotals', '[]'::jsonb,
      'grandTotals', '[]'::jsonb,
      'pageEntryCount', 0,
      'grandEntryCount', 0,
      'pagePocketExcludedCount', 0,
      'grandPocketExcludedCount', 0
    )
  ));
end;
$$;

