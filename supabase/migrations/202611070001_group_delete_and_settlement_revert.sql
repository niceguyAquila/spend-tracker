-- Safe grouped-transaction delete + settlement undo.
--
-- 1. The allocation -> obligation foreign key becomes DEFERRABLE INITIALLY DEFERRED.
--    As a plain NO ACTION key it is checked per deleted row, in row order, inside the
--    statement's after-trigger queue. When a delete removes an obligation and its
--    payment together (group cascade, linked-set delete), the obligation's check can
--    run before the payment's ON DELETE CASCADE has removed the allocation, and the
--    whole delete fails. Deferred, the check runs at commit, after every cascade.
--    Deleting a paid obligation on its own still fails, as before.
--
-- 2. big_book_delete_group: deletes a group, its entries, and (after confirmation)
--    settlement rows linked to them from outside the group, removing allocations
--    first. Replaces the bare "delete the group row and let FKs cascade" path.
--
-- 3. Settlement undo: big_book_settlement_revert_plan (read) and
--    big_book_revert_settlement (write). One settlement = one
--    business_ledger_settlement_requests row: its payments (rows with allocations)
--    and companions (gas fee / profit / kurs: same request id, no allocation).
--    Undo removes those rows, reopens the obligations this settlement closed, moves
--    obligations back to the group they were in before the settlement grouped them,
--    deletes the settlement's auto-created group when it ends up empty, and stamps
--    the request as reverted (kept for history).
--
--    big_book_record_settlement runs in one transaction, so every timestamp it writes
--    equals now() of that transaction: request.created_at, credit/debt_settled_at of
--    the obligations it closed, the auto-created group's created_at, and the
--    changed_at of the audit rows that record each obligation's group move. Those
--    equalities identify exactly what the settlement changed, without modifying
--    big_book_record_settlement. A closure re-stamped later by someone else no longer
--    matches and is left alone.
--
--    Payments recorded before settlement requests existed (backfilled, no request id)
--    can be undone one payment at a time; their closure and grouping are left as is.

-- ---------------------------------------------------------------------------
-- 1. Deferred obligation foreign key
-- ---------------------------------------------------------------------------
do $$
declare
  v_name text;
begin
  for v_name in
    select c.conname
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
    where c.conrelid = 'public.business_ledger_settlement_allocations'::regclass
      and c.contype = 'f'
      and a.attname = 'obligation_entry_id'
  loop
    execute format('alter table public.business_ledger_settlement_allocations drop constraint %I', v_name);
  end loop;
end;
$$;

alter table public.business_ledger_settlement_allocations
  add constraint settlement_allocations_obligation_entry_fkey
    foreign key (obligation_entry_id)
    references public.business_ledger_entries(id)
    on delete no action
    deferrable initially deferred;

-- ---------------------------------------------------------------------------
-- Request revert stamp
-- ---------------------------------------------------------------------------
alter table public.business_ledger_settlement_requests
  add column if not exists reverted_at timestamptz null,
  add column if not exists reverted_by uuid null references auth.users(id) on delete set null,
  add column if not exists revert_reason text null;

-- ---------------------------------------------------------------------------
-- Linked closure of a set of entries: every obligation/payment connected to them
-- through allocations, plus the companions of those payments' requests.
-- ---------------------------------------------------------------------------
create or replace function public.big_book_linked_closure(p_entry_ids uuid[])
returns uuid[]
language sql
stable
set search_path = public
as $$
  with recursive component(id) as (
    select x from unnest(coalesce(p_entry_ids, '{}'::uuid[])) as x
    union
    select case when a.payment_entry_id = c.id then a.obligation_entry_id else a.payment_entry_id end
    from component c
    join public.business_ledger_settlement_allocations a
      on a.payment_entry_id = c.id or a.obligation_entry_id = c.id
  ),
  companions as (
    select c.id
    from public.business_ledger_entries c
    where c.settlement_request_id in (
        select p.settlement_request_id
        from public.business_ledger_entries p
        where p.id in (select component.id from component)
          and p.settlement_request_id is not null
          and exists (
            select 1 from public.business_ledger_settlement_allocations a where a.payment_entry_id = p.id
          )
      )
      and not exists (
        select 1 from public.business_ledger_settlement_allocations a where a.payment_entry_id = c.id
      )
  )
  select coalesce(array_agg(distinct u.id order by u.id), '{}'::uuid[])
  from (
    select component.id from component
    union
    select companions.id from companions
  ) u;
