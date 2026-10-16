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

export type GroupSummableEntry = SummableEntry & {
  is_credit?: boolean;
  is_future_credit?: boolean;
  is_debt?: boolean;
  settles_entry_id?: string | null;
};

export type SettlementProfitOverviewEntry = GroupSummableEntry & {
  type_name?: string | null;
};

export type SettlementProfitOverviewLine = {
  kind: "profit" | "settle";
  currency: BigBookCurrency;
  amount: number;
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

/**
 * Group header totals. Debt / Future Credit + settlement pairs only count
 * settlement rows so the payment is not double-counted with the obligation.
 * Open debt / Future Credit groups with no payment still sum the obligations.
 */
export function summarizeGroupCurrencies(entries: GroupSummableEntry[]): BigBookCurrencyTotal[] {
  const hasFutureCredit = entries.some((entry) => Boolean(entry.is_future_credit));
  const hasDebt = entries.some((entry) => Boolean(entry.is_debt));
  const hasSettlement = entries.some((entry) => Boolean(entry.settles_entry_id));
  if ((hasFutureCredit || hasDebt) && hasSettlement) {
    return summarizeCurrencies(entries.filter((entry) => Boolean(entry.settles_entry_id)));
  }
  return summarizeCurrencies(entries);
}

function isObligationEntry(entry: GroupSummableEntry) {
  return Boolean(entry.is_credit || entry.is_future_credit || entry.is_debt);
}

function isProfitCompanion(entry: SettlementProfitOverviewEntry) {
  if (entry.settles_entry_id || isObligationEntry(entry)) return false;
  return (entry.type_name ?? "").trim().toLowerCase() === "profit";
}

function sumRecordedAmountsByCurrency(entries: SettlementProfitOverviewEntry[]) {
  const map = new Map<BigBookCurrency, number>();

  for (const entry of entries) {
    const amount = Math.abs(Number(entry.amount));
    if (!Number.isFinite(amount) || amount <= 0) continue;
    map.set(entry.currency_code, (map.get(entry.currency_code) ?? 0) + amount);
  }

  return BIG_BOOK_CURRENCY_ORDER.flatMap((currency) => {
    const amount = map.get(currency);
    if (amount == null || amount <= 0) return [];
    return [{ currency, amount: roundBigBookAmount(amount) }];
  });
}

/**
 * Split group-header lines for a settlement that also created a PROFIT companion.
 * Returns null for every other group so the header keeps its single net.
 * Currencies stay separate: a USDT settlement is not added to a MYR profit row.
 */
export function summarizeSettlementProfitOverview(
  entries: SettlementProfitOverviewEntry[]
): SettlementProfitOverviewLine[] | null {
  const profitLines = sumRecordedAmountsByCurrency(entries.filter(isProfitCompanion));
  const settleLines = sumRecordedAmountsByCurrency(
    entries.filter((entry) => Boolean(entry.settles_entry_id))
  );
  if (!profitLines.length || !settleLines.length) return null;

  return [
    ...profitLines.map((line) => ({ kind: "profit" as const, ...line })),
    ...settleLines.map((line) => ({ kind: "settle" as const, ...line }))
  ];
}
