create table if not exists public.business_ledger_types (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_ledger_types_code_check check (char_length(trim(code)) >= 2),
  constraint business_ledger_types_name_check check (char_length(trim(name)) >= 2)
);

create unique index if not exists uq_business_ledger_types_code
  on public.business_ledger_types(lower(trim(code)));

create unique index if not exists uq_business_ledger_types_name
  on public.business_ledger_types(lower(trim(name)));

create index if not exists idx_business_ledger_types_active_sort
  on public.business_ledger_types(is_active, sort_order, name);

drop trigger if exists trg_business_ledger_types_updated_at on public.business_ledger_types;
create trigger trg_business_ledger_types_updated_at
before update on public.business_ledger_types
for each row execute function public.set_row_updated_at();

create table if not exists public.big_book_actors (
  id uuid primary key default gen_random_uuid(),
  actor_code text not null check (actor_code in ('A', 'B')),
  display_name text not null,
  user_id uuid references public.allowed_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_big_book_actors_actor_code
  on public.big_book_actors(actor_code);

drop trigger if exists trg_big_book_actors_updated_at on public.big_book_actors;
create trigger trg_big_book_actors_updated_at
before update on public.big_book_actors
for each row execute function public.set_row_updated_at();

create table if not exists public.business_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  entry_date date not null,
  entry_type_id uuid not null references public.business_ledger_types(id) on delete restrict,
  explanation text not null,
  amount numeric(18, 4) not null,
  currency_code text not null,
  remark text,
  responsible_actor_id uuid not null references public.big_book_actors(id) on delete restrict,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_ledger_entries_explanation_check check (char_length(trim(explanation)) >= 2),
  constraint business_ledger_entries_amount_check check (amount > 0),
  constraint business_ledger_entries_currency_check check (currency_code in ('IDR', 'MYR', 'USDT', 'TRX'))
);

create index if not exists idx_business_ledger_entries_brand_date
  on public.business_ledger_entries(brand_id, entry_date desc);

create index if not exists idx_business_ledger_entries_brand_type
  on public.business_ledger_entries(brand_id, entry_type_id);

create index if not exists idx_business_ledger_entries_responsible_actor
  on public.business_ledger_entries(responsible_actor_id);

drop trigger if exists trg_business_ledger_entries_updated_at on public.business_ledger_entries;
create trigger trg_business_ledger_entries_updated_at
before update on public.business_ledger_entries
for each row execute function public.set_row_updated_at();