$$;

revoke all on function public.big_book_linked_closure(uuid[]) from public, anon;
grant execute on function public.big_book_linked_closure(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- WRITE: delete a group and its entries.
-- p_expected_entry_ids: the group's entry ids the caller showed (null skips the check).
-- Entries outside the group that are linked to it (the other side of a settlement,
-- or a payment's companions) are deleted only when p_cascade_linked is true and
-- p_expected_linked_ids matches them exactly.
-- Errors: group_not_found (PT404); group_changed, linked_set_requires_confirmation,
--         linked_set_changed (PT409); not_admin (PT403).
-- ---------------------------------------------------------------------------
create or replace function public.big_book_delete_group(
  p_group_id uuid,
  p_expected_entry_ids uuid[],
  p_cascade_linked boolean,
  p_expected_linked_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_members uuid[];
  v_expected uuid[];
  v_closure uuid[];
  v_locked_closure uuid[];
  v_external uuid[];
  v_all uuid[];
  v_touched_groups uuid[];
begin
  if not public.is_admin() then
    raise exception using errcode = 'PT403', message = 'not_admin', detail = 'Admin access required.';
  end if;

  perform 1 from public.business_ledger_entry_groups g where g.id = p_group_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'group_not_found', detail = 'Group not found.';
  end if;

  v_members := array(
    select e.id from public.business_ledger_entries e where e.group_id = p_group_id order by e.id
  );
  perform 1 from public.business_ledger_entries e where e.id = any(v_members) order by e.id for update;

  if p_expected_entry_ids is not null then
    v_expected := array(select distinct x from unnest(p_expected_entry_ids) as x order by x);
    if v_expected is distinct from v_members then
      raise exception using errcode = 'PT409', message = 'group_changed',
        detail = 'The transactions in this group changed since you opened this dialog. Refresh and try again.',
        hint = jsonb_build_object('member_ids', v_members)::text;
    end if;
  end if;

  -- Lock the linked closure, then recompute it: a settlement that committed between
  -- the first read and the lock would otherwise be missed.
  v_closure := public.big_book_linked_closure(v_members);
  perform 1 from public.business_ledger_entries e where e.id = any(v_closure) order by e.id for update;
  v_locked_closure := public.big_book_linked_closure(v_members);
  if v_locked_closure is distinct from v_closure then
    raise exception using errcode = 'PT409', message = 'linked_set_changed',
      detail = 'The linked settlements changed while deleting. Refresh and try again.';
  end if;

  v_external := array(select x from unnest(v_closure) as x where x <> all(v_members) order by x);

  if cardinality(v_external) > 0 then
    if not coalesce(p_cascade_linked, false) then
      raise exception using errcode = 'PT409', message = 'linked_set_requires_confirmation',
        detail = 'This group is linked to settlement records outside the group. Delete them together.',
        hint = jsonb_build_object('member_ids', v_external)::text;
    end if;
    v_expected := array(
      select distinct x from unnest(coalesce(p_expected_linked_ids, '{}'::uuid[])) as x order by x
    );
    if v_expected is distinct from v_external then
      raise exception using errcode = 'PT409', message = 'linked_set_changed',
        detail = 'The linked settlements changed since you opened this dialog. Refresh and try again.',
        hint = jsonb_build_object('member_ids', v_external)::text;
    end if;
  end if;

  v_all := v_members || v_external;
  v_touched_groups := array(
    select distinct e.group_id
    from public.business_ledger_entries e
    where e.id = any(v_external) and e.group_id is not null and e.group_id <> p_group_id
  );

  -- Allocations first: every allocation touching v_all has both ends in v_all
  -- (closure), so nothing outside is left pointing at a deleted row.
  delete from public.business_ledger_settlement_allocations a
  where a.payment_entry_id = any(v_all) or a.obligation_entry_id = any(v_all);

  delete from public.business_ledger_entries e where e.id = any(v_all);

  delete from public.business_ledger_entry_groups g where g.id = p_group_id;

  -- Other groups emptied by the linked delete are removed too.
  delete from public.business_ledger_entry_groups g
  where g.id = any(v_touched_groups)
    and not exists (select 1 from public.business_ledger_entries e where e.group_id = g.id);

  return jsonb_build_object(
    'deleted_ids', to_jsonb(v_all),
    'linked_ids', to_jsonb(v_external)
  );
end;
$$;

revoke all on function public.big_book_delete_group(uuid, uuid[], boolean, uuid[]) from public, anon;
grant execute on function public.big_book_delete_group(uuid, uuid[], boolean, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- READ: what undoing one settlement would change.
-- Pass the request id, or a payment id (its request is used; a payment without a
-- request is a legacy single-payment undo).
-- Errors: invalid_command, not_a_settlement (PT422); settlement_not_found (PT404);
--         settlement_already_reverted (PT409); not_admin (PT403).
-- ---------------------------------------------------------------------------
create or replace function public.big_book_settlement_revert_plan(
  p_request_id uuid,
  p_payment_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_request_id uuid := p_request_id;
  v_req public.business_ledger_settlement_requests%rowtype;
  v_req_created_at timestamptz;
  v_legacy boolean := false;
  v_payments uuid[];
  v_companions uuid[];
  v_removed uuid[];
  v_obligations uuid[];
  v_kind text;
  v_group_id uuid;
  v_group_label text;
  v_group_created boolean := false;
  v_obligation_rows jsonb;
  v_moving uuid[];
  v_group_remaining integer := 0;
begin
  if not public.is_admin() then
    raise exception using errcode = 'PT403', message = 'not_admin', detail = 'Admin access required.';
  end if;

  if v_request_id is null then
    if p_payment_id is null then
      raise exception using errcode = 'PT422', message = 'invalid_command',
        detail = 'A settlement request id or payment id is required.';
    end if;
    select e.settlement_request_id into v_request_id
    from public.business_ledger_entries e
    where e.id = p_payment_id;
    if not found then
      raise exception using errcode = 'PT404', message = 'settlement_not_found',
        detail = 'This settlement no longer exists.';
    end if;
    if not exists (
      select 1 from public.business_ledger_settlement_allocations a where a.payment_entry_id = p_payment_id
    ) then
      raise exception using errcode = 'PT422', message = 'not_a_settlement',
        detail = 'This entry is not a settlement payment.';
    end if;
    v_legacy := v_request_id is null;
  end if;

  if v_legacy then
    v_payments := array[p_payment_id];
    v_companions := '{}'::uuid[];
    select e.group_id into v_group_id from public.business_ledger_entries e where e.id = p_payment_id;
  else
    select * into v_req from public.business_ledger_settlement_requests r where r.id = v_request_id;
    if not found then
      raise exception using errcode = 'PT404', message = 'settlement_not_found',
        detail = 'This settlement no longer exists.';
    end if;
    if v_req.reverted_at is not null then
      raise exception using errcode = 'PT409', message = 'settlement_already_reverted',
        detail = 'This settlement was already undone.';
    end if;
    v_req_created_at := v_req.created_at;
    v_payments := array(
      select e.id from public.business_ledger_entries e
      where e.settlement_request_id = v_request_id
        and exists (select 1 from public.business_ledger_settlement_allocations a where a.payment_entry_id = e.id)
      order by e.id
    );
    v_companions := array(
      select e.id from public.business_ledger_entries e
      where e.settlement_request_id = v_request_id
        and not exists (select 1 from public.business_ledger_settlement_allocations a where a.payment_entry_id = e.id)
      order by e.id
    );
    if cardinality(v_payments) + cardinality(v_companions) = 0 then
      raise exception using errcode = 'PT404', message = 'settlement_not_found',
        detail = 'The records of this settlement were already deleted.';
    end if;
    v_group_id := v_req.group_id;
  end if;

  v_removed := array(select x from unnest(v_payments || v_companions) as x order by x);
  v_obligations := array(
    select distinct a.obligation_entry_id
    from public.business_ledger_settlement_allocations a
    where a.payment_entry_id = any(v_payments)
    order by 1
  );

  select case when bool_or(o.is_debt) then 'debt' when count(*) > 0 then 'credit' end
  into v_kind
  from public.business_ledger_entries o
  where o.id = any(v_obligations);

  if v_group_id is not null then
    select g.label, (not v_legacy and g.created_at = v_req_created_at)
    into v_group_label, v_group_created
    from public.business_ledger_entry_groups g
    where g.id = v_group_id;
    if not found then
      v_group_id := null;
      v_group_label := null;
      v_group_created := false;
    end if;
  end if;
  v_group_created := coalesce(v_group_created, false);

  with obligation_rows as (
    select
      o.id,
      o.entry_date,
      o.explanation,
      o.amount,
      o.currency_code,
      o.is_debt,
      o.is_future_credit,
      o.group_id,
      (
        not v_legacy
        and (
          (o.is_debt and o.debt_settled_at = v_req_created_at)
          or (not o.is_debt and o.credit_settled_at = v_req_created_at)
        )
      ) as reopen,
      (
        select sum(a.applied_amount)
        from public.business_ledger_settlement_allocations a
        where a.obligation_entry_id = o.id and a.payment_entry_id = any(v_payments)
      ) as applied_amount,
      moved.previous_group_id,
      (moved.entry_id is not null) as restore_group
    from public.business_ledger_entries o
    left join lateral (
      select l.entry_id, nullif(l.old_row ->> 'group_id', '')::uuid as previous_group_id
      from public.business_ledger_entry_audit_logs l
      where v_group_created
        and o.group_id = v_group_id
        and l.entry_id = o.id
        and l.action = 'update'
        and l.changed_at = v_req_created_at
        and l.new_row ->> 'group_id' = v_group_id::text
        and (l.old_row ->> 'group_id') is distinct from (l.new_row ->> 'group_id')
      limit 1
    ) moved on true
    where o.id = any(v_obligations)
  )
  select
    coalesce(jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'entry_date', r.entry_date,
        'explanation', r.explanation,
        'amount', r.amount,
        'currency_code', r.currency_code,
        'is_debt', r.is_debt,
        'is_future_credit', r.is_future_credit,
        'applied_amount', r.applied_amount,
        'reopen', r.reopen,
        'restore_group', r.restore_group,
        'restore_group_id', case when r.restore_group then pg.id end,
        'restore_group_label', case when r.restore_group then pg.label end
      )
      order by r.entry_date, r.id
    ), '[]'::jsonb),
    array_remove(array_agg(case when r.restore_group then r.id end), null)
  into v_obligation_rows, v_moving
  from obligation_rows r
  left join public.business_ledger_entry_groups pg on pg.id = r.previous_group_id;

  if v_group_id is not null then
    select count(*)::integer into v_group_remaining
    from public.business_ledger_entries e
    where e.group_id = v_group_id
      and e.id <> all(v_removed)
      and e.id <> all(coalesce(v_moving, '{}'::uuid[]));
  end if;

  return jsonb_build_object(
    'request_id', v_request_id,
    'legacy', v_legacy,
    'kind', v_kind,
    'recorded_at', v_req_created_at,
    'entry_ids', to_jsonb(v_removed),
    'payments', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', e.id,
          'entry_date', e.entry_date,
          'explanation', e.explanation,
          'amount', e.amount,
          'currency_code', e.currency_code,
          'entry_direction', e.entry_direction
        )
        order by e.entry_date, e.id
      ), '[]'::jsonb)
      from public.business_ledger_entries e
      where e.id = any(v_payments)
    ),
    'companions', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', e.id,
          'entry_date', e.entry_date,
          'explanation', e.explanation,
          'amount', e.amount,
          'currency_code', e.currency_code,
          'entry_direction', e.entry_direction
        )
        order by e.entry_date, e.id
      ), '[]'::jsonb)
      from public.business_ledger_entries e
      where e.id = any(v_companions)
    ),
    'obligations', v_obligation_rows,
    'group', case
      when v_group_id is null then null
      else jsonb_build_object(
        'id', v_group_id,
        'label', v_group_label,
        'created_by_settlement', v_group_created,
        'delete_after_revert', v_group_created and v_group_remaining = 0
      )
    end
  );
