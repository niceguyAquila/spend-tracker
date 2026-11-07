-- 1. Attachment file cleanup.
--    Deleting a ledger entry cascades to business_ledger_attachments, but the files
--    live in Supabase Storage and were never removed. Files can only be removed
--    through the Storage API (deleting storage.objects rows from SQL leaves the
--    underlying object behind), so the database records what must go and the app
--    removes it:
--      * an AFTER DELETE trigger on business_ledger_attachments queues every
--        removed storage_path, whatever deleted the row (entry delete, group delete,
--        settlement undo, group edit, FK cascade, the attachment route);
--      * after each delete the app drains the queue with the service-role client
--        and dequeues what Storage confirmed. Failures stay queued and are retried
--        on the next drain.
--
-- 2. big_book_update_group: the group edit form's save as ONE transaction
--    (label/remark, removed rows, edited rows, new rows). Any failure, including the
--    settlement guard trigger, rolls everything back.

-- ---------------------------------------------------------------------------
-- 1. Attachment purge queue
-- ---------------------------------------------------------------------------
create table if not exists public.business_ledger_attachment_purge_queue (
  bucket_id text not null default 'big-book-attachments',
  storage_path text not null,
  queued_at timestamptz not null default now(),
  attempts integer not null default 0,
  last_error text null,
  last_attempt_at timestamptz null,
  primary key (bucket_id, storage_path)
);

create index if not exists idx_attachment_purge_queue_queued
  on public.business_ledger_attachment_purge_queue(queued_at);

-- Service role only (the app drains it with the admin client).
alter table public.business_ledger_attachment_purge_queue enable row level security;
revoke all on table public.business_ledger_attachment_purge_queue from anon, authenticated;
grant select, insert, update, delete on table public.business_ledger_attachment_purge_queue to service_role;

create or replace function public.queue_business_ledger_attachment_purge()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.business_ledger_attachment_purge_queue (bucket_id, storage_path)
  values ('big-book-attachments', OLD.storage_path)
  on conflict (bucket_id, storage_path) do nothing;
  return OLD;
end;
$$;

drop trigger if exists trg_queue_business_ledger_attachment_purge on public.business_ledger_attachments;
create trigger trg_queue_business_ledger_attachment_purge
after delete on public.business_ledger_attachments
for each row execute function public.queue_business_ledger_attachment_purge();

-- Backfill: files already orphaned by earlier deletes. Objects younger than a day
-- are skipped so an upload whose attachment row is still being written is never
-- queued.
insert into public.business_ledger_attachment_purge_queue (bucket_id, storage_path)
select o.bucket_id, o.name
from storage.objects o
where o.bucket_id = 'big-book-attachments'
  and o.created_at < now() - interval '1 day'
  and not exists (
    select 1 from public.business_ledger_attachments a where a.storage_path = o.name
  )
