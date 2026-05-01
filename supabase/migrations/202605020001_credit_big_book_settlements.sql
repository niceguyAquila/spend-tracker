create table if not exists public.credit_ledger_settlements (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.credit_ledger_entries(id) on delete cascade,
  settlement_date date not null,
  amount numeric(18, 4) not null,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint credit_ledger_settlements_amount_check check (amount > 0)
);

create index if not exists idx_credit_ledger_settlements_entry_date
  on public.credit_ledger_settlements(entry_id, settlement_date desc);

drop trigger if exists trg_credit_ledger_settlements_updated_at on public.credit_ledger_settlements;
create trigger trg_credit_ledger_settlements_updated_at
before update on public.credit_ledger_settlements
for each row execute function public.set_row_updated_at();

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

  select coalesce(sum(s.amount), 0) into total_settled
  from public.credit_ledger_settlements s
  where s.entry_id = NEW.entry_id
    and (TG_OP = 'INSERT' or s.id <> NEW.id);

  if (total_settled + NEW.amount) > entry_amount then
    raise exception 'settlement amount % exceeds outstanding balance (entry amount %, already settled %)',
      NEW.amount, entry_amount, total_settled;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_credit_ledger_settlements_amount_within_outstanding on public.credit_ledger_settlements;
create trigger trg_credit_ledger_settlements_amount_within_outstanding
before insert or update on public.credit_ledger_settlements
for each row execute function public.credit_ledger_settlement_amount_within_outstanding();

create table if not exists public.credit_ledger_settlement_attachments (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.credit_ledger_settlements(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  file_size bigint not null check (file_size > 0),
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_credit_ledger_settlement_attachments_settlement
  on public.credit_ledger_settlement_attachments(settlement_id, created_at desc);

drop trigger if exists trg_credit_ledger_settlement_attachments_updated_at
  on public.credit_ledger_settlement_attachments;
create trigger trg_credit_ledger_settlement_attachments_updated_at
before update on public.credit_ledger_settlement_attachments
for each row execute function public.set_row_updated_at();

alter table public.credit_ledger_settlements enable row level security;
alter table public.credit_ledger_settlement_attachments enable row level security;

grant select, insert, update, delete on table public.credit_ledger_settlements to authenticated;
grant select, insert, update, delete on table public.credit_ledger_settlement_attachments to authenticated;

grant select, insert, update, delete on table public.credit_ledger_settlements to service_role;
grant select, insert, update, delete on table public.credit_ledger_settlement_attachments to service_role;

drop policy if exists credit_ledger_settlements_select_admin on public.credit_ledger_settlements;
create policy credit_ledger_settlements_select_admin
on public.credit_ledger_settlements
for select
to authenticated
using (
  public.is_admin()
  and exists (
    select 1
    from public.credit_ledger_entries cle
    where cle.id = credit_ledger_settlements.entry_id
      and public.has_brand_role(cle.brand_id, array['admin'])
  )
);

drop policy if exists credit_ledger_settlements_insert_admin on public.credit_ledger_settlements;
create policy credit_ledger_settlements_insert_admin
on public.credit_ledger_settlements
for insert
to authenticated
with check (
  public.is_admin()
  and exists (
    select 1
    from public.credit_ledger_entries cle
    where cle.id = credit_ledger_settlements.entry_id
      and public.has_brand_role(cle.brand_id, array['admin'])
  )
);

drop policy if exists credit_ledger_settlements_update_admin on public.credit_ledger_settlements;
create policy credit_ledger_settlements_update_admin
on public.credit_ledger_settlements
for update
to authenticated
using (
  public.is_admin()
  and exists (
    select 1
    from public.credit_ledger_entries cle
    where cle.id = credit_ledger_settlements.entry_id
      and public.has_brand_role(cle.brand_id, array['admin'])
  )
)
with check (
  public.is_admin()
  and exists (
    select 1
    from public.credit_ledger_entries cle
    where cle.id = credit_ledger_settlements.entry_id
      and public.has_brand_role(cle.brand_id, array['admin'])
  )
);

drop policy if exists credit_ledger_settlements_delete_admin on public.credit_ledger_settlements;
create policy credit_ledger_settlements_delete_admin
on public.credit_ledger_settlements
for delete
to authenticated
using (
  public.is_admin()
  and exists (
    select 1
    from public.credit_ledger_entries cle
    where cle.id = credit_ledger_settlements.entry_id
      and public.has_brand_role(cle.brand_id, array['admin'])
  )
);

drop policy if exists credit_ledger_settlement_attachments_select_admin
  on public.credit_ledger_settlement_attachments;
create policy credit_ledger_settlement_attachments_select_admin
on public.credit_ledger_settlement_attachments
for select
to authenticated
using (
  public.is_admin()
  and exists (
    select 1
    from public.credit_ledger_settlements cls
    join public.credit_ledger_entries cle on cle.id = cls.entry_id
    where cls.id = credit_ledger_settlement_attachments.settlement_id
      and public.has_brand_role(cle.brand_id, array['admin'])
  )
);

drop policy if exists credit_ledger_settlement_attachments_insert_admin
  on public.credit_ledger_settlement_attachments;
create policy credit_ledger_settlement_attachments_insert_admin
on public.credit_ledger_settlement_attachments
for insert
to authenticated
with check (
  public.is_admin()
  and exists (
    select 1
    from public.credit_ledger_settlements cls
    join public.credit_ledger_entries cle on cle.id = cls.entry_id
    where cls.id = credit_ledger_settlement_attachments.settlement_id
      and public.has_brand_role(cle.brand_id, array['admin'])
  )
);

drop policy if exists credit_ledger_settlement_attachments_update_admin
  on public.credit_ledger_settlement_attachments;
create policy credit_ledger_settlement_attachments_update_admin
on public.credit_ledger_settlement_attachments
for update
to authenticated
using (
  public.is_admin()
  and exists (
    select 1
    from public.credit_ledger_settlements cls
    join public.credit_ledger_entries cle on cle.id = cls.entry_id
    where cls.id = credit_ledger_settlement_attachments.settlement_id
      and public.has_brand_role(cle.brand_id, array['admin'])
  )
)
with check (
  public.is_admin()
  and exists (
    select 1
    from public.credit_ledger_settlements cls
    join public.credit_ledger_entries cle on cle.id = cls.entry_id
    where cls.id = credit_ledger_settlement_attachments.settlement_id
      and public.has_brand_role(cle.brand_id, array['admin'])
  )
);

drop policy if exists credit_ledger_settlement_attachments_delete_admin
  on public.credit_ledger_settlement_attachments;
create policy credit_ledger_settlement_attachments_delete_admin
on public.credit_ledger_settlement_attachments
for delete
to authenticated
using (
  public.is_admin()
  and exists (
    select 1
    from public.credit_ledger_settlements cls
    join public.credit_ledger_entries cle on cle.id = cls.entry_id
    where cls.id = credit_ledger_settlement_attachments.settlement_id
      and public.has_brand_role(cle.brand_id, array['admin'])
  )
);
