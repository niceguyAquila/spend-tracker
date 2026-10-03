-- Big Book debt marking (mirror of credit).
-- A debt entry (is_debt = true) means we owe the counterparty (outflow liability).
-- Mutually exclusive with is_credit. Outstanding = is_debt and debt_settled_at is null.

alter table public.business_ledger_entries
  add column if not exists is_debt boolean not null default false,
  add column if not exists debt_settled_at timestamptz null,
  add column if not exists debt_settled_by uuid null
    references auth.users(id) on delete set null,
  add column if not exists debt_settlement_note text null;

alter table public.business_ledger_entries
  drop constraint if exists business_ledger_entries_credit_debt_mutex;
alter table public.business_ledger_entries
  add constraint business_ledger_entries_credit_debt_mutex
    check (not (is_credit and is_debt));

alter table public.business_ledger_entries
  drop constraint if exists business_ledger_entries_debt_settlement_mutex;
alter table public.business_ledger_entries
  add constraint business_ledger_entries_debt_settlement_mutex
    check (not (is_debt and settles_entry_id is not null));

alter table public.business_ledger_entries
  drop constraint if exists business_ledger_entries_debt_settled_requires_debt;
alter table public.business_ledger_entries
  add constraint business_ledger_entries_debt_settled_requires_debt
    check (debt_settled_at is null or is_debt);

create index if not exists idx_business_ledger_entries_is_debt
  on public.business_ledger_entries(is_debt)
  where is_debt;

create index if not exists idx_business_ledger_entries_open_debt
  on public.business_ledger_entries(is_debt)
  where is_debt and debt_settled_at is null;

-- Settlement entries cannot also be debt (parallel to credit guard).
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

  if NEW.is_debt then
    raise exception 'a settlement entry cannot also be marked as debt';
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

  return NEW;
end;
$$;

drop trigger if exists trg_business_ledger_entry_settlement_valid
  on public.business_ledger_entries;
create trigger trg_business_ledger_entry_settlement_valid
before insert or update on public.business_ledger_entries
for each row execute function public.business_ledger_entry_settlement_valid();