on conflict (bucket_id, storage_path) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Transactional group edit
-- p_entries: [{ id?, entry_date, entry_direction, entry_type_id, vendor_type_id,
--   vendor_id, pocket_id, action_by_id, explanation, amount, currency_code, remark,
--   responsible_actor_id, is_credit, is_future_credit, is_debt }] — normalized by the
--   caller. Rows with an id are updated (only when a field changed), rows without
--   are inserted, group members not listed are deleted.
-- p_expected_entry_ids: the members the editor loaded (null skips the check), so a
--   row someone else added meanwhile is never deleted by an older form.
-- Errors: group_not_found (PT404); group_changed, settlement_rows_in_removal,
--   settlement guard PT409 from trg_settlement_entry_guard (PT409);
--   invalid_command, entry_not_in_group (PT422); not_admin (PT403).
-- ---------------------------------------------------------------------------
create or replace function public.big_book_update_group(
  p_group_id uuid,
  p_label text,
  p_remark text,
  p_entries jsonb,
  p_expected_entry_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_members uuid[];
  v_expected uuid[];
  v_keep uuid[];
  v_remove uuid[];
  v_bad uuid[];
  v_count integer;
  v_updated uuid[] := '{}'::uuid[];
  v_inserted uuid[] := '{}'::uuid[];
  v_new_id uuid;
  v_changed integer;
  r record;
begin
  if not public.is_admin() then
    raise exception using errcode = 'PT403', message = 'not_admin', detail = 'Admin access required.';
  end if;

  if p_entries is null or jsonb_typeof(p_entries) <> 'array' then
    raise exception using errcode = 'PT422', message = 'invalid_command',
      detail = 'Entries must be an array.';
  end if;
  v_count := jsonb_array_length(p_entries);
  if v_count < 2 or v_count > 50 then
    raise exception using errcode = 'PT422', message = 'invalid_command',
      detail = 'A grouped transaction needs 2 to 50 entries.';
  end if;
  if char_length(trim(coalesce(p_label, ''))) < 2 then
    raise exception using errcode = 'PT422', message = 'invalid_command',
      detail = 'Group label must be at least 2 characters.';
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
        detail = 'The transactions in this group changed since you opened the editor. Refresh and try again.',
        hint = jsonb_build_object('member_ids', v_members)::text;
    end if;
  end if;

  v_keep := array(
    select (x ->> 'id')::uuid
    from jsonb_array_elements(p_entries) as x
    where nullif(x ->> 'id', '') is not null
  );
  if cardinality(v_keep) <> (select count(distinct k) from unnest(v_keep) as k) then
    raise exception using errcode = 'PT422', message = 'invalid_command',
      detail = 'An entry is listed twice.';
  end if;

  v_bad := array(select k from unnest(v_keep) as k where k <> all(v_members) order by k);
  if cardinality(v_bad) > 0 then
    raise exception using errcode = 'PT422', message = 'entry_not_in_group',
      detail = 'Some entries do not belong to this group.',
      hint = jsonb_build_object('ids', v_bad)::text;
  end if;

  v_remove := array(select m from unnest(v_members) as m where m <> all(v_keep) order by m);

  -- Settlement rows leave through "Delete record" (linked set) or "Undo settlement".
  v_bad := array(
    select distinct x.id
    from unnest(v_remove) as x(id)
    where exists (
        select 1 from public.business_ledger_settlement_allocations a
        where a.payment_entry_id = x.id or a.obligation_entry_id = x.id
      )
      or exists (
        select 1 from public.business_ledger_entries e
        where e.id = x.id and e.settlement_request_id is not null
      )
    order by x.id
  );
  if cardinality(v_bad) > 0 then
    raise exception using errcode = 'PT409', message = 'settlement_rows_in_removal',
      detail = 'Some removed transactions are part of a credit/debt settlement.',
      hint = jsonb_build_object('ids', v_bad)::text;
  end if;

  update public.business_ledger_entry_groups g
  set label = trim(p_label), remark = nullif(p_remark, ''), updated_by = v_actor
  where g.id = p_group_id;

  if cardinality(v_remove) > 0 then
    delete from public.business_ledger_entries e where e.id = any(v_remove);
  end if;

  for r in
    select *
    from jsonb_to_recordset(p_entries) as x(
      id uuid,
      entry_date date,
      entry_direction text,
      entry_type_id uuid,
      vendor_type_id uuid,
      vendor_id uuid,
      pocket_id uuid,
      action_by_id uuid,
      explanation text,
      amount numeric,
      currency_code text,
      remark text,
      responsible_actor_id uuid,
      is_credit boolean,
      is_future_credit boolean,
      is_debt boolean
    )
  loop
    if r.id is not null then
      update public.business_ledger_entries e
      set
        entry_date = r.entry_date,
        entry_direction = r.entry_direction,
        entry_type_id = r.entry_type_id,
        vendor_type_id = r.vendor_type_id,
        vendor_id = r.vendor_id,
        pocket_id = r.pocket_id,
        action_by_id = r.action_by_id,
        explanation = r.explanation,
        amount = r.amount,
        currency_code = r.currency_code,
        remark = nullif(r.remark, ''),
        responsible_actor_id = r.responsible_actor_id,
        is_credit = coalesce(r.is_credit, false),
        is_future_credit = coalesce(r.is_future_credit, false),
        is_debt = coalesce(r.is_debt, false),
        updated_by = v_actor
      where e.id = r.id
        and e.group_id = p_group_id
        and (
          e.entry_date, e.entry_direction, e.entry_type_id, e.vendor_type_id, e.vendor_id,
          e.pocket_id, e.action_by_id, e.explanation, e.amount, e.currency_code, e.remark,
          e.responsible_actor_id, e.is_credit, e.is_future_credit, e.is_debt
        ) is distinct from (
          r.entry_date, r.entry_direction, r.entry_type_id, r.vendor_type_id, r.vendor_id,
          r.pocket_id, r.action_by_id, r.explanation, r.amount::numeric(18, 4), r.currency_code,
          nullif(r.remark, ''), r.responsible_actor_id, coalesce(r.is_credit, false),
          coalesce(r.is_future_credit, false), coalesce(r.is_debt, false)
        );
      get diagnostics v_changed = row_count;
      if v_changed > 0 then
        v_updated := v_updated || r.id;
      end if;
    else
      insert into public.business_ledger_entries (
        group_id, entry_date, entry_direction, entry_type_id, vendor_type_id, vendor_id,
        pocket_id, action_by_id, explanation, amount, currency_code, remark, responsible_actor_id,
        is_credit, is_future_credit, is_debt, created_by, updated_by
      )
      values (
        p_group_id, r.entry_date, r.entry_direction, r.entry_type_id, r.vendor_type_id, r.vendor_id,
        r.pocket_id, r.action_by_id, r.explanation, r.amount, r.currency_code, nullif(r.remark, ''),
        r.responsible_actor_id, coalesce(r.is_credit, false), coalesce(r.is_future_credit, false),
        coalesce(r.is_debt, false), v_actor, v_actor
      )
      returning id into v_new_id;
      v_inserted := v_inserted || v_new_id;
    end if;
  end loop;

  return jsonb_build_object(
    'updated_ids', to_jsonb(v_updated),
    'inserted_ids', to_jsonb(v_inserted),
    'deleted_ids', to_jsonb(v_remove)
  );
end;
$$;

revoke all on function public.big_book_update_group(uuid, text, text, jsonb, uuid[]) from public, anon;
grant execute on function public.big_book_update_group(uuid, text, text, jsonb, uuid[]) to authenticated;
