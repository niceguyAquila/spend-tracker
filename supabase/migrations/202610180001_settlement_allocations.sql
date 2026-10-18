-- Settlement allocations: one payment row may cover many obligations.
-- business_ledger_settlement_allocations becomes the only payment -> obligation link.
-- settles_entry_id and settlement_amount_in_credit_currency are backfilled into it
-- and dropped. Only big_book_record_settlement and big_book_delete_entry write links.

-- ---------------------------------------------------------------------------
-- Idempotency: one row per client request id
-- ---------------------------------------------------------------------------
create table public.business_ledger_settlement_requests (
  id uuid primary key,
  request_hash text not null,
  requested_obligation_ids uuid[] not null,
  group_id uuid null
    references public.business_ledger_entry_groups(id) on delete set null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.business_ledger_settlement_requests enable row level security;

revoke insert, update, delete on table public.business_ledger_settlement_requests from anon, authenticated;
grant select on table public.business_ledger_settlement_requests to authenticated;

create policy business_ledger_settlement_requests_select_admin
on public.business_ledger_settlement_requests
for select
to authenticated
using (public.is_admin());

alter table public.business_ledger_entries
  add column settlement_request_id uuid null
    references public.business_ledger_settlement_requests(id) on delete restrict;

create index idx_business_ledger_entries_settlement_request
  on public.business_ledger_entries(settlement_request_id)
  where settlement_request_id is not null;

-- ---------------------------------------------------------------------------
-- Allocations: payment -> obligation, applied amount in the obligation currency
-- ---------------------------------------------------------------------------
create table public.business_ledger_settlement_allocations (
  payment_entry_id uuid not null
    references public.business_ledger_entries(id) on delete cascade,
  -- NO ACTION (checked at end of statement): a group cascade that removes the
  -- payment and the obligation together passes; deleting a paid obligation alone fails.
  obligation_entry_id uuid not null
    references public.business_ledger_entries(id) on delete no action,
  applied_amount numeric(18, 4) null,
  is_backfilled_unconverted boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (payment_entry_id, obligation_entry_id),
  constraint settlement_allocations_no_self
    check (payment_entry_id <> obligation_entry_id),
  constraint settlement_allocations_applied_positive
    check (applied_amount is null or applied_amount > 0),
  constraint settlement_allocations_null_only_backfill
    check ((applied_amount is null) = is_backfilled_unconverted)
);

create index idx_settlement_allocations_obligation
  on public.business_ledger_settlement_allocations(obligation_entry_id);

alter table public.business_ledger_settlement_allocations enable row level security;

revoke insert, update, delete on table public.business_ledger_settlement_allocations from anon, authenticated;
grant select on table public.business_ledger_settlement_allocations to authenticated;

create policy business_ledger_settlement_allocations_select_admin
on public.business_ledger_settlement_allocations
for select
to authenticated
using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Backfill from settles_entry_id, then drop the old link.
-- Closed obligations that never had a child payment get no allocation.
-- ---------------------------------------------------------------------------
insert into public.business_ledger_settlement_allocations
  (payment_entry_id, obligation_entry_id, applied_amount, is_backfilled_unconverted)
select
  s.id,
  s.settles_entry_id,
  case
    when s.settlement_amount_in_credit_currency is not null then s.settlement_amount_in_credit_currency
    when s.currency_code = o.currency_code then abs(s.amount)
    else null
  end,
  s.settlement_amount_in_credit_currency is null and s.currency_code <> o.currency_code
from public.business_ledger_entries s
join public.business_ledger_entries o on o.id = s.settles_entry_id;

drop trigger if exists trg_business_ledger_entry_settlement_valid on public.business_ledger_entries;
drop function if exists public.business_ledger_entry_settlement_valid();
drop trigger if exists trg_business_ledger_credit_entry_guard on public.business_ledger_entries;
drop function if exists public.business_ledger_credit_entry_guard();

alter table public.business_ledger_entries
  drop constraint if exists business_ledger_entries_credit_settlement_mutex,
  drop constraint if exists business_ledger_entries_debt_settlement_mutex,
  drop constraint if exists business_ledger_entries_future_credit_settlement_mutex,
  drop constraint if exists business_ledger_entries_settlement_fx_pairing,
  drop constraint if exists business_ledger_entries_settlement_amount_pairing,
  drop constraint if exists business_ledger_entries_settlement_rate_pairing,
  drop constraint if exists business_ledger_entries_settlement_amount_in_credit_currency_check;

drop index if exists public.idx_business_ledger_entries_settles_entry;

alter table public.business_ledger_entries
  drop column settles_entry_id,
  drop column settlement_amount_in_credit_currency;

-- ---------------------------------------------------------------------------
-- Row-shape guards (created after backfill so historical rows are kept as-is)
-- ---------------------------------------------------------------------------
create or replace function public.business_ledger_settlement_allocation_valid()
returns trigger
language plpgsql
as $$
declare
  v_payment public.business_ledger_entries%rowtype;
  v_obligation public.business_ledger_entries%rowtype;
begin
  select * into v_payment from public.business_ledger_entries where id = NEW.payment_entry_id;
  select * into v_obligation from public.business_ledger_entries where id = NEW.obligation_entry_id;

  if v_payment.is_credit or v_payment.is_debt or v_payment.is_future_credit then
    raise exception 'settlement payment % cannot be a credit or debt', NEW.payment_entry_id;
  end if;

  if not (v_obligation.is_credit or v_obligation.is_debt) then
    raise exception 'settlement target % is not marked as credit or debt', NEW.obligation_entry_id;
  end if;

  if exists (
    select 1 from public.business_ledger_settlement_allocations a
    where a.payment_entry_id = NEW.obligation_entry_id
  ) then
    raise exception 'settlement target % is itself a settlement (chains are not allowed)', NEW.obligation_entry_id;
  end if;

  if exists (
    select 1
    from public.business_ledger_settlement_allocations a
    join public.business_ledger_entries o on o.id = a.obligation_entry_id
    where a.payment_entry_id = NEW.payment_entry_id
      and a.obligation_entry_id <> NEW.obligation_entry_id
      and o.currency_code <> v_obligation.currency_code
  ) then
    raise exception 'settlement payment % cannot cover obligations in different currencies', NEW.payment_entry_id;
  end if;

  if v_obligation.is_debt and v_payment.entry_direction <> 'spending' then
    raise exception 'debt payment % must use Cash Flow Out', NEW.payment_entry_id;
  end if;

  if v_obligation.is_credit and v_payment.entry_direction <> 'profit' then
    raise exception 'credit settlement % must use Cash Flow In', NEW.payment_entry_id;
  end if;

  return NEW;
end;
$$;

create trigger trg_settlement_allocation_valid
before insert or update on public.business_ledger_settlement_allocations
for each row execute function public.business_ledger_settlement_allocation_valid();

create or replace function public.business_ledger_settlement_entry_guard()
returns trigger
language plpgsql
as $$
begin
  if (OLD.is_credit or OLD.is_debt)
    and (
      NEW.is_credit is distinct from OLD.is_credit
      or NEW.is_debt is distinct from OLD.is_debt
      or NEW.currency_code is distinct from OLD.currency_code
    )
    and exists (
      select 1 from public.business_ledger_settlement_allocations a
      where a.obligation_entry_id = OLD.id
    )
  then
    raise exception using
      errcode = 'PT409',
      message = 'A credit or debt with recorded payments cannot change its settlement type or currency.';
  end if;

  if (
      NEW.amount is distinct from OLD.amount
      or NEW.currency_code is distinct from OLD.currency_code
      or NEW.settlement_conversion_rate is distinct from OLD.settlement_conversion_rate
      or NEW.entry_direction is distinct from OLD.entry_direction
      or (NEW.is_credit and not OLD.is_credit)
      or (NEW.is_debt and not OLD.is_debt)
      or (NEW.is_future_credit and not OLD.is_future_credit)
    )
    and exists (
      select 1 from public.business_ledger_settlement_allocations a
      where a.payment_entry_id = OLD.id
    )
  then
    raise exception using
      errcode = 'PT409',
      message = 'A settlement payment''s amount, currency, rate, and cash flow cannot change. Delete the linked set and record it again.';
  end if;

  return NEW;
end;
$$;

create trigger trg_settlement_entry_guard
before update on public.business_ledger_entries
for each row execute function public.business_ledger_settlement_entry_guard();

-- ---------------------------------------------------------------------------
-- Balance: the single definition of outstanding.
-- open_balance is null when any applied amount is unknown; negative = overpaid.
-- ---------------------------------------------------------------------------
create view public.business_ledger_obligation_balances
with (security_invoker = true) as
select
  o.id as obligation_id,
  case when o.is_debt then 'debt' else 'credit' end as kind,
  o.is_future_credit,
  o.currency_code,
  abs(o.amount)::numeric(18, 4) as face_amount,
  s.applied_known,
  s.unconverted_count,
  case when s.unconverted_count > 0 then null else s.applied_known end as applied_total,
  case
    when s.unconverted_count > 0 then null
    else (abs(o.amount) - s.applied_known)::numeric(18, 4)
  end as open_balance,
  coalesce(o.credit_settled_at, o.debt_settled_at) as closed_at
from public.business_ledger_entries o
cross join lateral (
  select
    coalesce(sum(a.applied_amount), 0)::numeric(18, 4) as applied_known,
    count(*) filter (where a.applied_amount is null)::integer as unconverted_count
  from public.business_ledger_settlement_allocations a
  where a.obligation_entry_id = o.id
) s
where o.is_credit or o.is_debt;

grant select on public.business_ledger_obligation_balances to authenticated;

-- PostgREST computed field: lets entry filters ask "is this row a payment?".
create or replace function public.is_settlement_payment(public.business_ledger_entries)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.business_ledger_settlement_allocations a
    where a.payment_entry_id = $1.id
  );
