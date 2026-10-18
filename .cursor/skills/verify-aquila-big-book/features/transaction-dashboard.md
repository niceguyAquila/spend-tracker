# Transaction dashboard

The transaction dashboard is the ledger. An admin opens it to see ledger rows, filter them, and start a new entry. Saving an entry writes to the shared database, so this journey stops at the open form and cancels.

## Sub-features

- `ledger-open` shows the ledger from the sidebar and from the page switcher.
- `ledger-filter-controls` shows search and apply controls without changing stored rows.
- `ledger-new-cancel` opens the new-entry dialog and closes it without saving.

## How to get to it (user POV)

- Choose `Transaction Dashboard` in the sidebar under `Transaction Big Book`.
- Choose `Transaction Dashboard` in the `Transaction Big Book Pages` switcher.
- Open `/dashboard/big-book` after signing in.

## Driving it with the Cursor IDE browser

Preconditions:

- `verify-ctl.mjs doctor` reports `"ok": true` for `http://127.0.0.1:4173`.
- `VERIFY_EMAIL` and `VERIFY_PASSWORD` are set for an admin. If they are missing, do not start this journey.
- Complete password sign-in from [sign-in.md](./sign-in.md) first. The header shows that email.

- **Sidebar entry.** Choose `Transaction Dashboard` in the sidebar. Call `browser_click` on the link named `Transaction Dashboard`. The path is `/dashboard/big-book`. A heading `Ledger Records` is visible, with buttons `Export CSV`, `Import CSV`, and `New Ledger Entry`.
- **Page switcher.** The same page shows the heading `Transaction Big Book Pages` and a second link named `Transaction Dashboard`. Call `browser_snapshot` and save it to `evidence/transaction-dashboard/ledger.aria.txt`.
- **Filter controls.** Find the textbox named `Search` (placeholder `Explanation, remark, type...`), the button `Advanced Filters`, the button `Reset`, and the button `Apply Filters`. Do not type a query and do not click `Apply Filters`. Stored rows must stay untouched.
- **Open the new-entry dialog.** Choose `New Ledger Entry`. Call `browser_click` on the button named `New Ledger Entry`. A dialog named `Create Ledger Entry` appears, with a button named `Cancel` and a button named `Close dialog`.
- **Cancel.** Choose `Cancel`. Call `browser_click` on the button named `Cancel` inside that dialog. The dialog closes and the heading `Ledger Records` is visible again.
- **Proof.** Call `browser_snapshot` and `browser_take_screenshot` after cancel. Save `evidence/transaction-dashboard/cancelled.aria.txt`, `evidence/transaction-dashboard/cancelled.png`, and `evidence/transaction-dashboard/url.txt` containing `http://127.0.0.1:4173/dashboard/big-book`. The snapshot contains `Ledger Records` and does not contain a dialog named `Create Ledger Entry`.

## Gotchas

- The sidebar link and the page-switcher link share the accessible name `Transaction Dashboard`. Either reaches the same path. Record which one you clicked.
- `Apply Filters` stays disabled until a filter value changes. Enabling it and applying a search is a read, but skip it so the proof stays on the default ledger.
- `Import CSV` writes rows immediately. `Save` inside `Create Ledger Entry` opens a confirm dialog titled `Create ledger entry?`. Do not click `Import CSV`, `Save`, or that confirm button.
- Ctrl+Enter inside the dialog submits the entry. Do not send that shortcut.
- If the page shows `Big Book setup required`, the remote database is missing tables. Report that precondition as failed. Do not apply migrations from this journey.
