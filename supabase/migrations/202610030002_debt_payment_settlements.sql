-- Debt payment settlements (option A):
-- 1) Allow settles_entry_id to target open debt (as well as credit).
-- 2) Exclude is_debt obligation rows from cash-impact metric RPCs / ledger totals.
-- 3) Debt obligation rows must be Out (spending).

-- ---------------------------------------------------------------------------
-- Debt obligations are always Out cash-flow direction
-- ---------------------------------------------------------------------------
alter table public.business_ledger_entries
  drop constraint if exists business_ledger_entries_debt_requires_spending;
alter table public.business_ledger_entries
  add constraint business_ledger_entries_debt_requires_spending
    check (not is_debt or entry_direction = 'spending');

-- ---------------------------------------------------------------------------
-- Settlement target may be credit OR debt (not a settlement chain)
-- ---------------------------------------------------------------------------
create or replace function public.business_ledger_entry_settlement_valid()
returns trigger
language plpgsql
as $$
declare
  target_is_credit boolean;
  target_is_debt boolean;
  target_settles_entry_id uuid;
begin
  if NEW.settles_entry_id is null then
    return NEW;
  end if;

  if NEW.settles_entry_id = NEW.id then
    raise exception 'settles_entry_id cannot reference the same entry (%)', NEW.id;
  end if;

  if NEW.is_credit then
    raise exception 'a settlement entry cannot also be marked as credit';
  end if;

  if NEW.is_debt then
    raise exception 'a settlement entry cannot also be marked as debt';
  end if;

  select e.is_credit, e.is_debt, e.settles_entry_id
  into target_is_credit, target_is_debt, target_settles_entry_id
  from public.business_ledger_entries e
  where e.id = NEW.settles_entry_id;

  if target_is_credit is null then
    raise exception 'settlement target entry % not found', NEW.settles_entry_id;
  end if;

  if not target_is_credit and not target_is_debt then
    raise exception 'settlement target entry % is not marked as credit or debt', NEW.settles_entry_id;
  end if;

  if target_is_credit and target_is_debt then
    raise exception 'settlement target entry % cannot be both credit and debt', NEW.settles_entry_id;
  end if;

  if target_settles_entry_id is not null then
    raise exception 'settlement target entry % is itself a settlement (chains are not allowed)', NEW.settles_entry_id;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_business_ledger_entry_settlement_valid
  on public.business_ledger_entries;
create trigger trg_business_ledger_entry_settlement_valid
before insert or update on public.business_ledger_entries
for each row execute function public.business_ledger_entry_settlement_valid();

-- ---------------------------------------------------------------------------
-- Actor currency metrics — exclude debt obligations (cash impact only)
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
    and e.is_debt = false
  group by a.id, a.actor_code, a.display_name, e.currency_code
  order by a.actor_code, e.currency_code;
$$;

-- ---------------------------------------------------------------------------
-- Actor pocket metrics — exclude debt obligations
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
      and e.is_debt = false
    group by e.pocket_id
  ) sums on sums.pocket_id = p.id
  order by a.actor_code, p.sort_order nulls last, p.name;
$$;

-- ---------------------------------------------------------------------------
-- Type cashflow — exclude debt obligations
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
    and e.is_debt = false
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
-- Type ledger totals — exclude debt obligations
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
    and e.is_debt = false
    and (p_type_id is null or e.entry_type_id = p_type_id)
    and (p_date_from is null or e.entry_date >= p_date_from)
    and (p_date_to is null or e.entry_date <= p_date_to)
  group by e.entry_type_id, t.code, t.name, e.currency_code
  order by t.name, e.currency_code;
$$;

-- ---------------------------------------------------------------------------
-- Ledger page totals — exclude debt obligations from cash totals
-- (Debt rows still appear in the ledger list / entry counts.)
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
      e.is_debt,
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
    where (v_pocket_filter_active or f.pocket_id is null)
      and f.is_debt = false
  ),
  page_total_rows as (
    select *
    from page_rows pr
    where (v_pocket_filter_active or pr.pocket_id is null)
      and pr.is_debt = false
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
