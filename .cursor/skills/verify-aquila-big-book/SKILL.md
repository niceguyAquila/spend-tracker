---
name: verify-aquila-big-book
description: Drive the Aquila Big Book Next.js web app (login, ledger, master dashboard, settings, exchange helper) in a browser and capture proof. Use when verifying UI behavior, reproducing a user-facing bug, or checking a change against the running app.
---

# Verify Aquila Big Book

Aquila Big Book is a Next.js App Router web app. Users sign in at `/login` and work in the dashboard. Ledger data lives in a remote Supabase project named by `.env.local`. There is no local database, no disposable data directory, and no CLI.

The primary surface is the browser UI. `/api/big-book/*` and `/api/admin/*` exist only as the UI's backend. Do not treat those routes as a second product, and do not call them to fake a click.

## Launch

From the repo root (`Accounting`):

```powershell
node .cursor/skills/verify-aquila-big-book/scripts/verify-ctl.mjs launch
```

This starts `next dev` on `http://127.0.0.1:4173` (override with `VERIFY_PORT` only when 4173 is already taken by a previous verification run you are about to clean up). It sets `NEXT_PUBLIC_APP_URL` to that origin for the child process. It waits until the log contains `Ready in` and `GET /login` returns the sign-in form. Exit 0 prints JSON with `pid`, `port`, `baseUrl`, and `listenerPids`. The server log is `.cursor/skills/verify-aquila-big-book/run/dev.log`.

Preconditions already on disk, not created by launch:

- `npm install` has been run (`node_modules/next/dist/bin/next` exists).
- `.env.local` contains non-empty `NEXT_PUBLIC_SUPABASE_URL`, `SESSION_SECRET`, and either `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- The remote Supabase project already has migrations applied. Launch does not run SQL. If tables are missing, dashboard pages render the heading `Big Book setup required` instead of their normal content.

Ready means `/login` shows `Work email`, `Password`, and `Sign in`. A listening port alone is not ready.

Do not start `npm run dev` on port 3000 for verification. That port is the developer's server.

## Doctor

Run this before driving, and again whenever a page looks wrong:

```powershell
node .cursor/skills/verify-aquila-big-book/scripts/verify-ctl.mjs doctor
```

Exit 0 and `"ok": true` means all of the following:

- The pid in `run/state.json` is alive.
- Port 4173 is still held by a listener recorded at launch.
- `.env.local` has the Supabase URL, an anon or publishable key, and `SESSION_SECRET` (values are not printed).
- `GET /login` is 200 and the HTML contains `Sign in` and `Work email`.
- `GET /dashboard` with no cookie is 307 to a Location that contains `/login`.
- `GET /api/big-book/types` with no cookie is 401 JSON `{"error":"Unauthorized"}`.
- `appVersion` is the `version` in `package.json` and `nextVersion` is the installed Next.js version.

If doctor fails, stop. Do not drive a server you did not launch.

## Drive

Use the Cursor IDE browser tools (`cursor-ide-browser`): `browser_tabs`, `browser_navigate`, `browser_lock`, `browser_snapshot`, `browser_click`, `browser_fill`, `browser_select_option`, `browser_take_screenshot`. Discover their schemas with `GetDynamicTools` before calling them.

Drive only `http://127.0.0.1:4173`. Open a new tab for that origin. Do not reuse a tab already signed in on `localhost:3000`. Cookies are scoped to host and port, so a session on 4173 does not replace a session on 3000, but a shared browser tab can still be the user's. If `browser_tabs` shows the user working in an Aquila tab, leave that tab alone.

Prefer accessible names:

- Link `Open Dashboard` on `/`.
- Textboxes `Work email` and `Password`, checkbox `Remember me on this device for 7 days`, button `Sign in` on `/login`.
- Links `Master Dashboard`, `Transaction Dashboard`, `Transaction Type Dashboard`, `Settings`, `Exchange Helper` in the sidebar and in the heading `Transaction Big Book Pages`.
- Button `Sign out`. Confirm dialog title `Sign out?`.
- Button `New Ledger Entry`. Dialog name `Create Ledger Entry`. Button `Cancel` inside that dialog.
- Button `Apply Filters`, button `Reset`, textbox whose placeholder is `Explanation, remark, type...` on the ledger (the accessible name is `Search`).
- Heading `Master Dashboard`, heading `Cashflow by Type and Currency`, tablist `Outstanding categories` with tabs `Credit`, `Future Credit`, `Debt`.
- Heading `Big Book Settings`, tablist `Settings categories` with tab `Types`.
- Heading `Big Book Exchange Helper`, textbox `Amount`, comboboxes `From` and `To`, button `Convert Now`.

Signed-in journeys need `VERIFY_EMAIL` and `VERIFY_PASSWORD` in the environment of the driving agent. They are not in the repo. If either is missing, stop that journey and report the unmet precondition. Do not read `.env.local` for a password, invent one, or submit guesses. The verification user must be an `admin` in `allowed_users`. A `finance` or `viewer` account gets an empty sidebar and, on `/dashboard`, the text `This workspace is limited to administrators.`

After a successful password sign-in the app lands on `/dashboard`, which sends admins to `/dashboard/big-book`. Wait for the heading `Ledger Records` or the URL path `/dashboard/big-book`. Do not treat `Signing in...` as success.

## Evidence

Write proof under `.cursor/skills/verify-aquila-big-book/evidence/<feature-id>/`. Cleanup never removes that directory.

Every proof includes:

- The feature id and the entry point used (home link, direct URL, or sidebar link).
- An accessibility snapshot taken after the user action, saved as `*.aria.txt`. The document is named `Accounting`.
- A screenshot of that same state, saved as `*.png`. `browser_take_screenshot` writes a temp file; copy it into the evidence directory. The login card has no product title, so also save the final URL in `url.txt`.
- For a redirect, the URL before and after (unauthenticated `/dashboard/big-book` becomes `/login?next=/dashboard/big-book`).
- For a mutation that this map allows (none by default), a second user-facing view of the stored row. Opening a modal and pressing `Cancel` is not a mutation.

Do not prove a click by calling the API the button would call. Exchange Helper is allowed to reach Coinbase because production does that too; the proof is the on-screen line `Source: Coinbase public exchange rates` plus the converted amount. Do not stub that response.

## Cleanup

```powershell
node .cursor/skills/verify-aquila-big-book/scripts/verify-ctl.mjs cleanup
```

This runs `taskkill /PID <recorded-pid> /T /F` and deletes `run/` (state and log). It does not kill processes by name and does not delete `evidence/`. Run cleanup after a failed launch too, so a half-started server is not left on 4173.

## Isolate

One verification server per checkout. `launch` refuses to start if `run/state.json` still names a live pid, or if something else is already listening on 4173.

The database cannot be isolated. Every dev server that loads this `.env.local` reads and writes the same Supabase project. Do not launch a second app against that project to mutate data in parallel with the user. Read-only drives on 4173 are the supported mode. Creating ledger rows, importing CSV, inviting users, or editing settings writes production-shaped data. Those actions are not part of the seeded journeys.

## Helpers

`verify-ctl.mjs` is the only helper. Invoke it from the repo root as shown under Launch, Doctor, and Cleanup. `launch` blocks until `/login` is usable or exits non-zero. `doctor` prints a JSON report and exits non-zero when the instance is not worth driving. `cleanup` removes only the run it started.
