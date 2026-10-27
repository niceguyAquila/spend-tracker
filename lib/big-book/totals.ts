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
  /** Non-empty when this row is a payment covering one or more obligations. */
  settles?: readonly unknown[] | null;
  /**
   * Payments against this obligation. Applied amounts are already represented
   * by the payment rows, so totals keep only the uncovered remainder.
   */
  settlements?: readonly {
    currency_code: BigBookCurrency;
    applied_amount: number | null;
  }[] | null;
};

export type SettlementProfitOverviewEntry = GroupSummableEntry & {
  type_name?: string | null;
};

export type SettlementProfitOverviewLine = {
  kind: "profit" | "settle" | "total";
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
 * Credit currency already covered by a settlement payment, in either currency.
 * Unknown applied amounts (historical rows recorded without a rate) are not guessed.
 */
function settlementApplied(entry: GroupSummableEntry): number {
  if (!entry.is_credit || entry.is_future_credit || entry.is_debt) return 0;
  let covered = 0;
  for (const settlement of entry.settlements ?? []) {
    const applied = Number(settlement.applied_amount);
    if (!Number.isFinite(applied) || applied <= 0) continue;
    covered += applied;
  }
  return covered;
}

// Amounts are stored at 4 decimal places. A cross-currency close often lands
// one minor unit short (689,800 covered as 689,799.9999). That residue is not
// an unpaid balance.
const CROSS_CURRENCY_RESIDUE = 0.0001;

/**
 * Amount that belongs in a ledger total. A normal credit keeps the part not
 * yet covered by a settlement. The payment row carries the settled amount,
 * whether or not it uses the credit's currency.
 * A remainder of one minor unit or less is treated as fully covered.
 */
export function amountCountedInLedgerTotals(entry: GroupSummableEntry): number {
  const amount = Number(entry.amount);
  if (!Number.isFinite(amount)) return 0;
  const covered = settlementApplied(entry);
  if (covered <= 0) return amount;
  const remainder = roundBigBookAmount(Math.max(0, amount - covered));
  if (remainder <= CROSS_CURRENCY_RESIDUE) return 0;
  return remainder;
}

function countedEntries(entries: GroupSummableEntry[]): GroupSummableEntry[] {
  return entries.flatMap((entry) => {
    const amount = amountCountedInLedgerTotals(entry);
    if (!Number.isFinite(amount) || amount === 0) return [];
    return [{ ...entry, amount }];
  });
}

/**
 * Group header totals. Debt / Future Credit + settlement pairs only count
 * settlement rows so the payment is not double-counted with the obligation.
 * Open debt / Future Credit groups with no payment still sum the obligations.
 * A normal credit keeps its unpaid remainder and does not add the covered
 * amount again beside the settlement payment.
 */
export function summarizeGroupCurrencies(entries: GroupSummableEntry[]): BigBookCurrencyTotal[] {
  const hasFutureCredit = entries.some((entry) => Boolean(entry.is_future_credit));
  const hasDebt = entries.some((entry) => Boolean(entry.is_debt));
  const hasSettlement = entries.some((entry) => (entry.settles?.length ?? 0) > 0);
  if ((hasFutureCredit || hasDebt) && hasSettlement) {
    return summarizeCurrencies(entries.filter((entry) => (entry.settles?.length ?? 0) > 0));
  }
  return summarizeCurrencies(countedEntries(entries));
}

function isObligationEntry(entry: GroupSummableEntry) {
  return Boolean(entry.is_credit || entry.is_future_credit || entry.is_debt);
}

function isProfitCompanion(entry: SettlementProfitOverviewEntry) {
  if ((entry.settles?.length ?? 0) > 0 || isObligationEntry(entry)) return false;
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

function totalLinesFor(
  profitLines: Array<{ currency: BigBookCurrency; amount: number }>,
  settleLines: Array<{ currency: BigBookCurrency; amount: number }>
) {
  return BIG_BOOK_CURRENCY_ORDER.flatMap((currency) => {
    const profit = profitLines.find((line) => line.currency === currency)?.amount ?? 0;
    const settle = settleLines.find((line) => line.currency === currency)?.amount ?? 0;
    if (profit <= 0 && settle <= 0) return [];
    return [{ currency, amount: roundBigBookAmount(profit + settle) }];
  });
}

/**
 * Split group-header lines for a settlement that also created a PROFIT companion.
 * Returns null for every other group so the header keeps its single net.
 * TOTAL is PROFIT + SETTLE within one currency. Currencies are never added together.
 */
export function summarizeSettlementProfitOverview(
  entries: SettlementProfitOverviewEntry[]
): SettlementProfitOverviewLine[] | null {
  // An unpaid remainder still belongs in the header net.
  // Falling back lets summarizeGroupCurrencies keep that remainder.
  const hasOpenCrossCurrencyRemainder = entries.some(
    (entry) => settlementApplied(entry) > 0 && amountCountedInLedgerTotals(entry) > 0
  );
  if (hasOpenCrossCurrencyRemainder) return null;

  const profitLines = sumRecordedAmountsByCurrency(entries.filter(isProfitCompanion));
  const settleLines = sumRecordedAmountsByCurrency(
    entries.filter((entry) => (entry.settles?.length ?? 0) > 0)
  );
  if (!profitLines.length || !settleLines.length) return null;

  return [
    ...profitLines.map((line) => ({ kind: "profit" as const, ...line })),
    ...settleLines.map((line) => ({ kind: "settle" as const, ...line })),
    ...totalLinesFor(profitLines, settleLines).map((line) => ({ kind: "total" as const, ...line }))
  ];
}
