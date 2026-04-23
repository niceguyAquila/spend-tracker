# ZenPlay Spend Tracker

Next.js + Supabase application for tracking monthly operational spending with dynamic sub-categories.

## Stack

- Next.js (App Router)
- Supabase (Postgres + RLS)
- Tailwind CSS
- Recharts

## Setup

1. Copy `.env.example` to `.env.local`.
2. Fill in:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`)
  - `SUPABASE_SERVICE_ROLE_KEY` (used by admin invite APIs)
  - `NEXT_PUBLIC_APP_URL` (for auth redirect, example: `http://localhost:3000`)
3. Install dependencies:
  - `npm install`
4. Apply Supabase migrations in order from `supabase/migrations`.
5. Run the app:
  - `npm run dev`

## Routes

- `/dashboard` - KPI and monthly analytics dashboard
- `/dashboard/transactions` - daily entry + ledger (edit/delete)
- `/dashboard/settings/categories` - sub-category manager
- `/dashboard/admin/users` - admin-only invite and access management
- `/login` - internal login page

## Internal Auth Model

- Keep public sign-up disabled in Supabase Auth settings.
- Users sign in from `/login` with email + password.
- Admins can still send magic-link invites if needed.
- Only users in `public.allowed_users` can access dashboard routes.
- Admins can invite users and assign roles from `/dashboard/admin/users`.
- Roles:
  - `admin`: manage users and full app access
  - `finance`: full spend-entry and management access
  - `viewer`: read-only dashboard access

Key auth files:
- `lib/supabase/server.ts` / `lib/supabase/client.ts` / `lib/supabase/admin.ts`
- `middleware.ts`
- `app/login/page.tsx`
- `app/auth/callback/route.ts`
- `app/api/admin/invite/route.ts`
- `app/api/admin/users/route.ts`

## Supabase Migrations

- `202604230001_init_spend_tracker.sql`
  - Core tables, indexes, triggers, and seeded categories
- `202604230002_reporting_functions.sql`
  - Aggregation functions used by dashboard charts
- `202604230003_rls_policies.sql`
  - Explicit RLS policies and function permissions
- `202604230004_internal_auth_access.sql`
  - Allowed-user table and RLS for internal invited access