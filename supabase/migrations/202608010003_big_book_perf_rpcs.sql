-- Big Book performance: replace Node-side full-table scans with SQL aggregations
-- and a single-round-trip paged ledger key query. Functions are SECURITY INVOKER
-- (default) so existing admin RLS on business_ledger_entries still applies.

-- ---------------------------------------------------------------------------
-- Actor currency metrics (excludes pocket-tagged rows)
-- ---------------------------------------------------------------------------
create or replace function public.get_big_book_actor_currency_metrics()
returns table (
  actor_id uuid,
  actor_code text,
  actor_display_name text,
  currency_code text,
  net numeric
)
language sql
stable
as $$
  select
    a.id as actor_id,
    a.actor_code::text,
    a.display_name as actor_display_name,
    e.currency_code,
    sum(
      case
        when e.entry_direction = 'spending' then -abs(e.amount)
        else abs(e.amount)
      end
    )::numeric as net
  from public.business_ledger_entries e
  join public.big_book_actors a on a.id = e.responsible_actor_id
  where e.pocket_id is null
  group by a.id, a.actor_code, a.display_name, e.currency_code
  order by a.actor_code, e.currency_code;
$$;

-- ---------------------------------------------------------------------------
-- Actor pocket metrics (driven by pocket list so empty pockets still appear)
-- ---------------------------------------------------------------------------
create or replace function public.get_big_book_actor_pocket_metrics()
returns table (
  actor_id uuid,
  actor_code text,
  actor_display_name text,
  pocket_id uuid,
  pocket_name text,
  is_active boolean,
  net numeric
)
language sql
stable
as $$
  select
    a.id as actor_id,
    a.actor_code::text,
    a.display_name as actor_display_name,
    p.id as pocket_id,
    p.name as pocket_name,
    p.is_active,
    coalesce(sums.net, 0)::numeric as net
  from public.big_book_actor_pockets p
  join public.big_book_actors a on a.id = p.actor_id
  left join (
    select
      e.pocket_id,
      sum(
        case
          when e.entry_direction = 'spending' then -abs(e.amount)
          else abs(e.amount)
        end
      )::numeric as net
    from public.business_ledger_entries e
    where e.pocket_id is not null
    group by e.pocket_id
  ) sums on sums.pocket_id = p.id
  order by a.actor_code, p.sort_order nulls last, p.name;
$$;

-- ---------------------------------------------------------------------------
-- Vendor × actor open-credit outstanding
-- ---------------------------------------------------------------------------
create or replace function public.get_big_book_vendor_actor_outstanding(
  p_actor_ids uuid[] default null,
  p_vendor_ids uuid[] default null,
  p_vendor_type_ids uuid[] default null,
  p_currency_codes text[] default null,
  p_date_from date default null,
  p_date_to date default null
)
returns table (
  vendor_id uuid,
  vendor_name text,
  vendor_type_id uuid,
  vendor_type_name text,
  actor_id uuid,
  actor_code text,
  actor_display_name text,
  currency text,
  outstanding numeric,
  open_credit_count bigint
)
language sql
stable
as $$
  select
    e.vendor_id,
    coalesce(v.name, '(No vendor)') as vendor_name,
    e.vendor_type_id,
    coalesce(vt.name, '-') as vendor_type_name,
    e.responsible_actor_id as actor_id,
    a.actor_code::text,
    a.display_name as actor_display_name,
    e.currency_code as currency,
    sum(abs(e.amount))::numeric as outstanding,
    count(*)::bigint as open_credit_count
  from public.business_ledger_entries e
  join public.big_book_actors a on a.id = e.responsible_actor_id
  left join public.business_ledger_vendors v on v.id = e.vendor_id
  left join public.business_ledger_vendor_types vt on vt.id = e.vendor_type_id
  where e.is_credit = true
    and e.credit_settled_at is null
    and (p_actor_ids is null or e.responsible_actor_id = any(p_actor_ids))
    and (p_vendor_ids is null or e.vendor_id = any(p_vendor_ids))
    and (p_vendor_type_ids is null or e.vendor_type_id = any(p_vendor_type_ids))
    and (p_currency_codes is null or e.currency_code = any(p_currency_codes))
    and (p_date_from is null or e.entry_date >= p_date_from)
    and (p_date_to is null or e.entry_date <= p_date_to)
  group by
    e.vendor_id, v.name, e.vendor_type_id, vt.name,
    e.responsible_actor_id, a.actor_code, a.display_name, e.currency_code
  having sum(abs(e.amount)) > 0
  order by
    case e.currency_code
      when 'IDR' then 0 when 'MYR' then 1 when 'USDT' then 2 when 'TRX' then 3 else 4
    end,
    outstanding desc,
    coalesce(v.name, '(No vendor)'),
    a.display_name;
