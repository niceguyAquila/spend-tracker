# Web Modules Project — Build Plan

This document is the brief for an agent initializing a **new** app that contains only the brand-managed web modules from Aquila / ZenPlay Accounting.

Read this file fully before creating files. The source of truth for behavior is the existing app at `D:\KARDUS\ZENPLAY168\Accounting`. Copy that behavior. Do not redesign screens, routes, validation, or RLS.

## Goal

A second Next.js + Supabase application whose product surface is:

- Web Spending (overview, add spending, categories / types / staff)
- Web Transaction (Backoffice, Payment Gateway, comparison)
- The admin needed to run those modules (users, brands, brand roles)

Transaction Big Book, Credit Big Book, pocket metrics, vendor ledgers, and the combined Admin Master Dashboard stay in the Accounting repo. Do not port them.

## Non-goals

- Do not edit the Accounting app, its migrations, or its data as part of initialization.
- Do not replay Accounting’s `supabase/migrations` history into the new database. That history also creates Big Book tables, then mutates expenses through several incompatible shapes (subcategories exist, then are dropped; `note` is renamed to `description`; the expense dedupe index is created and later dropped).
- Do not extract a shared npm package between the two apps.
- Do not change route paths. Keep `/dashboard/spending/*`, `/dashboard/transactions/*`, `/dashboard/settings/categories`, `/dashboard/admin/users`, `/dashboard/admin/brands`.
- Do not fold Web Spending into Big Book pockets inside the new app. That join (`get_big_book_pocket_web_spending`) lives only in Accounting and is a later Accounting change, documented at the bottom.

## Where to create the project

Create a **sibling** directory, not a folder inside Accounting:

`D:\KARDUS\ZENPLAY168\WebModules`

New git repo. New Supabase project. New `.env.local`. Do not point the new app at Accounting’s Supabase URL.

Suggested package name: `zenplay-web-modules`.

## How to initialize the code

Copy the Accounting repo into `WebModules`, then delete everything that is Big Book or Credit Big Book. This is safer than scaffolding a blank Next.js app and retyping pages.

After the copy:

1. Delete `.git` and `git init` a new repository.
2. Delete `node_modules`, `.next`, and any `.env.local` copied by accident.
3. Remove Big Book / Credit files listed under “Delete”.
4. Trim mixed files (`lib/db/queries.ts`, `lib/types.ts`, `middleware.ts`, `components/dashboard-sidebar.tsx`) so the project typechecks with no Big Book imports.
5. Write one squashed Supabase migration for the **current** web schema (below), not a copy of Accounting’s migration folder.
6. `npm install`, then `npm run typecheck`, `npm run test`, `npm run build`.

Preserve behavior. If a copied file imports a Big Book helper, copy that helper (or the two functions it needs). Do not rewrite the spending table to remove the dependency.

### Stack to keep

Match Accounting’s `package.json`: Next.js 15 App Router, React 19, Supabase SSR, Tailwind, Zod, Vitest. Copy `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.js` (if present), `eslint.config.mjs`, `vitest.config.ts`, `app/globals.css`, `.env.example`.

Env vars (same names as Accounting `.env.example`):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`)
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`

## Product surface to keep

| Area | Routes |
|---|---|
| Home | `/` and `/dashboard` redirect to `/dashboard/spending/overview` (this is already what `app/dashboard/page.tsx` does) |
| Web Spending | `/dashboard/spending/overview`, `/dashboard/spending/entries` |
| Categories | `/dashboard/settings/categories` (finance or admin on the active brand) |
| Web Transaction | `/dashboard/transactions?source=backoffice`, `?source=payment_gateway`, `/dashboard/transactions/comparison` |
| Admin | `/dashboard/admin/users`, `/dashboard/admin/brands` (global `allowed_users.role = admin` only) |
| Auth | `/login`, `/auth/callback`, `/auth/init-session`, `/auth/logout` |

Sidebar modules, in this order: **Web Spending**, **Web Transaction**, **Admin**.

Admin is required in this app even though Accounting also has an Admin module. Each Supabase project has its own Auth users. This app must be able to invite users, assign brand roles, and create brands. Do not port Admin Master Dashboard (`/dashboard/master-dashboard`); that page mixes Web Spending with Big Book entries.

