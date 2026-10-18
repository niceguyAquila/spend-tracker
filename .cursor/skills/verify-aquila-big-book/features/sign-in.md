# Sign in

Sign in is the gate in front of the dashboard. A signed-out user who opens the app sees a work-email form, and any dashboard URL sends them back to that form.

## Sub-features

- `sign-in-home` opens the form from the home page.
- `sign-in-direct` opens the form at `/login`.
- `sign-in-guard` sends a signed-out visit to a dashboard URL back to the form and keeps the requested path.
- `sign-in-password` signs in an admin and lands on the ledger. This step runs only when credentials were supplied outside the repo.

## How to get to it (user POV)

- Open `/` and choose `Open Dashboard`.
- Open `/login` directly.
- Open `/dashboard/big-book` while signed out.

## Driving it with the Cursor IDE browser

Preconditions:

- `verify-ctl.mjs doctor` reports `"ok": true` for `http://127.0.0.1:4173`.
- The browser tab is not already signed in on that origin. Start from a fresh tab.
- `sign-in-password` also needs `VERIFY_EMAIL` and `VERIFY_PASSWORD` in the agent environment. If either is unset, run the three signed-out steps, then stop and record that the password step was not run.

- **Home entry.** Open the site root. Call `browser_navigate` with `http://127.0.0.1:4173/`. A link named `Open Dashboard` is visible. Call `browser_snapshot` and save the YAML to `evidence/sign-in/home.aria.txt`.
- **Follow the home link.** Choose `Open Dashboard`. Call `browser_click` on the link named `Open Dashboard`, then snapshot again until the URL changes. The address becomes `http://127.0.0.1:4173/login` with no `next` query (the dashboard root is the default destination). The form shows textboxes `Work email` and `Password` and a button `Sign in`. The document is named `Accounting`.
- **Direct login.** Open the form on its own URL. Call `browser_navigate` with `http://127.0.0.1:4173/login`. The same three controls are present, plus the checkbox `Remember me on this device for 7 days`.
- **Guard a deep link.** Open the ledger while signed out. Call `browser_navigate` with `http://127.0.0.1:4173/dashboard/big-book`. The address becomes `http://127.0.0.1:4173/login?next=%2Fdashboard%2Fbig-book` (the `next` value is `/dashboard/big-book`) and the sign-in form is shown again. Write that URL to `evidence/sign-in/url.txt`. Call `browser_snapshot` and save the YAML to `evidence/sign-in/login.aria.txt`. Call `browser_take_screenshot` with filename `login.png`, then copy that file to `evidence/sign-in/login.png`. The tool stores the image outside the repo.
- **Password sign-in.** Fill the form with the supplied admin account. Call `browser_fill` on textbox `Work email` with `VERIFY_EMAIL`, `browser_fill` on textbox `Password` with `VERIFY_PASSWORD`, then `browser_click` the button `Sign in`. Wait until the path is `/dashboard/big-book` and a heading `Ledger Records` is visible, along with the account email in the header. Save `evidence/sign-in/signed-in.aria.txt`, `evidence/sign-in/signed-in.png`, and the final URL. Do not write the password into any artifact.
- **Proof.** The signed-out artifacts show the form after a rejected deep link. The signed-in artifacts, when credentials existed, show the ledger rather than the form.

## Gotchas

- `/dashboard` redirects to `/login` without `next`. `/dashboard/big-book` keeps `next` set to `/dashboard/big-book`, shown percent-encoded as `next=%2Fdashboard%2Fbig-book`. Assert the URL you actually opened.
- The click on `Open Dashboard` does not update the snapshot in the same turn. Snapshot again until the path is `/login`.
- A button named `Open Next.js Dev Tools` is the dev overlay. Ignore it.
- The button label changes to `Signing in...` while the request is in flight. Wait for the ledger heading or an error paragraph, not a fixed delay.
- A rejected password shows the provider's message under the form. That is a failed sign-in, not proof that the guard works.
- Admins who do sign in are sent from `/dashboard` to `/dashboard/big-book`. Other roles see `This workspace is limited to administrators.` and no sidebar links.
- Checking `Remember me on this device for 7 days` is outside this journey. Leave it unchecked.
- Do not submit guessed passwords. The form talks to the shared Supabase project.
