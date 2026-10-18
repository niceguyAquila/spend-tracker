# Exchange helper

Exchange helper turns an amount in one Big Book currency into another using the live public rate. The result names the source and the time it was fetched.

## Sub-features

- `exchange-open` shows the converter with its default amount and currencies.
- `exchange-quote` requests a quote and shows the converted amount on the page.

## How to get to it (user POV)

- Choose `Exchange Helper` in the sidebar under `Transaction Big Book`.
- Choose `Exchange Helper` in the `Transaction Big Book Pages` switcher.
- Open `/dashboard/big-book/exchange-helper` after signing in.

## Driving it with the Cursor IDE browser

Preconditions:

- `verify-ctl.mjs doctor` reports `"ok": true` for `http://127.0.0.1:4173`.
- `VERIFY_EMAIL` and `VERIFY_PASSWORD` are set for an admin. If they are missing, do not start this journey.
- Complete password sign-in from [sign-in.md](./sign-in.md) first.
- The machine can reach the public rate service. A failure message on the page is a failed quote, not a skipped one.

- **Open the helper.** Choose `Exchange Helper`. Call `browser_navigate` with `http://127.0.0.1:4173/dashboard/big-book/exchange-helper`. A heading `Big Book Exchange Helper` is visible, then a heading `Today's Exchange Helper`, a textbox `Amount` whose value is `1000`, a combobox `From` set to `USDT`, a combobox `To` set to `MYR`, and a button `Convert Now`.
- **Keep the defaults.** Do not change the amount or currencies. The default quote is 1000 USDT to MYR.
- **Convert.** Choose `Convert Now`. Call `browser_click` on the button named `Convert Now`. The button may read `Converting...` and then return to `Convert Now`. Wait until a line containing `Source: Coinbase public exchange rates` is visible, or until an error paragraph appears.
- **Proof.** On success, the page shows `USDT 1,000.00 =` followed by an `RM` amount, a `Rate: 1 USDT =` line ending in `MYR`, and the Coinbase source line. Call `browser_snapshot` and `browser_take_screenshot`. Save `evidence/exchange-helper/quote.aria.txt`, `evidence/exchange-helper/quote.png`, and `evidence/exchange-helper/url.txt` with the final URL. The snapshot must include the source line and both currency amounts.

## Gotchas

- The quote is live. Assert that a rate line and an `RM` amount are present. Do not assert a fixed numeric rate.
- An error string such as `Failed to fetch exchange quote.` or `Network error while fetching exchange quote.` means the journey failed.
- Amount `0` or a blank amount shows `Amount must be greater than 0.` and does not fetch a quote. Leave the field at `1000`.
- This page does not write a ledger row. It still needs a signed-in admin because the quote endpoint rejects anonymous callers.
