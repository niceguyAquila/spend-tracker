# Master dashboard

The master dashboard shows cashflow totals by ledger type and currency, then outstanding credit, future credit, and debt for the same filters.

## Sub-features

- `master-open` shows the cashflow summary.
- `master-outstanding-tabs` switches outstanding credit, future credit, and debt without editing rows.

## How to get to it (user POV)

- Choose `Master Dashboard` in the sidebar under `Transaction Big Book`.
- Choose `Master Dashboard` in the `Transaction Big Book Pages` switcher.
- Open `/dashboard/big-book/master-dashboard` after signing in.

## Driving it with the Cursor IDE browser

Preconditions:

- `verify-ctl.mjs doctor` reports `"ok": true` for `http://127.0.0.1:4173`.
- `VERIFY_EMAIL` and `VERIFY_PASSWORD` are set for an admin. If they are missing, do not start this journey.
- Complete password sign-in from [sign-in.md](./sign-in.md) first.

- **Open the page.** Choose `Master Dashboard`. Call `browser_navigate` with `http://127.0.0.1:4173/dashboard/big-book/master-dashboard`. A heading `Master Dashboard` is visible, plus a heading `Cashflow by Type and Currency`, a button `Reset`, and a button `Apply Filters`.
- **Outstanding credit.** The tablist named `Outstanding categories` has a selected tab `Credit`. A heading `Outstanding Credit by Type and Actor` is visible. Call `browser_snapshot` and save it to `evidence/master-dashboard/credit.aria.txt`.
- **Future credit.** Choose `Future Credit`. Call `browser_click` on the tab named `Future Credit`. A heading `Outstanding Future Credit by Type and Actor` replaces the credit heading.
- **Debt.** Choose `Debt`. Call `browser_click` on the tab named `Debt`. The visible heading is `Outstanding Debt by Grouped Transaction and Actor`.
- **Proof.** Call `browser_snapshot` and `browser_take_screenshot`. Save `evidence/master-dashboard/debt.aria.txt`, `evidence/master-dashboard/debt.png`, and `evidence/master-dashboard/url.txt` with the final URL. The snapshot shows the debt heading and the tab `Debt` selected. Do not click `Apply Filters` or any settle action.

## Gotchas

- Filters on this page also change which outstanding rows appear. Leave them at their defaults.
- Settle and select controls inside the outstanding tables write payments on the shared database. Do not click `Select outstanding` checkboxes or settlement actions.
- If the page shows `Big Book setup required`, report the missing database tables and stop.
- The sidebar can be collapsed to icon width. The link name is still `Master Dashboard`. If the snapshot has no such link, click the button `Expand sidebar` first.
