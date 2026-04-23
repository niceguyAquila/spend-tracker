# Auth and Session Verification Checklist

## Sign-in and redirects
- Open a protected URL such as `/dashboard?month=2026-04-01` while signed out.
- Confirm redirect to `/login` includes `next`.
- Sign in with valid credentials and confirm redirect returns to the original `next` path.
- Call `/auth/callback?next=https://example.org` and confirm redirect falls back to `/dashboard`.

## Session expiry behavior
- Sign in, then invalidate the session in Supabase.
- Perform a write action from transactions/category/admin screens.
- Confirm client navigates to `/login?error=session-expired` and preserves `next`.

## Role and access checks
- Verify `viewer` can read dashboard pages but cannot mutate via `/api/expenses` and `/api/subcategories`.
- Verify `finance` can mutate transactions/subcategories.
- Verify `admin` can access `/api/admin/*` and manage users.

## Debug endpoint exposure
- In production environment, confirm `/api/auth/debug` returns 404.
- In non-production environment, confirm endpoint requires admin privileges.
