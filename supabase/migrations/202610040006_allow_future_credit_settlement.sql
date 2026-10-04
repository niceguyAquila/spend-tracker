-- Future Credit may receive settlements without Actualize first.
-- Keep other settlement-target guards; drop only the future-credit block.

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

  if NEW.is_future_credit then
    raise exception 'a settlement entry cannot also be marked as future credit';
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
