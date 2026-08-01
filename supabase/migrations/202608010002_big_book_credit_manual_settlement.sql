-- Manual credit settlement: admin closes a credit explicitly.
-- Payment amount and closure are independent — over/under payment is allowed.

alter table public.business_ledger_entries
  add column if not exists credit_settled_at timestamptz null,
  add column if not exists credit_settled_by uuid null
    references auth.users(id) on delete set null,
  add column if not exists credit_settlement_note text null;

alter table public.business_ledger_entries
  drop constraint if exists business_ledger_entries_credit_settled_requires_credit;
alter table public.business_ledger_entries
  add constraint business_ledger_entries_credit_settled_requires_credit
    check (credit_settled_at is null or is_credit);

create index if not exists idx_business_ledger_entries_open_credit
  on public.business_ledger_entries(is_credit)
  where is_credit and credit_settled_at is null;

-- Structural settlement validation only — no outstanding / overpayment cap.
create or replace function public.business_ledger_entry_settlement_valid()
returns trigger
language plpgsql
as $$
declare
  target_is_credit boolean;
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

  select e.is_credit, e.settles_entry_id
  into target_is_credit, target_settles_entry_id
  from public.business_ledger_entries e
  where e.id = NEW.settles_entry_id;

  if target_is_credit is null then
    raise exception 'settlement target entry % not found', NEW.settles_entry_id;
  end if;

  if not target_is_credit then
    raise exception 'settlement target entry % is not marked as credit', NEW.settles_entry_id;
  end if;

  if target_settles_entry_id is not null then
    raise exception 'settlement target entry % is itself a settlement (chains are not allowed)', NEW.settles_entry_id;
  end if;

  if NEW.settlement_amount_in_credit_currency is null then
    raise exception 'settlement_amount_in_credit_currency is required when settles_entry_id is set';
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_business_ledger_entry_settlement_valid
  on public.business_ledger_entries;
create trigger trg_business_ledger_entry_settlement_valid
before insert or update on public.business_ledger_entries
for each row execute function public.business_ledger_entry_settlement_valid();

-- Guard: cannot clear is_credit while settlement rows still point at the entry.
create or replace function public.business_ledger_credit_entry_guard()
returns trigger
language plpgsql
as $$
declare
  settlement_count integer;
begin
  if not OLD.is_credit then
    return NEW;
  end if;

  if NEW.is_credit is not distinct from true then
    return NEW;
  end if;

  select count(*)::integer into settlement_count
  from public.business_ledger_entries s
  where s.settles_entry_id = OLD.id;

  if settlement_count > 0 then
    raise exception 'cannot clear is_credit on entry % while % settlement(s) exist',
      OLD.id, settlement_count;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_business_ledger_credit_entry_guard
  on public.business_ledger_entries;
create trigger trg_business_ledger_credit_entry_guard
before update on public.business_ledger_entries
for each row execute function public.business_ledger_credit_entry_guard();
