-- Big Book credit marking and settlement transactions.
-- A credit entry (is_credit = true) represents money a vendor owes us.
-- A later entry can settle it via settles_entry_id (with optional FX conversion).

alter table public.business_ledger_entries
  add column if not exists is_credit boolean not null default false,
  add column if not exists settles_entry_id uuid null
    references public.business_ledger_entries(id) on delete restrict,
  add column if not exists settlement_conversion_rate numeric(18, 8) null,
  add column if not exists settlement_amount_in_credit_currency numeric(18, 4) null,
  add column if not exists settlement_note text null;

alter table public.business_ledger_entries
  drop constraint if exists business_ledger_entries_credit_settlement_mutex;
alter table public.business_ledger_entries
  add constraint business_ledger_entries_credit_settlement_mutex
    check (not (is_credit and settles_entry_id is not null));

alter table public.business_ledger_entries
  drop constraint if exists business_ledger_entries_settlement_amount_pairing;
alter table public.business_ledger_entries
  add constraint business_ledger_entries_settlement_amount_pairing
    check ((settles_entry_id is null) = (settlement_amount_in_credit_currency is null));

alter table public.business_ledger_entries
  drop constraint if exists business_ledger_entries_settlement_rate_pairing;
alter table public.business_ledger_entries
  add constraint business_ledger_entries_settlement_rate_pairing
    check ((settles_entry_id is null) = (settlement_conversion_rate is null));

alter table public.business_ledger_entries
  drop constraint if exists business_ledger_entries_settlement_conversion_rate_check;
alter table public.business_ledger_entries
  add constraint business_ledger_entries_settlement_conversion_rate_check
    check (settlement_conversion_rate is null or settlement_conversion_rate > 0);

alter table public.business_ledger_entries
  drop constraint if exists business_ledger_entries_settlement_amount_in_credit_currency_check;
alter table public.business_ledger_entries
  add constraint business_ledger_entries_settlement_amount_in_credit_currency_check
    check (
      settlement_amount_in_credit_currency is null
      or settlement_amount_in_credit_currency > 0
    );

create index if not exists idx_business_ledger_entries_settles_entry
  on public.business_ledger_entries(settles_entry_id)
  where settles_entry_id is not null;

create index if not exists idx_business_ledger_entries_is_credit
  on public.business_ledger_entries(is_credit)
  where is_credit;

-- Validate settlement link target and outstanding balance (with row lock).
create or replace function public.business_ledger_entry_settlement_valid()
returns trigger
language plpgsql
as $$
declare
  target_is_credit boolean;
  target_settles_entry_id uuid;
  target_amount numeric(18, 4);
  total_settled numeric(18, 4);
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

  select e.is_credit, e.settles_entry_id, e.amount
  into target_is_credit, target_settles_entry_id, target_amount
  from public.business_ledger_entries e
  where e.id = NEW.settles_entry_id
  for update;

  if target_amount is null then
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

  select coalesce(sum(s.settlement_amount_in_credit_currency), 0)
  into total_settled
  from public.business_ledger_entries s
  where s.settles_entry_id = NEW.settles_entry_id
    and (TG_OP = 'INSERT' or s.id <> NEW.id);

  if (total_settled + NEW.settlement_amount_in_credit_currency) > target_amount then
    raise exception
      'settlement amount % (credit-currency equivalent %) exceeds outstanding balance (credit amount %, already settled %)',
      NEW.amount,
      NEW.settlement_amount_in_credit_currency,
      target_amount,
      total_settled;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_business_ledger_entry_settlement_valid
  on public.business_ledger_entries;
create trigger trg_business_ledger_entry_settlement_valid
before insert or update on public.business_ledger_entries
for each row execute function public.business_ledger_entry_settlement_valid();

-- Guard credit parent updates while settlements exist.
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

  select count(*)::integer into settlement_count
  from public.business_ledger_entries s
  where s.settles_entry_id = OLD.id;

  if settlement_count = 0 then
    return NEW;
  end if;

  if NEW.is_credit is distinct from true then
    raise exception 'cannot clear is_credit on entry % while % settlement(s) exist',
      OLD.id, settlement_count;
  end if;

  if NEW.amount < OLD.amount then
    raise exception 'cannot lower amount on credit entry % while % settlement(s) exist',
      OLD.id, settlement_count;
  end if;

  if NEW.currency_code is distinct from OLD.currency_code then
    raise exception 'cannot change currency on credit entry % while % settlement(s) exist',
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
