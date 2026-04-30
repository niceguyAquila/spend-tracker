# Auth and Session Verification Checklist

See [session-security.md](./session-security.md) for the design and policy
this checklist verifies.

## Sign-in and redirects

- Open a protected URL such as `/dashboard?month=2026-04-01` while signed out.
- Confirm redirect to `/login` includes `next`.
- Sign in with valid credentials and confirm:
  - Redirect goes through `/auth/init-session` and lands on the original
    `next` path.
  - `__Host-session-meta` and `__Host-csrf` cookies are present with
    `HttpOnly` (meta only), `Secure`, `SameSite=Lax`, `Path=/` flags.
- Call `/auth/callback?next=https://example.org` and confirm redirect falls
  back to `/dashboard` (open-redirect protection).

## Remember me

- Sign in with the **Remember me** checkbox checked. Decode the
  `__Host-session-meta` cookie payload and confirm `rm: true` and the
  cookie `Max-Age` is ~7 days.
- Sign in without Remember me. Confirm `rm: false` and `Max-Age` ~12 hours.

## Idle timeout (30 minutes)

- Sign in, then leave the browser idle for 30+ minutes (or shorten
  `IDLE_MS` temporarily for testing).
- Make any request. Confirm redirect to `/login?error=session-expired&next=…`
  and the `session-meta` cookie has been cleared.

## Absolute timeout (12 hours / 7 days for Remember me)

- Sign in. Manually edit the cookie's `iat` to 13 hours in the past (or
  shorten `ABSOLUTE_MS` for testing).
- Make any request. Confirm redirect to `/login?error=session-expired`.
- Repeat with a Remember-me session and confirm 7 days is the cap.

## CSRF token enforcement

- With a valid logged-in session, send `POST /api/expenses` (or any other
  guarded route) without `X-CSRF-Token`. Confirm `403 Invalid request
  origin or CSRF token.`
- Send the same request with a tampered token. Confirm `403`.
- Send via the UI (which uses `secureFetch`) and confirm the request
  succeeds.

## Origin enforcement

- Send `POST /api/expenses` with `Origin: https://evil.example` and
  `Host: app.local`. Confirm `403`.

## Logout (sign out everywhere)

- Sign in on two browsers as the same user.
- Click Sign out on browser A.
- Confirm browser A redirects to `/login`.
- On browser B, perform any action — confirm it gets redirected to
  `/login?error=session-expired` because the refresh token was revoked
  globally.

## Logout CSRF

- POST `/auth/logout` without the hidden `csrf_token` field. Confirm 403.
- POST `/auth/logout` with `Origin` mismatch. Confirm 403.

## Session expiry UX (server-side invalidation)

- Sign in, then invalidate the user via Supabase admin (`is_active=false`
  on `allowed_users`).
- Perform a write action. Confirm the client navigates to
  `/login?error=session-expired` with `next` preserved.

## Role and access checks

- Verify `viewer` can read dashboard pages but cannot mutate via
  `/api/expenses` and `/api/subcategories`.
- Verify `finance` can mutate transactions/subcategories.
- Verify `admin` can access `/api/admin/*` and manage users.

## Middleware coverage

- While signed out, request each protected API prefix and confirm a 302 to
  `/login`:
  - `/api/expenses`
  - `/api/categories`
  - `/api/subcategories`
  - `/api/brands`
  - `/api/admin`
  - `/api/web-transactions`
  - `/api/big-book`

## Debug endpoint exposure

- In production environment, confirm `/api/auth/debug` returns 404.
- In non-production environment, confirm endpoint requires admin
  privileges.
