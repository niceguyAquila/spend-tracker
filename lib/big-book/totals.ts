export type BigBookCurrency = "IDR" | "MYR" | "USDT" | "TRX";

export const BIG_BOOK_CURRENCY_ORDER: BigBookCurrency[] = ["IDR", "MYR", "USDT", "TRX"];

export type BigBookCurrencyTotal = {
  currency: BigBookCurrency;
  spending: number;
  profit: number;
  net: number;
};

type SummableEntry = {
  amount: number;
  currency_code: BigBookCurrency;
  entry_direction: "spending" | "profit";
};

// Amounts carry up to 4 decimals. Rounding the accumulated value at 8 decimals
// keeps repeated float addition from surfacing artefacts like 1234.5600000000002.
export function roundBigBookAmount(value: number) {
  return Math.round(value * 1e8) / 1e8;
}

/**
 * Per-currency Out / In / Net totals. Currencies are never added together, and
 * a currency with no matching entries is omitted entirely.
 */
export function summarizeCurrencies(entries: SummableEntry[]): BigBookCurrencyTotal[] {
  const map = new Map<BigBookCurrency, { spending: number; profit: number }>();

  for (const entry of entries) {
    const amount = Number(entry.amount);
    if (!Number.isFinite(amount)) continue;
    const existing = map.get(entry.currency_code) ?? { spending: 0, profit: 0 };
    if (entry.entry_direction === "spending") {
      existing.spending += amount;
    } else {
      existing.profit += amount;
    }
    map.set(entry.currency_code, existing);
  }

  return BIG_BOOK_CURRENCY_ORDER.flatMap((currency) => {
    const totals = map.get(currency);
    if (!totals) return [];
    const spending = roundBigBookAmount(totals.spending);
    const profit = roundBigBookAmount(totals.profit);
    return [{ currency, spending, profit, net: roundBigBookAmount(profit - spending) }];
  });
}
