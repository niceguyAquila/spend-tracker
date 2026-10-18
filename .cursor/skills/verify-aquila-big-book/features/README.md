# Aquila Big Book verification map

This directory is the maintained source for verifying the user-facing behavior of Aquila Big Book. Read the index before driving the app, then use the matching feature file as the recipe.

## Baseline preconditions

- Launch with `node .cursor/skills/verify-aquila-big-book/scripts/verify-ctl.mjs launch` so the app is at `http://127.0.0.1:4173`.
- Run `node .cursor/skills/verify-aquila-big-book/scripts/verify-ctl.mjs doctor` and require `"ok": true`, the expected port, and a live pid.
- There is no local seed database. Signed-in journeys need `VERIFY_EMAIL` and `VERIFY_PASSWORD` for an admin user supplied outside the repo.
- Never drive an instance that was not started by this verification run.
- Do not create, import, edit, or delete ledger or settings rows. The Supabase project is shared with normal development.

## Driving conventions

- Start every recipe from the signed-out baseline unless its preconditions say otherwise.
- Prefer ARIA roles and accessible names over CSS selectors or DOM position.
- Treat every command as literal. Keep quoted names unchanged.
- Run browser actions through the Cursor IDE browser against `http://127.0.0.1:4173` only.
- Restore nothing in the remote database, because these journeys do not write to it. Do not remove proof artifacts during cleanup.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen.
- UI proof includes an ARIA snapshot, a screenshot, and `url.txt` with the final URL. The login page has no product name, so the URL is the app identity.
- Record the feature ID and entry point used with every artifact.
- Report an unreachable path with the attempted command and the unmet precondition.
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with the Cursor IDE browser` starts with `Preconditions:` and uses labeled bullets that pair each user action with an exact command and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

Keep implementation details out of the map. Name only user paths, stable handles, required state, commands, and observable proof.

## Features

- [Sign in](./sign-in.md) covers the public gate, the home entry, and a password sign-in that stops when credentials were not provided.
- [Transaction dashboard](./transaction-dashboard.md) covers opening the ledger and opening then cancelling a new entry.
- [Master dashboard](./master-dashboard.md) covers the cashflow summary and the outstanding tabs.
- [Settings](./settings.md) covers opening Big Book settings on the Types tab.
- [Exchange helper](./exchange-helper.md) covers a live conversion quote.

## Not yet mapped

- Transaction Type Dashboard (`/dashboard/big-book/individual-type-ledger`, button `Select Type`).
- Admin Users (`/dashboard/admin/users`, heading `User Access and Role Administration`).