Brand switcher stays visible on web pages. Today Accounting hides it on Big Book and master-dashboard paths (`components/dashboard-sidebar.tsx`, `shouldHideBrandSwitcher`). After those routes are gone, the switcher can stay visible everywhere in the dashboard.

Roles, unchanged:

- Global role on `allowed_users.role`: gates Admin screens via `is_admin()`.
- Brand role on `user_brand_roles.role`: gates spending and web transactions via `has_brand_role`.
- `viewer` reads. `finance` and brand `admin` write spending and transactions. Global `admin` manages users and brands.

Active brand is the `active_brand_id` cookie, resolved in `lib/auth.ts` (`requireAllowedUser`). Keep that. Page writes and API writes must keep using the same active brand (`tests/active-brand-parity.test.ts` documents why).

## Files to copy

Paths are relative to Accounting. Copy them as-is unless the “Trim” note says otherwise.

### App routes and APIs

- `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `app/robots.ts`
- `app/login/page.tsx`
- `app/auth/callback/route.ts`, `app/auth/init-session/route.ts`, `app/auth/logout/route.ts`
- `app/dashboard/layout.tsx`, `app/dashboard/page.tsx`, `app/dashboard/loading.tsx`
- `app/dashboard/spending/**`
- `app/dashboard/transactions/**`
- `app/dashboard/settings/categories/page.tsx`, `app/dashboard/settings/loading.tsx`
- `app/dashboard/admin/users/**`, `app/dashboard/admin/brands/**`, `app/dashboard/admin/loading.tsx`
- `app/api/expenses/**`
- `app/api/categories/route.ts`
- `app/api/expense-types/route.ts`
- `app/api/expense-staff/route.ts`
- `app/api/web-transactions/**`
- `app/api/brands/active/route.ts`
- `app/api/admin/invite/route.ts`
- `app/api/admin/users/route.ts`
- `app/api/admin/users/reset-password/route.ts`
- `app/api/admin/brands/route.ts`
- `middleware.ts` — then remove `/api/big-book` and `/api/credit-big-book` from `PROTECTED_PREFIXES`

Do not copy `app/dashboard/big-book/**`, `app/dashboard/credit-big-book/**`, `app/dashboard/master-dashboard/**`, or any `app/api/big-book/**` / `app/api/credit-big-book/**`.

### Components

Web feature components:

- `components/transaction-table.tsx` (this is the spending ledger, not Web Transaction)
- `components/spending-entry-fields.tsx`, `components/spending-entry-row.tsx`, `components/spending-csv-toolbar.tsx`
- `components/category-manager.tsx`
- `components/web-transactions-table.tsx`, `components/web-transactions-filters.tsx`, `components/web-transaction-import.tsx`
- `components/web-transaction-comparison-table.tsx`, `components/web-transactions-comparison-filters.tsx`
- `components/dashboard-report-filters.tsx`, `components/dashboard-report-table.tsx`
- `components/admin-brands-panel.tsx`, `components/admin-users-panel.tsx`
- `components/brand-switcher.tsx`
- `components/dashboard-shell.tsx`, `components/dashboard-sidebar.tsx` (trim nav), `components/dashboard-header-title.tsx`
- `components/logout-button.tsx`, `components/theme-toggle.tsx`
- `components/ui/**` (copy the whole UI folder)

`components/spending-sub-nav.tsx`, `components/transactions-sub-nav.tsx`, `components/dashboard-nav.tsx`, and `components/dashboard-charts.tsx` are unused by current pages. Do not copy them.

Spending UI borrows two Big Book helpers. Copy these so `transaction-table.tsx` and `spending-entry-fields.tsx` keep compiling. Do not copy the rest of Big Book UI.

- `components/big-book-currency-totals.tsx`
- `lib/big-book/totals.ts`
- From `components/big-book-entry-fields.tsx`, only `formatAmountInput` and `parseAmountInput` (lines that format a numeric string with thousands separators, max 4 decimal places). Put them in a small `lib/amount-input.ts` **or** copy the whole `big-book-entry-fields.tsx` only if trimming it is more work than keeping it. Prefer a tiny module and update the two import sites. Do not copy gas-fee, credit, or ledger form fields.

### Lib

Copy entire files:

- `lib/auth.ts`, `lib/auth-api.ts`, `lib/auth-access.ts`, `lib/auth/redirect.ts`
- `lib/supabase/server.ts`, `lib/supabase/client.ts`, `lib/supabase/admin.ts`, `lib/supabase/middleware.ts`
- `lib/security/csrf.ts`, `lib/security/cookies.ts`, `lib/security/origin.ts`, `lib/security/session-meta.ts`
- `lib/client/auth-fetch.ts`
- `lib/spending/**` (`csv.ts`, `pivot.ts`, `uncategorized.ts`, `entry-form-validation.ts`)
- `lib/web-transactions/csv.ts`
- `lib/validation/expense.ts`, `lib/validation/entity-code.ts`
- `lib/csv/primitives.ts`
- `lib/db/user-brand-roles.ts`, `lib/db/entity-writes.ts`, `lib/db/display-names.ts`
- `lib/entity-code.ts`, `lib/entity-editor.ts`
- `lib/display-format.ts`, `lib/table-pagination.ts`, `lib/perf.ts`
- `lib/ui/table.ts`, `lib/ui/use-column-widths.ts`

Trim:

- `lib/types.ts` — keep `AppRole`, `Brand`, `UserBrandRole`, `ExpenseCategory`, `ExpenseType`, `ExpenseStaff`, `SpendingCurrencyCode`, `Expense`, `ExpenseWithNames`, `DashboardReportRow`, and every `WebTransaction*` type. Delete Big Book and Credit types.
- `lib/db/queries.ts` — do not copy the file whole. It is mostly Big Book. Re-create a web-only module with these functions (and the private helpers they close over):
  - `getCategories`, `getExpenseTypes`, `getExpenseStaff`, `getExpenses`, `getExpenseMonthKeys`
  - `getAllBrands`
  - `getDashboardReportRows`
  - `getWebTransactions`, `buildWebTransactionMetrics`, `buildWebTransactionComparison`, `getWebTransactionComparison`
  - Skip `getMonthlySummary` and `getCategorySplit`. Nothing in the kept pages calls them. Their SQL functions still reference a pre-overhaul shape.

Do not copy `lib/big-book/**` except `lib/big-book/totals.ts`. Do not copy `lib/credit-big-book/**`, `lib/validation/big-book.ts`, `lib/validation/credit-big-book.ts`, `lib/exchange-rate.ts`.

### Tests to copy

- `tests/setup.ts` and `vitest.config.ts`
- `tests/spending-csv.test.ts`, `tests/spending-pivot.test.ts`, `tests/spending-uncategorized.test.ts`, `tests/spending-entry-form-validation.test.ts`
- `tests/spending-import-route.test.ts`, `tests/spending-export-route.test.ts`
- `tests/expense-types-route.test.ts`, `tests/expense-staff-route.test.ts`, `tests/expense-direction-schema.test.ts`
- `tests/web-transactions-csv.test.ts`, `tests/web-transactions-metrics.test.ts`, `tests/web-transactions-import-route.test.ts`
- `tests/active-brand-parity.test.ts`, `tests/user-brand-roles.test.ts`, `tests/brands-active-route.test.ts`
- `tests/middleware-auth.test.ts` — delete cases that only assert `/api/big-book` or `/api/credit-big-book`
- `tests/csrf.test.ts`, `tests/origin-security.test.ts`, `tests/session-meta.test.ts`
- `tests/auth-api.test.ts`, `tests/auth-redirect.test.ts`, `tests/auth-callback-route.test.ts`, `tests/logout-route.test.ts`

Do not copy `tests/big-book-*` or `tests/credit-big-book-*`. Skip `tests/big-book-pocket-web-spending-metrics.test.ts` (Accounting-only).

### Static assets

Copy `public/asset/wallet.png`, `transaction.png`, `admin.png`, `light-mode.png`, `night-mode.png`. Skip `accounting-book.png`.

### Docs worth copying for auth behavior

`docs/session-security.md` and `docs/auth-session-checklist.md` describe the session and CSRF model this app must keep. Copy them if the new repo should stay operable without opening Accounting.

## Delete after the copy

Anything matching:

- `app/dashboard/big-book/**`
- `app/dashboard/credit-big-book/**`
- `app/dashboard/master-dashboard/**`
- `app/api/big-book/**`
- `app/api/credit-big-book/**`
- `components/big-book-*` except the currency-totals component until imports are moved
- `components/credit-big-book-*`
- `components/master-dashboard-tables.tsx`
- `lib/big-book/**` except `totals.ts` until imports are moved
- `lib/credit-big-book/**`
- `lib/big-book-individual-type-ledger.ts`, `lib/credit-big-book-individual-type-ledger.ts`
- `supabase/migrations/*` from the copy — replace with the squashed migration below

Then fix `components/dashboard-sidebar.tsx`:

- `createNavModules` returns only Web Spending, Web Transaction, and (when `globalRole === "admin"`) Admin.
- Admin links: Admin Users, Admin Brands. No Master Dashboard link.
- Web Spending links: Overview, Add Spending, and Add Category when `role` is `finance` or `admin`.
- Web Transaction links: Backoffice, Payment Gateway, Comparison. Keep the existing `source` query matching.
- Drop Big Book icon entries.

## Database: one squashed migration

Create `supabase/migrations/202610010001_web_modules_init.sql` in the new repo. It must describe the **current** Accounting schema for web tables, after `202608030002_expenses_allow_duplicates.sql`. Do not include `business_ledger_*`, `credit_ledger_*`, `big_book_*`, or `get_big_book_pocket_web_spending`.

Read these Accounting migrations when writing the squash, then emit the end state only:

- `202604230001_init_spend_tracker.sql` — `set_row_updated_at()`, `audit_expense_changes()`, `pgcrypto`
- `202604230004_internal_auth_access.sql` and `202604230005_allowed_users_display_name_and_auth_user_id.sql` — `allowed_users`
- `202604230006_allowed_users_admin_policy_alignment.sql` and `202604230008_brand_scoped_rls.sql` — `is_admin()`, `current_allowed_user_id()`, `has_brand_role()`, `is_finance_or_admin()`, brand RLS
- `202604230007_multi_brand_foundation.sql` — `brands`, `user_brand_roles` (ignore the subcategory backfill block)
- `202604230010_web_transactions.sql` and `202604230011_web_transactions_dual_source.sql`
- `202608020001_expense_entry_direction.sql` and `202608030001_web_spending_overhaul.sql`
- `202608030002_expenses_allow_duplicates.sql` — **no unique dedupe index on expenses**

### Tables

**`allowed_users`**

- `id uuid pk`
- `email text unique`, check contains `@`
- `normalized_email text generated` as `lower(trim(email))` stored, unique
- `display_name text null` (null or non-blank)
- `auth_user_id uuid null`, unique where not null
- `role text` in `admin | finance | viewer`
- `is_active boolean default true`
- `invited_by uuid null`, `invited_at`, `created_at`, `updated_at`

**`brands`**

- `id`, `code` unique, `name` unique, `is_active default true`, timestamps
- code and name must be non-blank

**`user_brand_roles`**

- `allowed_user_id` → `allowed_users` on delete cascade
- `brand_id` → `brands` on delete cascade
- `role` in `admin | finance | viewer`
- `is_active default true`
- unique `(allowed_user_id, brand_id)`

**`expense_categories`**

- brand-scoped: `brand_id` not null → `brands` on delete cascade
- unique `(brand_id, code)` and `(brand_id, name)`
- no global unique on code/name
- **no `expense_subcategories` table**

**`expense_types`** and **`expense_staff`**

- brand-scoped lookups from `202608030001_web_spending_overhaul.sql`
- unique per brand on `lower(trim(code))` and `lower(trim(name))`
- `sort_order`, `is_active`

**`expenses`** — current columns:

- `id`, `brand_id` not null
- `expense_date date`, `month_key date` generated as the first of that month (same expression as the init migration)
- `entry_direction text` not null, `spending | profit`, default `spending`
- `amount numeric(18,4)` check `amount > 0`
- `currency_code text` not null, `IDR | MYR | USDT | TRX`, default `IDR`
- `category_id` not null → `expense_categories`
- `type_id` null → `expense_types` on delete set null
- `staff_id` null → `expense_staff` on delete set null
- `description text null` (renamed from `note`)
- `remarks text null` (renamed from `reference`)
- `source text default 'manual'`
- `created_by`, `updated_by` uuid null (auth user ids; no hard FK required)
- timestamps
- **Do not create `uq_expenses_dedupe`.** Duplicate spending rows are allowed.
- Indexes: brand, brand+currency, brand+direction, month_key, month+category, type, staff, expense_date desc

**`expense_audit_logs`**

- as in the init migration, plus `brand_id` not null
- trigger `audit_expense_changes` on insert/update/delete of `expenses`

**`web_transactions`** — shape after the dual-source migration:

- `brand_id` not null → `brands` on delete cascade
- `source_system text` not null (`backoffice | payment_gateway`; match the check already used by `lib/web-transactions/csv.ts`)
- `external_txn_no text` not null, non-blank
- `client_order_no` nullable
- `create_time`, `last_update_time`
- status / type columns: `status`, `payment_type`, `product_type`, plus `raw_status`, `canonical_status`, `raw_type`, `canonical_type` not null
- amounts: `currency_code`, `original_amount`, `amount`, optional crypto fields, merchant fields
- `raw_payload jsonb null`
- `aggregator_order_no`, `source_file_name`, `imported_at`, `imported_by uuid null`
- unique `(brand_id, source_system, external_txn_no)`
- index `(brand_id, source_system, create_time desc)`

Seed one brand only if the operator wants a local empty start: `ZENPLAY` / `ZenPlay`, `on conflict (code) do nothing`. Production data migration inserts the real brand rows and must not depend on this seed’s id.

### Functions and RLS

Port the current definitions of:

- `set_row_updated_at()`
- `is_admin()` — true when the JWT email matches an active `allowed_users` row with `role = admin`
- `current_allowed_user_id()`
- `has_brand_role(input_brand_id uuid, allowed_roles text[])`
- `is_finance_or_admin()` — true when the user has an active brand role of `finance` or `admin` (the brand-scoped version in `202604230008`, not the older global-role version)
- `audit_expense_changes()`

Enable RLS on every public table above. Policies must match Accounting’s brand-scoped policies:

- Select expenses, categories, types, staff, web transactions when `has_brand_role(brand_id, {viewer, finance, admin})`.
- Insert/update/delete those rows when `has_brand_role(brand_id, {finance, admin})`.
- `brands` and `user_brand_roles`: authenticated can select rows they need; writes are admin-only (`is_admin()`). Confirm against `202604230008_brand_scoped_rls.sql` rather than inventing a looser policy.
- `allowed_users`: select self or admin; writes admin-only. Match `202604230004` plus later policy alignment.

Grant `execute` on the helper functions to `authenticated` and `service_role`. Revoke from `public`.

Do not create `get_expense_monthly_summary`, `get_expense_category_split`, or `get_subcategory_movement`. The kept UI aggregates in TypeScript (`lib/spending/pivot.ts`).

## Auth setup in the new Supabase project

- Disable public sign-up.
- Email + password login, same as Accounting.
- Invite and password reset stay on the admin APIs (`app/api/admin/invite`, `app/api/admin/users/reset-password`) using the service role.
- Add the new app’s origin to Supabase Auth redirect URLs (`/auth/callback`).
- Create the first global admin with the Supabase dashboard or a one-off SQL insert into `auth.users` **and** `allowed_users` (`role = admin`), then sign in and create brands from the UI. Do not hardcode a password in the repo.

## Data migration (after the empty app works)

Do this only after `npm run build` succeeds against the empty new database. Do not migrate during the first compile.

1. Freeze writes on Web Spending and Web Transaction in Accounting (maintenance window). Big Book can keep running.
2. Export **data only**, preserving UUIDs, in this order:

   `brands` → `allowed_users` → `user_brand_roles` → `expense_categories` → `expense_types` → `expense_staff` → `expenses` → `expense_audit_logs` → `web_transactions`

3. Auth users do not come along with a `public` schema dump. `expenses.created_by` and `web_transactions.imported_by` store `auth.users` ids.
   - Preferred: recreate each `allowed_users` email in the new project’s Auth with the **same user id**, then insert `allowed_users` including `auth_user_id`.
   - Acceptable for a first cut: migrate public rows, invite users fresh, and leave `created_by` / `imported_by` as-is even if those auth ids do not exist yet. Display names will fall back until `auth_user_id` is linked. Do not null out historical ids.
4. Copy every brand row, including inactive ones. Ledger history in Accounting still references these ids, and a later brand sync depends on the same `id` and `code`.
5. Verify, per table and per `brand_id`:

   ```sql
   select 'expenses' as t, brand_id, count(*) from expenses group by 1, 2
   union all
   select 'web_transactions', brand_id, count(*) from web_transactions group by 1, 2;
   ```

   Counts in the new database must match Accounting. Also compare one brand’s spending overview net (IDR and one other currency) and one payment-gateway external txn number.
6. Leave the rows in Accounting until the new app is accepted. Deleting them is an Accounting change, not part of this project.

`pg_dump` shape (run against Accounting, restore into the new database after the squash migration has created empty tables):

```text
pg_dump --data-only --inserts --column-inserts \
  --table=public.brands \
  --table=public.allowed_users \
  --table=public.user_brand_roles \
  --table=public.expense_categories \
  --table=public.expense_types \
  --table=public.expense_staff \
  --table=public.expenses \
  --table=public.expense_audit_logs \
  --table=public.web_transactions
```

Disable triggers during restore if audit triggers would duplicate `expense_audit_logs`. Re-enable them after.

## Build order for the implementing agent

1. Create `D:\KARDUS\ZENPLAY168\WebModules` from a file copy. New git repo. No Accounting remote.
2. Delete Big Book / Credit paths. Trim sidebar, middleware, types, and queries.
3. Extract amount-input helpers so spending files do not import Big Book form components.
4. Replace `supabase/migrations` with the single squash. Apply it to a new Supabase project.
5. Add `.env.local` from `.env.example` using the new project keys. Do not commit `.env.local`.
6. Run `npm run typecheck`, `npm run test`, `npm run lint`, `npm run build`. Fix only breakages caused by the split.
7. Manual check on an empty database: login as a seeded admin, create a brand, assign yourself a brand role, add a category, add a spending row (both directions and two currencies), import a tiny web-transaction CSV for each source, open comparison.
8. Only then run the data migration and repeat the manual check against real brand data.

## Acceptance

- Sidebar shows Web Spending, Web Transaction, and Admin. No Big Book, Credit, or combined Master Dashboard.
- A finance user on brand A cannot read or write brand B’s expenses or web transactions (RLS, not only UI filters).
- Spending allows duplicate rows (same date, amount, category, description).
- Currencies are IDR, MYR, USDT, TRX. Direction is `spending | profit`. Amount stays positive.
- Web transaction import rejects a second row with the same `(brand_id, source_system, external_txn_no)`.
- `npm run typecheck` and `npm run test` pass.
- No file under the new repo imports `@/lib/big-book/` except `totals.ts` if it has not been moved yet, and nothing imports `@/lib/credit-big-book` or `@/app/api/big-book`.

## Later, in Accounting (out of scope here)

When this app is live, a separate change in Accounting should:

- Remove Web Spending and Web Transaction nav, pages, and APIs.
- Keep `brands` and `user_brand_roles`. `business_ledger_entries.brand_id` and `credit_ledger_entries.brand_id` are still non-null foreign keys.
- Stop `get_big_book_pocket_web_spending()` from reading `expenses` in-process. Replace it with a cached net refreshed from this app, or stop adding web spending into pocket totals.
- Remove the Web Spending half of `/dashboard/master-dashboard`.
- Sync brand create/rename from this app into Accounting’s `brands` table, same `id` and `code`, so new ledger rows can still reference them.
- Drop `expenses` and `web_transactions` from Accounting only after counts match and the pocket function no longer selects them.