$$;

-- ---------------------------------------------------------------------------
-- Type cashflow by currency (excludes pocket-tagged rows)
-- ---------------------------------------------------------------------------
create or replace function public.get_big_book_type_cashflow_by_currency(
  p_actor_ids uuid[] default null,
  p_type_ids uuid[] default null,
  p_vendor_type_ids uuid[] default null,
  p_vendor_ids uuid[] default null,
  p_currency_codes text[] default null,
  p_date_from date default null,
  p_date_to date default null
)
returns table (
  currency text,
  actor_id uuid,
  actor_display_name text,
  type_id uuid,
  type_code text,
  type_name text,
  spending numeric,
  profit numeric
)
language sql
stable
as $$
  select
    e.currency_code as currency,
    e.responsible_actor_id as actor_id,
    a.display_name as actor_display_name,
    e.entry_type_id as type_id,
    t.code as type_code,
    t.name as type_name,
    coalesce(sum(case when e.entry_direction = 'spending' then abs(e.amount) else 0 end), 0)::numeric as spending,
    coalesce(sum(case when e.entry_direction = 'profit' then abs(e.amount) else 0 end), 0)::numeric as profit
  from public.business_ledger_entries e
  join public.big_book_actors a on a.id = e.responsible_actor_id
  join public.business_ledger_types t on t.id = e.entry_type_id
  where e.pocket_id is null
    and (p_actor_ids is null or e.responsible_actor_id = any(p_actor_ids))
    and (p_type_ids is null or e.entry_type_id = any(p_type_ids))
    and (p_vendor_type_ids is null or e.vendor_type_id = any(p_vendor_type_ids))
    and (p_vendor_ids is null or e.vendor_id = any(p_vendor_ids))
    and (p_currency_codes is null or e.currency_code = any(p_currency_codes))
    and (p_date_from is null or e.entry_date >= p_date_from)
    and (p_date_to is null or e.entry_date <= p_date_to)
  group by
    e.currency_code, e.responsible_actor_id, a.display_name,
    e.entry_type_id, t.code, t.name
  order by e.currency_code, a.display_name, t.name;
$$;

-- ---------------------------------------------------------------------------
-- Individual type ledger aggregates (server-side; no 3000-row hydrate)
-- ---------------------------------------------------------------------------
create or replace function public.get_big_book_type_ledger_totals(
  p_type_id uuid default null,
  p_date_from date default null,
  p_date_to date default null
)
returns table (
  type_id uuid,
  type_code text,
  type_name text,
  currency_code text,
  spending numeric,
  profit numeric,
  entry_count bigint
)
language sql
stable
as $$
  select
    e.entry_type_id as type_id,
    t.code as type_code,
    t.name as type_name,
    e.currency_code,
    coalesce(sum(case when e.entry_direction = 'spending' then abs(e.amount) else 0 end), 0)::numeric as spending,
    coalesce(sum(case when e.entry_direction = 'profit' then abs(e.amount) else 0 end), 0)::numeric as profit,
    count(*)::bigint as entry_count
  from public.business_ledger_entries e
  join public.business_ledger_types t on t.id = e.entry_type_id
  where e.pocket_id is null
    and (p_type_id is null or e.entry_type_id = p_type_id)
    and (p_date_from is null or e.entry_date >= p_date_from)
    and (p_date_to is null or e.entry_date <= p_date_to)
  group by e.entry_type_id, t.code, t.name, e.currency_code
  order by t.name, e.currency_code;
$$;

