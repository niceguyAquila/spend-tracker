# Session Security

This project implements layered session protection. The application enforces
its own idle and absolute session timeouts on top of the Supabase Auth
defaults, hardens cookie attributes, and adds a CSRF double-submit token
pattern on top of the existing origin alignment check.

## Policy

| Control                    | Value                                              |
|----------------------------|----------------------------------------------------|
| Idle timeout               | 30 minutes since last request                      |
| Absolute timeout (default) | 12 hours since sign-in                             |
| Absolute timeout (Remember me) | 7 days since sign-in                           |
| Re-authentication trigger  | Cookie missing, signature invalid, or expired      |
| Logout scope               | Global (revokes refresh tokens on every device)    |

These windows live in `lib/security/session-meta.ts` (`IDLE_MS`,
`ABSOLUTE_MS`, `ABSOLUTE_RM_MS`) and can be tuned without changing any
business code.

## How the timeout enforcement works

1. On successful sign-in (password or OAuth callback) the server route
   `/auth/init-session` (or the OAuth `/auth/callback`) issues two cookies:
   - `__Host-session-meta` (`session-meta` in dev) — HMAC-signed JSON of
     `{iat, la, rm, uid, sid}`.
   - `__Host-csrf` (`csrf` in dev) — random 32-byte token.
2. On every request the Next.js middleware (`middleware.ts`) calls
   `evaluate(cookie, user.id)`:
   - missing / invalid / wrong-uid: 302 to `/login?error=session-expired`
     and the meta cookie is cleared.
   - `now - la > IDLE_MS`: idle timeout, same redirect.
   - `now - iat > absolute cap`: absolute timeout, same redirect.
   - otherwise: `la` is rolled forward and the cookie is rewritten on the
     response.
3. `iat` (issued-at) **never** rolls forward — that would defeat the
   absolute cap. Only `la` (last activity) is updated.
4. CSRF token is minted lazily by middleware if missing for an authenticated
   user, so existing browsers don't need a fresh login just to get a token.

## Cookie attributes

All app-issued cookies are set via helpers in `lib/security/cookies.ts`:

| Cookie name (prod / dev)              | httpOnly | secure | sameSite | maxAge          |
|---------------------------------------|----------|--------|----------|-----------------|
| `__Host-session-meta` / `session-meta` | yes      | prod   | lax      | absolute cap    |
| `__Host-csrf` / `csrf`                 | no       | prod   | lax      | absolute cap    |
| `active_brand_id`                      | yes      | prod   | lax      | 30 days         |
| Supabase auth cookies                  | yes      | prod   | lax      | (Supabase-managed) |

Notes:
- The `__Host-` prefix is only used in production. It requires
  `Secure` + `Path=/` + no `Domain`, which the helpers enforce.
- The CSRF cookie is intentionally **not** httpOnly so that
  `secureFetch` (`lib/client/auth-fetch.ts`) can read the token via
  `document.cookie` and echo it back in `X-CSRF-Token`.

## CSRF protection

`lib/security/origin.ts` exposes `assertCsrfAndOrigin(request)` which:

1. Allows `GET`, `HEAD`, `OPTIONS` unconditionally (no state change).
2. For other methods, requires the `Origin` host to equal `Host` /
   `X-Forwarded-Host` (existing protection).
3. Requires a valid `csrf` cookie **and** a matching token submitted via
   `X-CSRF-Token` header or the `csrf_token` form field. Comparison uses
   `crypto.timingSafeEqual`.

Every mutating route must call `assertCsrfAndOrigin(request)` before any
side effect. Client code calls `secureFetch` instead of `fetch` for
mutating requests; HTML form submits (the logout form) include a hidden
`csrf_token` input populated from the cookie via a small client effect.

## Logout

`POST /auth/logout`:

1. Validates origin and CSRF.
2. Calls `supabase.auth.signOut({ scope: "global" })` so every refresh
   token for this user is revoked, not just the current browser.
3. Clears `session-meta`, `csrf`, and `active_brand_id` cookies on the
   redirect response.
4. Redirects to `/login`.

A user who taps "Sign out" on one device is signed out everywhere.

## Required environment variable

```
SESSION_SECRET=<at least 32 bytes of entropy>
```

Generate with `openssl rand -base64 48`. Rotating this value invalidates
every existing `session-meta` cookie, which forces every active session to
re-authenticate. Use that as a kill switch when revoking sessions in
response to an incident.

## Recommended Supabase Dashboard settings

These match (and slightly exceed) the app-layer policy:

| Setting                                    | Recommended value          |
|--------------------------------------------|----------------------------|
| Auth › JWT expiry                          | 3600 s (1 hour)            |
| Auth › Refresh token rotation              | Enabled                    |
| Auth › Reuse interval                      | 10 s                       |
| Auth › Inactivity timeout (refresh tokens) | 30 min (matches `IDLE_MS`) |
| Auth › Refresh token expiry                | At least 8 days (covers Remember me) |
| Auth › Password minimum length             | 12 characters              |
| Auth › Brute-force protection              | Enabled                    |
| Auth › Email confirmations                 | Enabled                    |
| Auth › Allow new sign-ups                  | Disabled (invite only)     |

The app-layer enforcement is the source of truth. Supabase settings act as
defense-in-depth — if for any reason the middleware is bypassed (e.g. a
direct call to a route without the middleware), the JWT and refresh token
TTLs still cap how long a stolen token is useful.

## Operational runbook

### Force every user to re-authenticate

1. Rotate `SESSION_SECRET` and redeploy.
2. Existing `session-meta` signatures will no longer verify; users get
   redirected to `/login?error=session-expired` on their next request.

### Sign out a single compromised user

Use the Supabase Dashboard or the admin API:

```ts
import { createAdminClient } from "@/lib/supabase/admin";

const admin = createAdminClient();
await admin.auth.admin.signOut(userId, "global");
```

This revokes refresh tokens. The user's access JWT will continue to
authenticate them until it expires (max 1 hour). For instant lockout, also
flip `is_active` in `allowed_users` for the email so `requireAllowedApi`
fails on every request.

### Verify a deployment

After deploying, run through `docs/auth-session-checklist.md` end-to-end.
