-- Per ledger type (group): invoice PIC presets and PDF background color.

create table if not exists public.business_ledger_type_invoice_profiles (
  type_id uuid primary key references public.business_ledger_types(id) on delete cascade,
  pic_name text not null default '',
  pic_passport text not null default '',
  pic_address text not null default '',
  pic_phone text not null default '',
  bill_to_company text not null default '',
  background_color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_ledger_type_invoice_profiles_pic_name_len
    check (char_length(pic_name) <= 200),
  constraint business_ledger_type_invoice_profiles_pic_passport_len
    check (char_length(pic_passport) <= 120),
  constraint business_ledger_type_invoice_profiles_pic_address_len
    check (char_length(pic_address) <= 400),
  constraint business_ledger_type_invoice_profiles_pic_phone_len
    check (char_length(pic_phone) <= 80),
  constraint business_ledger_type_invoice_profiles_bill_to_company_len
    check (char_length(bill_to_company) <= 200),
  constraint business_ledger_type_invoice_profiles_background_color_check
    check (
      background_color is null
      or background_color ~ '^#[0-9A-Fa-f]{6}$'
    )
);

drop trigger if exists trg_business_ledger_type_invoice_profiles_updated_at
  on public.business_ledger_type_invoice_profiles;
create trigger trg_business_ledger_type_invoice_profiles_updated_at
before update on public.business_ledger_type_invoice_profiles
for each row execute function public.set_row_updated_at();

alter table public.business_ledger_type_invoice_profiles enable row level security;

grant select, insert, update, delete on table public.business_ledger_type_invoice_profiles to authenticated;
grant select, insert, update, delete on table public.business_ledger_type_invoice_profiles to service_role;

drop policy if exists business_ledger_type_invoice_profiles_select_admin
  on public.business_ledger_type_invoice_profiles;
create policy business_ledger_type_invoice_profiles_select_admin
on public.business_ledger_type_invoice_profiles
for select
to authenticated
using (public.is_admin());

drop policy if exists business_ledger_type_invoice_profiles_write_admin
  on public.business_ledger_type_invoice_profiles;
create policy business_ledger_type_invoice_profiles_write_admin
on public.business_ledger_type_invoice_profiles
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());