-- ---------------------------------------------------------------------------
-- Paged ledger display keys + page/grand currency totals in one round trip.
-- Collapses group_id into a single display row using the same "winning member"
-- rule as lib/big-book/ledger-display-keys.ts.
-- ---------------------------------------------------------------------------
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
      e.explanation,
      e.entry_type_id,
      e.entry_sub_type_id,
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
        when 'sub_type_name' then nullif(trim(st.name), '')
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
    left join public.business_ledger_sub_types st on st.id = e.entry_sub_type_id
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
          ('credit' = any(p_credit_flags) and e.is_credit = true)
          or ('settlement' = any(p_credit_flags) and e.settles_entry_id is not null)
          or ('none' = any(p_credit_flags) and e.is_credit = false and e.settles_entry_id is null)
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
  grand_total_rows as (
    select *
    from filtered f
    where v_pocket_filter_active or f.pocket_id is null
  ),
  page_total_rows as (
    select *
    from page_rows pr
    where v_pocket_filter_active or pr.pocket_id is null
  ),
  currency_totals as (
    select
      'grand'::text as scope,
      g.currency_code as currency,
      coalesce(sum(case when g.entry_direction = 'spending' then g.amount else 0 end), 0)::numeric as spending,
      coalesce(sum(case when g.entry_direction = 'profit' then g.amount else 0 end), 0)::numeric as profit
    from grand_total_rows g
    group by g.currency_code
    union all
    select
      'page'::text as scope,
      p.currency_code as currency,
      coalesce(sum(case when p.entry_direction = 'spending' then p.amount else 0 end), 0)::numeric as spending,
      coalesce(sum(case when p.entry_direction = 'profit' then p.amount else 0 end), 0)::numeric as profit
    from page_total_rows p
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
            order by case ct.currency
              when 'IDR' then 0 when 'MYR' then 1 when 'USDT' then 2 when 'TRX' then 3 else 4
            end
          )
          from currency_totals ct
          where ct.scope = 'page'
        ),
        '[]'::jsonb
      ),
      'grandTotals', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'currency', ct.currency,
              'spending', ct.spending,
              'profit', ct.profit,
              'net', ct.profit - ct.spending
            )
            order by case ct.currency
              when 'IDR' then 0 when 'MYR' then 1 when 'USDT' then 2 when 'TRX' then 3 else 4
            end
          )
          from currency_totals ct
          where ct.scope = 'grand'
        ),
        '[]'::jsonb
      ),
      'pageEntryCount', (select count(*)::integer from page_rows),
      'grandEntryCount', (select count(*)::integer from filtered),
      'pagePocketExcludedCount', (
        select (count(*) - count(*) filter (where v_pocket_filter_active or pocket_id is null))::integer
        from page_rows
      ),
      'grandPocketExcludedCount', (
        select (count(*) - count(*) filter (where v_pocket_filter_active or pocket_id is null))::integer
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

-- Optional trigram index for free-text search (safe if extension missing: create if available).
do $$
begin
  create extension if not exists pg_trgm;
exception
  when insufficient_privilege then
    null;
  when others then
    null;
end $$;

do $$
begin
  create index if not exists idx_business_ledger_entries_explanation_trgm
    on public.business_ledger_entries using gin (explanation gin_trgm_ops);
exception
  when undefined_object then
    null;
  when others then
    null;
end $$;

revoke all on function public.get_big_book_actor_currency_metrics() from anon;
revoke all on function public.get_big_book_actor_pocket_metrics() from anon;
revoke all on function public.get_big_book_vendor_actor_outstanding(uuid[], uuid[], uuid[], text[], date, date) from anon;
revoke all on function public.get_big_book_type_cashflow_by_currency(uuid[], uuid[], uuid[], uuid[], text[], date, date) from anon;
revoke all on function public.get_big_book_type_ledger_totals(uuid, date, date) from anon;
revoke all on function public.get_big_book_ledger_page(integer, integer, text, text, uuid[], text[], text[], uuid[], uuid[], uuid[], uuid[], uuid[], text[], text[], date, date, text) from anon;

grant execute on function public.get_big_book_actor_currency_metrics() to authenticated;
grant execute on function public.get_big_book_actor_pocket_metrics() to authenticated;
grant execute on function public.get_big_book_vendor_actor_outstanding(uuid[], uuid[], uuid[], text[], date, date) to authenticated;
grant execute on function public.get_big_book_type_cashflow_by_currency(uuid[], uuid[], uuid[], uuid[], text[], date, date) to authenticated;
grant execute on function public.get_big_book_type_ledger_totals(uuid, date, date) to authenticated;
grant execute on function public.get_big_book_ledger_page(integer, integer, text, text, uuid[], text[], text[], uuid[], uuid[], uuid[], uuid[], uuid[], text[], text[], date, date, text) to authenticated;