$$;

-- Connected component of an entry in the allocation graph (obligations + payments).
create or replace function public.big_book_linked_set(p_entry_id uuid)
returns uuid[]
language sql
stable
set search_path = public
as $$
  with recursive component(id) as (
    select p_entry_id
    union
    select case when a.payment_entry_id = c.id then a.obligation_entry_id else a.payment_entry_id end
    from component c
    join public.business_ledger_settlement_allocations a
      on a.payment_entry_id = c.id or a.obligation_entry_id = c.id
  )
  select array_agg(component.id order by component.id) from component;
$$;

-- ---------------------------------------------------------------------------
-- Outcome of one request, derived from rows so a replay reports current truth
-- ---------------------------------------------------------------------------
create or replace function public.big_book_settlement_outcome(
  p_request_id uuid,
  p_status text
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with req as (
    select r.* from public.business_ledger_settlement_requests r where r.id = p_request_id
  ),
  payments as (
    select e.id, e.amount, e.currency_code, e.created_at
    from public.business_ledger_entries e
    where e.settlement_request_id = p_request_id
      and exists (
        select 1 from public.business_ledger_settlement_allocations a where a.payment_entry_id = e.id
      )
  ),
  allocs as (
    select a.payment_entry_id, a.obligation_entry_id, a.applied_amount
    from public.business_ledger_settlement_allocations a
    join payments p on p.id = a.payment_entry_id
  )
  select jsonb_build_object(
    'status', p_status,
    'request_id', p_request_id,
    'group_id', (select req.group_id from req),
    'payments', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'payment_id', p.id,
          'amount', p.amount,
          'currency_code', p.currency_code,
          'allocations', (
            select jsonb_agg(
              jsonb_build_object('obligation_id', a.obligation_entry_id, 'applied_amount', a.applied_amount)
              order by a.obligation_entry_id
            )
            from allocs a
            where a.payment_entry_id = p.id
          )
        )
        order by p.created_at, p.id
      )
      from payments p
    ), '[]'::jsonb),
    'companion_ids', coalesce((
      select jsonb_agg(e.id order by e.created_at, e.id)
      from public.business_ledger_entries e
      where e.settlement_request_id = p_request_id
        and not exists (select 1 from payments p where p.id = e.id)
    ), '[]'::jsonb),
    'closed_obligation_ids', coalesce((
      select jsonb_agg(distinct a.obligation_entry_id)
      from allocs a
      join public.business_ledger_entries o on o.id = a.obligation_entry_id
      where coalesce(o.credit_settled_at, o.debt_settled_at) is not null
    ), '[]'::jsonb),
    'unallocated_obligation_ids', coalesce((
      select jsonb_agg(x.id order by x.id)
      from req, unnest(req.requested_obligation_ids) as x(id)
      where not exists (select 1 from allocs a where a.obligation_entry_id = x.id)
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.big_book_settlement_outcome(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- WRITE: record a settlement (ordinary settle, bulk single, bulk each).
-- Errors: MESSAGE is a machine code, DETAIL is human text, HINT is a jsonb payload.
--   request_id_reused, obligation_not_found, obligation_closed      (PT409)
--   invalid_command, not_an_obligation, mixed_obligation_kinds,
--   obligation_is_payment, mixed_obligation_currencies, rate_required,
--   amount_required, unknown_open_balance, nothing_to_allocate,
--   companion_type_missing                                          (PT422)
--   not_admin                                                       (PT403)
-- ---------------------------------------------------------------------------
create or replace function public.big_book_record_settlement(
  p_request_id uuid,
  p_mode text,
  p_obligation_ids uuid[],
  p_entry_date date,
  p_currency_code text,
  p_amount numeric,
  p_conversion_rate numeric,
  p_close boolean,
  p_close_note text,
  p_settlement_note text,
  p_context jsonb,
  p_companions jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_ids uuid[];
  v_hash text;
  v_inserted uuid;
  v_stored_hash text;
  v_bad uuid[];
  v_kind text;
  v_is_debt boolean;
  v_currency_count integer;
  v_direction text;
  v_obligation_currency text;
  v_payment_currency text;
  v_rate numeric;
  v_order_ids uuid[];
  v_order_balances numeric[];
  v_applied numeric[];
  v_alloc_ids uuid[] := '{}';
  v_count integer;
  v_total numeric;
  v_remaining numeric;
  v_share numeric;
  v_last integer;
  v_group_id uuid;
  v_form boolean := coalesce(p_context ->> 'source', 'anchor') = 'form';
  v_custom_explanation text := nullif(trim(coalesce(p_context ->> 'explanation', '')), '');
  v_label text;
  v_explanation text;
  v_payment_amount numeric;
  v_payment_id uuid;
  v_first_payment public.business_ledger_entries%rowtype;
  v_anchor public.business_ledger_entries%rowtype;
  v_companion jsonb;
  v_role text;
  v_companion_amount numeric;
  v_companion_type uuid;
  v_companion_direction text;
  v_companion_currency text;
  v_companion_prefix text;
  i integer;
begin
  if not public.is_admin() then
    raise exception using errcode = 'PT403', message = 'not_admin', detail = 'Admin access required.';
  end if;

  v_ids := array(
    select distinct x from unnest(coalesce(p_obligation_ids, '{}'::uuid[])) as x where x is not null order by x
  );
  if p_request_id is null
    or coalesce(p_mode, '') not in ('single', 'each')
    or p_entry_date is null
    or cardinality(v_ids) = 0
    or cardinality(v_ids) > 100
    or cardinality(v_ids) <> cardinality(p_obligation_ids)
  then
    raise exception using errcode = 'PT422', message = 'invalid_command',
      detail = 'A settlement needs a request id, a mode, a date, and 1 to 100 distinct obligations.';
  end if;

  -- 1. Idempotency. A concurrent duplicate blocks on the primary key until the first commits.
  v_hash := md5(jsonb_build_object(
    'mode', p_mode,
    'obligation_ids', to_jsonb(v_ids),
    'entry_date', p_entry_date,
    'currency_code', p_currency_code,
    'amount', p_amount,
    'conversion_rate', p_conversion_rate,
    'close', coalesce(p_close, false),
    'close_note', p_close_note,
    'settlement_note', p_settlement_note,
    'context', coalesce(p_context, '{}'::jsonb),
    'companions', coalesce(p_companions, '[]'::jsonb)
  )::text);

  insert into public.business_ledger_settlement_requests (id, request_hash, requested_obligation_ids, created_by)
  values (p_request_id, v_hash, v_ids, v_actor)
  on conflict (id) do nothing
  returning id into v_inserted;

  if v_inserted is null then
    select r.request_hash into v_stored_hash
    from public.business_ledger_settlement_requests r
    where r.id = p_request_id
    for update;
    if v_stored_hash is distinct from v_hash then
      raise exception using errcode = 'PT409', message = 'request_id_reused',
        detail = 'This request id was already used for a different settlement.';
    end if;
    return public.big_book_settlement_outcome(p_request_id, 'replayed');
  end if;

  -- 2. Lock obligations in id order so concurrent bulk settles cannot deadlock.
  perform 1 from public.business_ledger_entries e where e.id = any(v_ids) order by e.id for update;

  -- 3. Validate.
  v_bad := array(
    select x from unnest(v_ids) as x
    where not exists (select 1 from public.business_ledger_entries e where e.id = x)
  );
  if cardinality(v_bad) > 0 then
    raise exception using errcode = 'PT409', message = 'obligation_not_found',
      detail = 'Some selected entries no longer exist.', hint = jsonb_build_object('ids', v_bad)::text;
  end if;

  v_bad := array(
    select e.id from public.business_ledger_entries e
    where e.id = any(v_ids) and not (e.is_credit or e.is_debt)
    order by e.id
  );
  if cardinality(v_bad) > 0 then
    raise exception using errcode = 'PT422', message = 'not_an_obligation',
      detail = 'Only credit or debt entries can be settled.', hint = jsonb_build_object('ids', v_bad)::text;
  end if;

  select count(distinct e.is_debt), bool_or(e.is_debt), count(distinct e.currency_code), min(e.currency_code)
  into v_count, v_is_debt, v_currency_count, v_obligation_currency
  from public.business_ledger_entries e
  where e.id = any(v_ids);
  if v_count > 1 then
    raise exception using errcode = 'PT422', message = 'mixed_obligation_kinds',
      detail = 'Credits and debts cannot be settled together.';
  end if;
  v_kind := case when v_is_debt then 'debt' else 'credit' end;
  v_direction := case when v_kind = 'debt' then 'spending' else 'profit' end;

  v_bad := array(
    select e.id from public.business_ledger_entries e
    where e.id = any(v_ids) and coalesce(e.credit_settled_at, e.debt_settled_at) is not null
    order by e.id
  );
  if cardinality(v_bad) > 0 then
    raise exception using errcode = 'PT409', message = 'obligation_closed',
      detail = 'One or more selected entries are already settled.', hint = jsonb_build_object('ids', v_bad)::text;
  end if;

  v_bad := array(
    select distinct a.payment_entry_id from public.business_ledger_settlement_allocations a
    where a.payment_entry_id = any(v_ids)
    order by a.payment_entry_id
  );
  if cardinality(v_bad) > 0 then
    raise exception using errcode = 'PT422', message = 'obligation_is_payment',
      detail = 'Settlement targets cannot themselves be settlements.', hint = jsonb_build_object('ids', v_bad)::text;
  end if;

  if v_currency_count > 1 then
    raise exception using errcode = 'PT422', message = 'mixed_obligation_currencies',
      detail = 'Selected entries use different currencies.';
  end if;

  v_payment_currency := coalesce(nullif(p_currency_code, ''), v_obligation_currency);
  if v_payment_currency = v_obligation_currency then
    v_rate := 1;
  elsif p_conversion_rate is null or p_conversion_rate <= 0 then
    raise exception using errcode = 'PT422', message = 'rate_required',
      detail = 'A positive conversion rate is required when the payment currency differs from the obligation currency.';
  else
    v_rate := p_conversion_rate;
  end if;

  select
    array_agg(b.obligation_id order by e.entry_date, e.id),
    array_agg(b.open_balance order by e.entry_date, e.id)
  into v_order_ids, v_order_balances
  from public.business_ledger_entries e
  join public.business_ledger_obligation_balances b on b.obligation_id = e.id
  where e.id = any(v_ids);

  v_bad := array(
    select v_order_ids[k] from generate_subscripts(v_order_ids, 1) as k
    where v_order_balances[k] is null
  );
  if cardinality(v_bad) > 0 then
    raise exception using errcode = 'PT422', message = 'unknown_open_balance',
      detail = 'An earlier payment has no recorded amount in the obligation currency, so the open balance is unknown.',
      hint = jsonb_build_object('ids', v_bad)::text;
  end if;

  -- 4. Allocate, oldest obligation first.
  v_count := cardinality(v_order_ids);
  v_applied := array_fill(0::numeric, array[v_count]);

  if p_mode = 'single' then
    if p_amount is null or p_amount <= 0 then
      raise exception using errcode = 'PT422', message = 'amount_required',
        detail = 'One payment covering several obligations needs an explicit amount.';
    end if;
    v_total := round(p_amount * v_rate, 4);
    if v_total <= 0 then
      raise exception using errcode = 'PT422', message = 'amount_required',
        detail = 'The payment amount converts to zero in the obligation currency.';
    end if;
    v_remaining := v_total;
    v_last := null;
    for i in 1..v_count loop
      exit when v_remaining <= 0;
      if v_order_balances[i] > 0 then
        v_share := least(v_remaining, v_order_balances[i]);
        v_applied[i] := v_share;
        v_remaining := v_remaining - v_share;
        v_last := i;
      end if;
    end loop;
    -- Leftover cash is variance on the last obligation that received money.
    -- If none had an open balance, do not invent a payment on the first row.
    if v_last is null then
      raise exception using errcode = 'PT422', message = 'nothing_to_allocate',
        detail = 'None of the selected entries has an open balance.';
    end if;
    v_applied[v_last] := v_applied[v_last] + v_remaining;
  else
    if p_amount is not null then
      raise exception using errcode = 'PT422', message = 'invalid_command',
        detail = 'Per-obligation settlement pays each open balance; do not send an amount.';
    end if;
    for i in 1..v_count loop
      if v_order_balances[i] > 0 then
        v_applied[i] := v_order_balances[i];
      end if;
    end loop;
  end if;

  for i in 1..v_count loop
    if v_applied[i] > 0 then
      v_alloc_ids := v_alloc_ids || v_order_ids[i];
    end if;
  end loop;
  if cardinality(v_alloc_ids) = 0 then
    raise exception using errcode = 'PT422', message = 'nothing_to_allocate',
      detail = 'None of the selected entries has an open balance.';
  end if;

  select * into v_anchor from public.business_ledger_entries e where e.id = v_alloc_ids[1];
  v_label := coalesce(
    v_custom_explanation,
    case
      when cardinality(v_ids) = 1 and v_kind = 'debt' then 'Debt payment for: ' || trim(v_anchor.explanation)
      when cardinality(v_ids) = 1 then 'Settlement for: ' || trim(v_anchor.explanation)
      when v_kind = 'debt' then 'Bulk debt payment for ' || cardinality(v_ids) || ' open debts'
      else 'Bulk settlement for ' || cardinality(v_ids) || ' open credits'
    end
  );

  -- 5. Group: only obligations that receive money join it.
  select case
    when count(distinct e.group_id) = 1 and bool_and(e.group_id is not null) then (array_agg(e.group_id))[1]
  end
  into v_group_id
  from public.business_ledger_entries e
  where e.id = any(v_alloc_ids);

  if v_group_id is null then
    insert into public.business_ledger_entry_groups (label, remark, created_by, updated_by)
    values (left(trim(v_label), 200), null, v_actor, v_actor)
    returning id into v_group_id;

    update public.business_ledger_entries e
    set group_id = v_group_id, updated_by = v_actor
    where e.id = any(v_alloc_ids);
  end if;

  -- 6. Payments and allocations.
  for i in 1..v_count loop
    continue when v_applied[i] <= 0;
    continue when p_mode = 'single' and v_order_ids[i] <> v_alloc_ids[1];

    if p_mode = 'single' then
      v_payment_amount := round(p_amount, 4);
      v_explanation := v_label;
    else
      select * into v_anchor from public.business_ledger_entries e where e.id = v_order_ids[i];
      v_payment_amount := round(v_applied[i] / v_rate, 4);
      v_explanation := coalesce(
        v_custom_explanation,
        case when v_kind = 'debt' then 'Debt payment for: ' else 'Settlement for: ' end || trim(v_anchor.explanation)
      );
    end if;

    if v_payment_amount <= 0 then
      raise exception using errcode = 'PT422', message = 'amount_required',
        detail = 'A payment amount rounds to zero at this conversion rate.';
    end if;

    insert into public.business_ledger_entries (
      group_id, entry_date, entry_direction, entry_type_id, vendor_type_id, vendor_id,
      pocket_id, action_by_id, explanation, amount, currency_code, remark, responsible_actor_id,
      is_credit, is_future_credit, is_debt, settlement_conversion_rate, settlement_note,
      settlement_request_id, created_by, updated_by
    )
    values (
      v_group_id,
      p_entry_date,
      v_direction,
      case when v_form then (p_context ->> 'entry_type_id')::uuid else v_anchor.entry_type_id end,
      case when v_form then nullif(p_context ->> 'vendor_type_id', '')::uuid else v_anchor.vendor_type_id end,
      case when v_form then nullif(p_context ->> 'vendor_id', '')::uuid else v_anchor.vendor_id end,
      case when v_form then nullif(p_context ->> 'pocket_id', '')::uuid else null end,
      case when v_form then nullif(p_context ->> 'action_by_id', '')::uuid else v_anchor.action_by_id end,
      left(v_explanation, 500),
      v_payment_amount,
      v_payment_currency,
      case when v_form then nullif(p_context ->> 'remark', '') else null end,
      case when v_form then (p_context ->> 'responsible_actor_id')::uuid else v_anchor.responsible_actor_id end,
      false,
      false,
      false,
      v_rate,
      p_settlement_note,
      p_request_id,
      v_actor,
      v_actor
    )
    returning id into v_payment_id;

    if v_first_payment.id is null then
      select * into v_first_payment from public.business_ledger_entries e where e.id = v_payment_id;
    end if;

    if p_mode = 'single' then
      insert into public.business_ledger_settlement_allocations (payment_entry_id, obligation_entry_id, applied_amount)
      select v_payment_id, v_order_ids[k], v_applied[k]
      from generate_subscripts(v_order_ids, 1) as k
      where v_applied[k] > 0;
    else
      insert into public.business_ledger_settlement_allocations (payment_entry_id, obligation_entry_id, applied_amount)
      values (v_payment_id, v_order_ids[i], v_applied[i]);
    end if;
  end loop;

  -- 7. Companions share the group and request id and have no allocation.
  for v_companion in select value from jsonb_array_elements(coalesce(p_companions, '[]'::jsonb)) loop
    v_role := v_companion ->> 'role';
    v_companion_amount := (v_companion ->> 'amount')::numeric;
    if v_companion_amount is null or v_companion_amount <= 0 then
      raise exception using errcode = 'PT422', message = 'invalid_command',
        detail = 'Companion amounts must be greater than 0.';
    end if;

    if v_role in ('profit', 'kurs') then
      select t.id into v_companion_type
      from public.business_ledger_types t
      where lower(trim(t.name)) = case when v_role = 'profit' then 'profit' else 'kurs' end
      order by t.is_active desc, t.created_at
      limit 1;
      if v_companion_type is null then
        raise exception using errcode = 'PT422', message = 'companion_type_missing',
          detail = format('%s ledger type not found. Create an active type named "%s" in Big Book Settings.',
            upper(v_role), upper(v_role)),
          hint = jsonb_build_object('role', v_role)::text;
      end if;
    end if;

    case v_role
      when 'profit' then
        v_companion_direction := 'profit';
        v_companion_currency := v_obligation_currency;
        v_companion_prefix := 'PROFIT';
      when 'kurs' then
        v_companion_direction := 'spending';
        v_companion_currency := 'USDT';
        v_companion_prefix := 'KURS';
      when 'gas_fee' then
        v_companion_type := v_first_payment.entry_type_id;
        v_companion_direction := 'spending';
        v_companion_currency := 'TRX';
        v_companion_prefix := 'Gas fee';
      else
        raise exception using errcode = 'PT422', message = 'invalid_command',
          detail = format('Unknown companion role %s.', coalesce(v_role, 'null'));
    end case;

    insert into public.business_ledger_entries (
      group_id, entry_date, entry_direction, entry_type_id, vendor_type_id, vendor_id,
      pocket_id, action_by_id, explanation, amount, currency_code, remark, responsible_actor_id,
      is_credit, is_future_credit, is_debt, settlement_request_id, created_by, updated_by
    )
    values (
      v_group_id,
      p_entry_date,
      v_companion_direction,
      v_companion_type,
      v_first_payment.vendor_type_id,
      v_first_payment.vendor_id,
      null,
      v_first_payment.action_by_id,
      left(v_companion_prefix || ' — ' || trim(v_label), 500),
      v_companion_amount,
      v_companion_currency,
      null,
      v_first_payment.responsible_actor_id,
      false,
      false,
      false,
      p_request_id,
      v_actor,
      v_actor
    );
    v_companion_type := null;
  end loop;

  -- 8. Close only obligations that received money.
  if coalesce(p_close, false) then
    if v_kind = 'debt' then
      update public.business_ledger_entries e
      set debt_settled_at = now(), debt_settled_by = v_actor, debt_settlement_note = p_close_note, updated_by = v_actor
      where e.id = any(v_alloc_ids);
    else
      update public.business_ledger_entries e
      set credit_settled_at = now(), credit_settled_by = v_actor, credit_settlement_note = p_close_note, updated_by = v_actor
      where e.id = any(v_alloc_ids);
    end if;
  end if;

  update public.business_ledger_settlement_requests r set group_id = v_group_id where r.id = p_request_id;

  return public.big_book_settlement_outcome(p_request_id, 'created');
end;
$$;

revoke all on function public.big_book_record_settlement(
  uuid, text, uuid[], date, text, numeric, numeric, boolean, text, text, jsonb, jsonb
) from public, anon;
grant execute on function public.big_book_record_settlement(
  uuid, text, uuid[], date, text, numeric, numeric, boolean, text, text, jsonb, jsonb
) to authenticated;

-- ---------------------------------------------------------------------------
-- WRITE: delete an entry, or its whole linked set when the caller confirms it.
-- Errors: entry_not_found (PT404); stale_entry, linked_set_requires_confirmation,
--         linked_set_changed (PT409); not_admin (PT403).
-- ---------------------------------------------------------------------------
create or replace function public.big_book_delete_entry(
  p_entry_id uuid,
  p_expected_updated_at timestamptz,
  p_cascade_linked boolean,
  p_expected_member_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated_at timestamptz;
  v_members uuid[];
  v_expected uuid[];
  v_companions uuid[];
begin
  if not public.is_admin() then
    raise exception using errcode = 'PT403', message = 'not_admin', detail = 'Admin access required.';
  end if;

  select e.updated_at into v_updated_at
  from public.business_ledger_entries e
  where e.id = p_entry_id
  for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'entry_not_found', detail = 'Entry not found.';
  end if;
  if p_expected_updated_at is null or v_updated_at <> p_expected_updated_at then
    raise exception using errcode = 'PT409', message = 'stale_entry',
      detail = 'This record was changed by someone else.',
      hint = jsonb_build_object('current_updated_at', v_updated_at)::text;
  end if;

  v_members := public.big_book_linked_set(p_entry_id);
  perform 1 from public.business_ledger_entries e where e.id = any(v_members) order by e.id for update;

  if cardinality(v_members) = 1 then
    delete from public.business_ledger_entries e where e.id = p_entry_id;
    return jsonb_build_object('deleted_ids', jsonb_build_array(p_entry_id), 'cascaded', false);
  end if;

  if not coalesce(p_cascade_linked, false) then
    raise exception using errcode = 'PT409', message = 'linked_set_requires_confirmation',
      detail = 'This entry has linked settlements. Delete the linked set together.',
      hint = jsonb_build_object('member_ids', v_members)::text;
  end if;

  v_expected := array(
    select distinct x from unnest(coalesce(p_expected_member_ids, '{}'::uuid[])) as x order by x
  );
  if v_expected is distinct from v_members then
    raise exception using errcode = 'PT409', message = 'linked_set_changed',
      detail = 'The linked settlements changed since you opened this dialog. Refresh and try again.',
      hint = jsonb_build_object('member_ids', v_members)::text;
  end if;

  v_companions := array(
    select c.id
    from public.business_ledger_entries c
    where c.settlement_request_id in (
        select p.settlement_request_id
        from public.business_ledger_entries p
        where p.id = any(v_members)
          and p.settlement_request_id is not null
          and exists (
            select 1 from public.business_ledger_settlement_allocations a where a.payment_entry_id = p.id
          )
      )
      and c.id <> all(v_members)
      and not exists (
        select 1 from public.business_ledger_settlement_allocations a where a.payment_entry_id = c.id
      )
    order by c.id
  );

  delete from public.business_ledger_entries e where e.id = any(v_members || v_companions);

  return jsonb_build_object('deleted_ids', to_jsonb(v_members || v_companions), 'cascaded', true);
end;
$$;

revoke all on function public.big_book_delete_entry(uuid, timestamptz, boolean, uuid[]) from public, anon;
grant execute on function public.big_book_delete_entry(uuid, timestamptz, boolean, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- READ: settlement links for a page of entries.
-- role 'obligation': anchor is the obligation (one row per payment, or one row with
-- null payment fields when it has none). role 'payment': one row per obligation it pays.
-- ---------------------------------------------------------------------------
create or replace function public.get_big_book_settlement_links(p_entry_ids uuid[])
returns table (
  anchor_entry_id uuid,
  role text,
  payment_entry_id uuid,
  obligation_entry_id uuid,
  applied_amount numeric,
  payment_entry_date date,
  payment_amount numeric,
  payment_currency_code text,
  payment_conversion_rate numeric,
  payment_settlement_note text,
  payment_explanation text,
  payment_updated_at timestamptz,
  payment_obligation_count integer,
  obligation_entry_date date,
  obligation_explanation text,
  obligation_amount numeric,
  obligation_currency_code text,
  obligation_is_debt boolean,
  obligation_is_future_credit boolean,
  obligation_credit_settled_at timestamptz,
  obligation_debt_settled_at timestamptz,
  obligation_vendor_name text,
  obligation_face_amount numeric,
  obligation_applied_total numeric,
  obligation_open_balance numeric,
  obligation_unconverted_count integer,
  linked_set_ids uuid[]
)
language sql
stable
set search_path = public
as $$
  with anchors as (
    select e.id, (e.is_credit or e.is_debt) as is_obligation
    from public.business_ledger_entries e
    where e.id = any(p_entry_ids)
  ),
  links as (
    select
      an.id as anchor_entry_id,
      'obligation'::text as role,
      a.payment_entry_id,
      an.id as obligation_entry_id,
      a.applied_amount
    from anchors an
    left join public.business_ledger_settlement_allocations a on a.obligation_entry_id = an.id
    where an.is_obligation
    union all
    select
      an.id as anchor_entry_id,
      'payment'::text as role,
      a.payment_entry_id,
      a.obligation_entry_id,
      a.applied_amount
    from anchors an
    join public.business_ledger_settlement_allocations a on a.payment_entry_id = an.id
    where not an.is_obligation
  ),
  anchor_sets as (
    select distinct l.anchor_entry_id, public.big_book_linked_set(l.anchor_entry_id) as ids
    from links l
  )
  select
    l.anchor_entry_id,
    l.role,
    l.payment_entry_id,
    l.obligation_entry_id,
    l.applied_amount,
    p.entry_date,
    p.amount,
    p.currency_code,
    p.settlement_conversion_rate,
    p.settlement_note,
    p.explanation,
    p.updated_at,
    (
      select count(*)::integer from public.business_ledger_settlement_allocations x
      where x.payment_entry_id = l.payment_entry_id
    ),
    o.entry_date,
    o.explanation,
    o.amount,
    o.currency_code,
    o.is_debt,
    o.is_future_credit,
    o.credit_settled_at,
    o.debt_settled_at,
    v.name,
    b.face_amount,
    b.applied_total,
    b.open_balance,
    b.unconverted_count,
    s.ids
  from links l
  join public.business_ledger_entries o on o.id = l.obligation_entry_id
  join public.business_ledger_obligation_balances b on b.obligation_id = o.id
  join anchor_sets s on s.anchor_entry_id = l.anchor_entry_id
  left join public.business_ledger_entries p on p.id = l.payment_entry_id
  left join public.business_ledger_vendors v on v.id = o.vendor_id
  order by l.anchor_entry_id, p.entry_date desc nulls last, p.created_at desc nulls last, o.entry_date, o.id;
$$;

revoke all on function public.get_big_book_settlement_links(uuid[]) from anon;
grant execute on function public.get_big_book_settlement_links(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- READ: outstanding. A row counts only when open, its balance is known, and > 0.
-- ---------------------------------------------------------------------------
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
  entry_type_id uuid,
  type_name text,
  actor_id uuid,
  actor_code text,
  actor_display_name text,
  currency text,
  outstanding numeric,
  open_credit_count bigint,
  open_future_credit_count bigint,
  unknown_balance_count bigint
)
language sql
stable
as $$
  select
    e.entry_type_id,
    coalesce(t.name, '-') as type_name,
    e.responsible_actor_id as actor_id,
    a.actor_code::text,
    a.display_name as actor_display_name,
    e.currency_code as currency,
    coalesce(sum(b.open_balance) filter (where b.open_balance > 0), 0)::numeric as outstanding,
    count(*) filter (where b.open_balance > 0)::bigint as open_credit_count,
    0::bigint as open_future_credit_count,
    count(*) filter (where b.open_balance is null)::bigint as unknown_balance_count
  from public.business_ledger_obligation_balances b
  join public.business_ledger_entries e on e.id = b.obligation_id
  join public.big_book_actors a on a.id = e.responsible_actor_id
  left join public.business_ledger_types t on t.id = e.entry_type_id
  where b.kind = 'credit'
    and b.is_future_credit = false
    and b.closed_at is null
    and (b.open_balance is null or b.open_balance > 0)
    and (p_actor_ids is null or e.responsible_actor_id = any(p_actor_ids))
    and (p_vendor_ids is null or e.vendor_id = any(p_vendor_ids))
    and (p_vendor_type_ids is null or e.vendor_type_id = any(p_vendor_type_ids))
    and (p_currency_codes is null or e.currency_code = any(p_currency_codes))
    and (p_date_from is null or e.entry_date >= p_date_from)
    and (p_date_to is null or e.entry_date <= p_date_to)
  group by
    e.entry_type_id, t.name,
    e.responsible_actor_id, a.actor_code, a.display_name, e.currency_code
  order by
    case e.currency_code
      when 'IDR' then 0 when 'MYR' then 1 when 'USDT' then 2 when 'TRX' then 3 else 4
    end,
    outstanding desc,
    coalesce(t.name, '-'),
    a.display_name;
$$;

revoke all on function public.get_big_book_vendor_actor_outstanding(uuid[], uuid[], uuid[], text[], date, date) from anon;
grant execute on function public.get_big_book_vendor_actor_outstanding(uuid[], uuid[], uuid[], text[], date, date) to authenticated;

drop function if exists public.get_big_book_vendor_actor_future_outstanding(uuid[], uuid[], uuid[], text[], date, date);

create or replace function public.get_big_book_vendor_actor_future_outstanding(
  p_actor_ids uuid[] default null,
  p_vendor_ids uuid[] default null,
  p_vendor_type_ids uuid[] default null,
  p_currency_codes text[] default null,
  p_date_from date default null,
  p_date_to date default null
)
returns table (
  entry_type_id uuid,
  type_name text,
  actor_id uuid,
  actor_code text,
  actor_display_name text,
  currency text,
  outstanding numeric,
  open_credit_count bigint,
  unknown_balance_count bigint
)
language sql
stable
as $$
  select
    e.entry_type_id,
    coalesce(t.name, '-') as type_name,
    e.responsible_actor_id as actor_id,
    a.actor_code::text,
    a.display_name as actor_display_name,
    e.currency_code as currency,
    coalesce(sum(b.open_balance) filter (where b.open_balance > 0), 0)::numeric as outstanding,
    count(*) filter (where b.open_balance > 0)::bigint as open_credit_count,
    count(*) filter (where b.open_balance is null)::bigint as unknown_balance_count
  from public.business_ledger_obligation_balances b
  join public.business_ledger_entries e on e.id = b.obligation_id
  join public.big_book_actors a on a.id = e.responsible_actor_id
  left join public.business_ledger_types t on t.id = e.entry_type_id
  where b.kind = 'credit'
    and b.is_future_credit = true
    and b.closed_at is null
    and (b.open_balance is null or b.open_balance > 0)
    and (p_actor_ids is null or e.responsible_actor_id = any(p_actor_ids))
    and (p_vendor_ids is null or e.vendor_id = any(p_vendor_ids))
    and (p_vendor_type_ids is null or e.vendor_type_id = any(p_vendor_type_ids))
    and (p_currency_codes is null or e.currency_code = any(p_currency_codes))
    and (p_date_from is null or e.entry_date >= p_date_from)
    and (p_date_to is null or e.entry_date <= p_date_to)
  group by
    e.entry_type_id, t.name,
    e.responsible_actor_id, a.actor_code, a.display_name, e.currency_code
  order by
    case e.currency_code
      when 'IDR' then 0 when 'MYR' then 1 when 'USDT' then 2 when 'TRX' then 3 else 4
    end,
    outstanding desc,
    coalesce(t.name, '-'),
    a.display_name;
$$;

revoke all on function public.get_big_book_vendor_actor_future_outstanding(uuid[], uuid[], uuid[], text[], date, date) from anon;
grant execute on function public.get_big_book_vendor_actor_future_outstanding(uuid[], uuid[], uuid[], text[], date, date) to authenticated;

-- Debt outstanding: grouped transaction (or standalone debt) + actor + currency.
create or replace function public.get_big_book_vendor_actor_outstanding_debt(
  p_actor_ids uuid[] default null,
  p_vendor_ids uuid[] default null,
  p_vendor_type_ids uuid[] default null,
  p_currency_codes text[] default null,
  p_date_from date default null,
  p_date_to date default null
)
returns table (
  group_id uuid,
  entry_id uuid,
  group_label text,
  explanation text,
  vendor_type_id uuid,
  vendor_type_name text,
  actor_id uuid,
  actor_code text,
  actor_display_name text,
  currency text,
  outstanding numeric,
  open_debt_count bigint,
  unknown_balance_count bigint
)
language sql
stable
as $$
  select
    e.group_id,
    case when e.group_id is null then (array_agg(e.id))[1] end as entry_id,
    g.label as group_label,
    (array_agg(e.explanation order by e.created_at desc))[1] as explanation,
    (array_agg(e.vendor_type_id order by e.created_at desc))[1] as vendor_type_id,
    (array_agg(vt.name order by e.created_at desc))[1] as vendor_type_name,
    e.responsible_actor_id as actor_id,
    a.actor_code::text,
    a.display_name as actor_display_name,
    e.currency_code as currency,
    coalesce(sum(b.open_balance) filter (where b.open_balance > 0), 0)::numeric as outstanding,
    count(*) filter (where b.open_balance > 0)::bigint as open_debt_count,
    count(*) filter (where b.open_balance is null)::bigint as unknown_balance_count
  from public.business_ledger_obligation_balances b
  join public.business_ledger_entries e on e.id = b.obligation_id
  join public.big_book_actors a on a.id = e.responsible_actor_id
  left join public.business_ledger_entry_groups g on g.id = e.group_id
  left join public.business_ledger_vendor_types vt on vt.id = e.vendor_type_id
  where b.kind = 'debt'
    and b.closed_at is null
    and (b.open_balance is null or b.open_balance > 0)
    and (p_actor_ids is null or e.responsible_actor_id = any(p_actor_ids))
    and (p_vendor_ids is null or e.vendor_id = any(p_vendor_ids))
    and (p_vendor_type_ids is null or e.vendor_type_id = any(p_vendor_type_ids))
    and (p_currency_codes is null or e.currency_code = any(p_currency_codes))
    and (p_date_from is null or e.entry_date >= p_date_from)
    and (p_date_to is null or e.entry_date <= p_date_to)
  group by
    coalesce(e.group_id, e.id), e.group_id, g.label,
    e.responsible_actor_id, a.actor_code, a.display_name, e.currency_code
  order by
    case e.currency_code
      when 'IDR' then 0 when 'MYR' then 1 when 'USDT' then 2 when 'TRX' then 3 else 4
    end,
    outstanding desc;
$$;

revoke all on function public.get_big_book_vendor_actor_outstanding_debt(uuid[], uuid[], uuid[], text[], date, date) from anon;
grant execute on function public.get_big_book_vendor_actor_outstanding_debt(uuid[], uuid[], uuid[], text[], date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- READ: yearly type totals by month and currency (12 months, cash rows only)
-- ---------------------------------------------------------------------------
create or replace function public.get_big_book_type_monthly_currency_summary(
  p_type_id uuid,
  p_year integer
)
returns table (
  month integer,
  currency_code text,
  spending numeric,
  profit numeric,
  entry_count bigint
)
language sql
stable
as $$
  select
    m.month,
    s.currency_code,
    coalesce(s.spending, 0)::numeric,
    coalesce(s.profit, 0)::numeric,
    coalesce(s.entry_count, 0)::bigint
  from generate_series(1, 12) as m(month)
  left join (
    select
      extract(month from e.entry_date)::integer as month,
      e.currency_code,
      sum(abs(e.amount)) filter (where e.entry_direction = 'spending') as spending,
      sum(abs(e.amount)) filter (where e.entry_direction = 'profit') as profit,
      count(*) as entry_count
    from public.business_ledger_entries e
    where e.entry_type_id = p_type_id
      and e.entry_date >= make_date(p_year, 1, 1)
      and e.entry_date < make_date(p_year + 1, 1, 1)
      and e.is_debt = false
      and e.is_future_credit = false
    group by 1, 2
  ) s on s.month = m.month
  order by m.month, s.currency_code;
$$;

revoke all on function public.get_big_book_type_monthly_currency_summary(uuid, integer) from anon;
grant execute on function public.get_big_book_type_monthly_currency_summary(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Ledger page: same signature and behavior as 202610040003; the settlement
-- credit flags now read the allocation table.
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
  grand_total_rows as (
    select *
    from filtered f
    where (v_pocket_filter_active or f.pocket_id is null)
      and f.is_debt = false
      and f.is_future_credit = false
  ),
  page_total_rows as (
    select *
    from page_rows pr
    where (v_pocket_filter_active or pr.pocket_id is null)
      and pr.is_debt = false
      and pr.is_future_credit = false
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