create table if not exists public.business_ledger_attachments (
  id uuid primary key default gen_random_uuid(),
  ledger_entry_id uuid not null references public.business_ledger_entries(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  file_size bigint not null check (file_size > 0),
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_business_ledger_attachments_entry
  on public.business_ledger_attachments(ledger_entry_id, created_at desc);

drop trigger if exists trg_business_ledger_attachments_updated_at on public.business_ledger_attachments;
create trigger trg_business_ledger_attachments_updated_at
before update on public.business_ledger_attachments
for each row execute function public.set_row_updated_at();

alter table public.business_ledger_types enable row level security;
alter table public.big_book_actors enable row level security;
alter table public.business_ledger_entries enable row level security;
alter table public.business_ledger_attachments enable row level security;

grant select, insert, update, delete on table public.business_ledger_types to authenticated;
grant select, insert, update, delete on table public.big_book_actors to authenticated;
grant select, insert, update, delete on table public.business_ledger_entries to authenticated;
grant select, insert, update, delete on table public.business_ledger_attachments to authenticated;

grant select, insert, update, delete on table public.business_ledger_types to service_role;
grant select, insert, update, delete on table public.big_book_actors to service_role;
grant select, insert, update, delete on table public.business_ledger_entries to service_role;
grant select, insert, update, delete on table public.business_ledger_attachments to service_role;

drop policy if exists business_ledger_types_select_admin on public.business_ledger_types;
create policy business_ledger_types_select_admin
on public.business_ledger_types
for select
to authenticated
using (public.is_admin());

drop policy if exists business_ledger_types_write_admin on public.business_ledger_types;
create policy business_ledger_types_write_admin
on public.business_ledger_types
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists big_book_actors_select_admin on public.big_book_actors;
create policy big_book_actors_select_admin
on public.big_book_actors
for select
to authenticated
using (public.is_admin());

drop policy if exists big_book_actors_write_admin on public.big_book_actors;
create policy big_book_actors_write_admin
on public.big_book_actors
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists business_ledger_entries_select_admin on public.business_ledger_entries;
create policy business_ledger_entries_select_admin
on public.business_ledger_entries
for select
to authenticated
using (public.is_admin() and public.has_brand_role(brand_id, array['admin']));

drop policy if exists business_ledger_entries_insert_admin on public.business_ledger_entries;
create policy business_ledger_entries_insert_admin
on public.business_ledger_entries
for insert
to authenticated
with check (public.is_admin() and public.has_brand_role(brand_id, array['admin']));

drop policy if exists business_ledger_entries_update_admin on public.business_ledger_entries;
create policy business_ledger_entries_update_admin
on public.business_ledger_entries
for update
to authenticated
using (public.is_admin() and public.has_brand_role(brand_id, array['admin']))
with check (public.is_admin() and public.has_brand_role(brand_id, array['admin']));

drop policy if exists business_ledger_entries_delete_admin on public.business_ledger_entries;
create policy business_ledger_entries_delete_admin
on public.business_ledger_entries
for delete
to authenticated
using (public.is_admin() and public.has_brand_role(brand_id, array['admin']));

drop policy if exists business_ledger_attachments_select_admin on public.business_ledger_attachments;
create policy business_ledger_attachments_select_admin
on public.business_ledger_attachments
for select
to authenticated
using (
  public.is_admin()
  and exists (
    select 1
    from public.business_ledger_entries ble
    where ble.id = business_ledger_attachments.ledger_entry_id
      and public.has_brand_role(ble.brand_id, array['admin'])
  )
);

drop policy if exists business_ledger_attachments_insert_admin on public.business_ledger_attachments;
create policy business_ledger_attachments_insert_admin
on public.business_ledger_attachments
for insert
to authenticated
with check (
  public.is_admin()
  and exists (
    select 1
    from public.business_ledger_entries ble
    where ble.id = business_ledger_attachments.ledger_entry_id
      and public.has_brand_role(ble.brand_id, array['admin'])
  )
);

drop policy if exists business_ledger_attachments_update_admin on public.business_ledger_attachments;
create policy business_ledger_attachments_update_admin
on public.business_ledger_attachments
for update
to authenticated
using (
  public.is_admin()
  and exists (
    select 1
    from public.business_ledger_entries ble
    where ble.id = business_ledger_attachments.ledger_entry_id
      and public.has_brand_role(ble.brand_id, array['admin'])
  )
)
with check (
  public.is_admin()
  and exists (
    select 1
    from public.business_ledger_entries ble
    where ble.id = business_ledger_attachments.ledger_entry_id
      and public.has_brand_role(ble.brand_id, array['admin'])
  )
);

drop policy if exists business_ledger_attachments_delete_admin on public.business_ledger_attachments;
create policy business_ledger_attachments_delete_admin
on public.business_ledger_attachments
for delete
to authenticated
using (
  public.is_admin()
  and exists (
    select 1
    from public.business_ledger_entries ble
    where ble.id = business_ledger_attachments.ledger_entry_id
      and public.has_brand_role(ble.brand_id, array['admin'])
  )
);

insert into public.business_ledger_types (code, name, sort_order, is_active)
values
  ('OPERATIONAL', 'Operational', 10, true),
  ('PROFIT', 'Profit', 20, true)
on conflict (lower(trim(code))) do update
set
  name = excluded.name,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active;

insert into public.big_book_actors (actor_code, display_name, user_id)
values
  ('A', 'Actor A', null),
  ('B', 'Actor B', null)
on conflict (actor_code) do update
set display_name = excluded.display_name;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'big-book-attachments',
  'big-book-attachments',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists big_book_attachments_admin_read on storage.objects;
create policy big_book_attachments_admin_read
on storage.objects
for select
to authenticated
using (
  bucket_id = 'big-book-attachments'
  and public.is_admin()
);

drop policy if exists big_book_attachments_admin_insert on storage.objects;
create policy big_book_attachments_admin_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'big-book-attachments'
  and public.is_admin()
);

drop policy if exists big_book_attachments_admin_update on storage.objects;
create policy big_book_attachments_admin_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'big-book-attachments'
  and public.is_admin()
)
with check (
  bucket_id = 'big-book-attachments'
  and public.is_admin()
);

drop policy if exists big_book_attachments_admin_delete on storage.objects;
create policy big_book_attachments_admin_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'big-book-attachments'
  and public.is_admin()
);
