# Settings

Settings is where an admin reviews ledger types, vendor types, vendor names, and the other Big Book catalogs. This journey only opens the Types tab. It does not add or rename anything.

## Sub-features

- `settings-open` shows Big Book settings with Types selected.
- `settings-tablist` exposes the catalog tabs, including Danger zone, without switching into an edit.

## How to get to it (user POV)

- Choose `Settings` in the sidebar under `Transaction Big Book`.
- Choose `Settings` in the `Transaction Big Book Pages` switcher.
- Open `/dashboard/big-book/settings` after signing in.

## Driving it with the Cursor IDE browser

Preconditions:

- `verify-ctl.mjs doctor` reports `"ok": true` for `http://127.0.0.1:4173`.
- `VERIFY_EMAIL` and `VERIFY_PASSWORD` are set for an admin. If they are missing, do not start this journey.
- Complete password sign-in from [sign-in.md](./sign-in.md) first.

- **Open settings.** Choose `Settings`. Call `browser_navigate` with `http://127.0.0.1:4173/dashboard/big-book/settings`. A heading `Big Book Settings` is visible.
- **Types tab.** The tablist named `Settings categories` contains tabs `Types`, `Vendor Types`, `Vendor Names`, `Action By`, `Actor Pockets`, `Invoice Wallets`, `Actor Mapping`, `Type → Vendor Map`, `Invoice Presets`, `History`, and `Danger zone`. The tab `Types` is selected.
- **Proof.** Call `browser_snapshot` and `browser_take_screenshot`. Save `evidence/settings/types.aria.txt`, `evidence/settings/types.png`, and `evidence/settings/url.txt` with `http://127.0.0.1:4173/dashboard/big-book/settings`. The snapshot shows heading `Big Book Settings` and selected tab `Types`. Do not click `Danger zone` and do not submit any add or rename control.

## Gotchas

- Several buttons on this page create or deactivate catalog rows in the shared database. Seeing the tab is the proof. Do not confirm an add dialog.
- `Danger zone` deletes values off existing ledger rows. Do not open it during verification.
- The tab accessible name is the visible label, such as `Types`, inside the tablist `Settings categories`.
- If the page shows `Big Book setup required`, report the missing database tables and stop.
