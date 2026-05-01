alter table public.credit_ledger_settlements
  add column if not exists settlement_currency_code text,
  add column if not exists conversion_rate numeric(18, 8),
  add column if not exists amount_in_entry_currency numeric(18, 4);

update public.credit_ledger_settlements s
set
  settlement_currency_code = coalesce(s.settlement_currency_code, e.currency_code),
  conversion_rate = coalesce(s.conversion_rate, 1),
  amount_in_entry_currency = coalesce(s.amount_in_entry_currency, s.amount)
from public.credit_ledger_entries e
where e.id = s.entry_id
  and (
    s.settlement_currency_code is null
    or s.conversion_rate is null
    or s.amount_in_entry_currency is null
  );

alter table public.credit_ledger_settlements
  alter column settlement_currency_code set not null,
  alter column conversion_rate set not null,
  alter column amount_in_entry_currency set not null;

alter table public.credit_ledger_settlements
  drop constraint if exists credit_ledger_settlements_settlement_currency_check;
alter table public.credit_ledger_settlements
  add constraint credit_ledger_settlements_settlement_currency_check
    check (settlement_currency_code in ('IDR', 'MYR', 'USDT', 'TRX'));

alter table public.credit_ledger_settlements
  drop constraint if exists credit_ledger_settlements_conversion_rate_check;
alter table public.credit_ledger_settlements
  add constraint credit_ledger_settlements_conversion_rate_check
    check (conversion_rate > 0);

alter table public.credit_ledger_settlements
  drop constraint if exists credit_ledger_settlements_amount_in_entry_currency_check;
alter table public.credit_ledger_settlements
  add constraint credit_ledger_settlements_amount_in_entry_currency_check
    check (amount_in_entry_currency > 0);

create or replace function public.credit_ledger_settlement_amount_within_outstanding()
returns trigger
language plpgsql
as $$
declare
  entry_amount numeric(18, 4);
  total_settled numeric(18, 4);
begin
  select e.amount into entry_amount
  from public.credit_ledger_entries e
  where e.id = NEW.entry_id;

  if entry_amount is null then
    raise exception 'credit ledger entry % not found', NEW.entry_id;
  end if;

  select coalesce(sum(s.amount_in_entry_currency), 0) into total_settled
  from public.credit_ledger_settlements s
  where s.entry_id = NEW.entry_id
    and (TG_OP = 'INSERT' or s.id <> NEW.id);

  if (total_settled + NEW.amount_in_entry_currency) > entry_amount then
    raise exception 'settlement amount % (entry-currency equivalent %) exceeds outstanding balance (entry amount %, already settled %)',
      NEW.amount, NEW.amount_in_entry_currency, entry_amount, total_settled;
  end if;

  return NEW;
end;
$$;
