-- Cross-currency settlements may omit settlement_amount_in_credit_currency
-- (and settlement_conversion_rate). Same-currency settles still store rate = 1
-- and credit-currency amount = settle amount via the API.
--
-- Idempotent follow-up to 202610020002: keep FX fields optional whenever
-- settles_entry_id is set.

alter table public.business_ledger_entries
  drop constraint if exists business_ledger_entries_settlement_rate_pairing;

alter table public.business_ledger_entries
  drop constraint if exists business_ledger_entries_settlement_amount_pairing;

alter table public.business_ledger_entries
  drop constraint if exists business_ledger_entries_settlement_fx_pairing;

alter table public.business_ledger_entries
  add constraint business_ledger_entries_settlement_fx_pairing
    check (
      (settlement_conversion_rate is null) = (settlement_amount_in_credit_currency is null)
      and (
        settlement_conversion_rate is null
        or settles_entry_id is not null
      )
    );

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

  -- settlement_amount_in_credit_currency is intentionally optional for
  -- cross-currency settles (e.g. MYR credit paid in USDT only).

  return NEW;
end;
$$;

drop trigger if exists trg_business_ledger_entry_settlement_valid
  on public.business_ledger_entries;
create trigger trg_business_ledger_entry_settlement_valid
before insert or update on public.business_ledger_entries
for each row execute function public.business_ledger_entry_settlement_valid();