end;
$$;

revoke all on function public.big_book_settlement_revert_plan(uuid, uuid) from public, anon;
grant execute on function public.big_book_settlement_revert_plan(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- WRITE: undo one settlement.
-- p_expected_entry_ids must equal the plan's entry_ids (payments + companions).
-- Errors: as the plan, plus settlement_changed (PT409).
-- ---------------------------------------------------------------------------
create or replace function public.big_book_revert_settlement(
  p_request_id uuid,
  p_payment_id uuid,
  p_expected_entry_ids uuid[],
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_request_id uuid := p_request_id;
  v_payment_id uuid;
  v_plan jsonb;
  v_removed uuid[];
  v_payments uuid[];
  v_obligations uuid[];
  v_expected uuid[];
  v_reopened uuid[] := '{}'::uuid[];
  v_regrouped uuid[] := '{}'::uuid[];
  v_group_id uuid;
  v_group_deleted boolean := false;
  r record;
begin
  if not public.is_admin() then
    raise exception using errcode = 'PT403', message = 'not_admin', detail = 'Admin access required.';
  end if;

  if v_request_id is null and p_payment_id is not null then
    select e.settlement_request_id into v_request_id
    from public.business_ledger_entries e
    where e.id = p_payment_id;
  end if;
  v_payment_id := case when v_request_id is null then p_payment_id end;

  -- Two undos of the same settlement serialize here; the second then sees reverted_at.
  if v_request_id is not null then
    perform 1 from public.business_ledger_settlement_requests q where q.id = v_request_id for update;
  end if;

  v_plan := public.big_book_settlement_revert_plan(v_request_id, v_payment_id);
  v_removed := array(select x::uuid from jsonb_array_elements_text(v_plan -> 'entry_ids') as x order by 1);
  v_obligations := array(
    select (o ->> 'id')::uuid from jsonb_array_elements(v_plan -> 'obligations') as o order by 1
  );
  perform 1 from public.business_ledger_entries e
  where e.id = any(v_removed || v_obligations)
  order by e.id
  for update;

  -- Re-read under the locks.
  v_plan := public.big_book_settlement_revert_plan(v_request_id, v_payment_id);
  v_removed := array(select x::uuid from jsonb_array_elements_text(v_plan -> 'entry_ids') as x order by 1);

  v_expected := array(
    select distinct x from unnest(coalesce(p_expected_entry_ids, '{}'::uuid[])) as x order by x
  );
  if v_expected is distinct from v_removed then
    raise exception using errcode = 'PT409', message = 'settlement_changed',
      detail = 'This settlement changed since you opened this dialog. Refresh and try again.',
      hint = jsonb_build_object('entry_ids', v_removed)::text;
  end if;

  v_payments := array(
    select (p ->> 'id')::uuid from jsonb_array_elements(v_plan -> 'payments') as p
  );

  delete from public.business_ledger_settlement_allocations a where a.payment_entry_id = any(v_payments);
  delete from public.business_ledger_entries e where e.id = any(v_removed);

  for r in
    select
      (o ->> 'id')::uuid as id,
      coalesce((o ->> 'is_debt')::boolean, false) as is_debt,
      coalesce((o ->> 'reopen')::boolean, false) as reopen,
      coalesce((o ->> 'restore_group')::boolean, false) as restore_group,
      nullif(o ->> 'restore_group_id', '')::uuid as restore_group_id
    from jsonb_array_elements(v_plan -> 'obligations') as o
  loop
    if r.reopen and r.is_debt then
      update public.business_ledger_entries e
      set debt_settled_at = null, debt_settled_by = null, debt_settlement_note = null, updated_by = v_actor
      where e.id = r.id;
      v_reopened := v_reopened || r.id;
    elsif r.reopen then
      update public.business_ledger_entries e
      set credit_settled_at = null, credit_settled_by = null, credit_settlement_note = null, updated_by = v_actor
      where e.id = r.id;
      v_reopened := v_reopened || r.id;
    end if;

    if r.restore_group then
      update public.business_ledger_entries e
      set group_id = r.restore_group_id, updated_by = v_actor
      where e.id = r.id;
      v_regrouped := v_regrouped || r.id;
    end if;
  end loop;

  v_group_id := nullif(v_plan #>> '{group,id}', '')::uuid;
  if v_group_id is not null
    and coalesce((v_plan #>> '{group,created_by_settlement}')::boolean, false)
    and not exists (select 1 from public.business_ledger_entries e where e.group_id = v_group_id)
  then
    delete from public.business_ledger_entry_groups g where g.id = v_group_id;
    v_group_deleted := true;
  end if;

  if v_request_id is not null then
    update public.business_ledger_settlement_requests q
    set reverted_at = now(), reverted_by = v_actor, revert_reason = nullif(trim(coalesce(p_reason, '')), '')
    where q.id = v_request_id;
  end if;

  return jsonb_build_object(
    'request_id', v_request_id,
    'deleted_ids', to_jsonb(v_removed),
    'reopened_ids', to_jsonb(v_reopened),
    'regrouped_ids', to_jsonb(v_regrouped),
    'group_id', v_group_id,
    'group_deleted', v_group_deleted
  );
end;
$$;

revoke all on function public.big_book_revert_settlement(uuid, uuid, uuid[], text) from public, anon;
grant execute on function public.big_book_revert_settlement(uuid, uuid, uuid[], text) to authenticated;
