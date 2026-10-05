import type {
  BigBookCreditStatus,
  BigBookVendorActorOutstandingRow
} from "@/lib/types";

export function computeBigBookCreditStatus(
  creditSettledAt: string | null
): BigBookCreditStatus {
  return creditSettledAt ? "settled" : "open";
}

export function roundSettlementAmount(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/**
 * Settlement conversion convention (matches Record Settlement / entries API):
 *   conversion_rate = credit_currency units per 1 settlement_currency unit
 *   e.g. settle MYR credit in USDT at "1 USDT = 4.20 MYR" → rate = 4.20
 *
 * credit_equiv = settlement_amount * conversion_rate
 */
export function computeSettlementAmountInCreditCurrency(
  amount: number,
  conversionRate: number
): number {
  return roundSettlementAmount(amount * conversionRate);
}

/**
 * Inverse of {@link computeSettlementAmountInCreditCurrency}:
 *   settlement_amount = credit_amount / conversion_rate
 * Used when admin enters the day's USDT rate and we populate Amount in USDT.
 */
export function computeSettlementAmountFromCredit(
  creditAmount: number,
  conversionRate: number
): number {
  if (!(conversionRate > 0)) return 0;
  return roundSettlementAmount(creditAmount / conversionRate);
}

/**
 * USDT settle with optional PROFIT surcharge:
 *   A = (base + profit) / rate
 * where rate = credit-currency units per 1 USDT.
 */
export function computeUsdtSettleAmountWithProfit(
  baseCreditAmount: number,
  profitAmount: number,
  conversionRate: number
): number {
  const profit = Number.isFinite(profitAmount) && profitAmount > 0 ? profitAmount : 0;
  return computeSettlementAmountFromCredit(baseCreditAmount + profit, conversionRate);
}

export type VendorActorOutstandingCreditInput = {
  id: string;
  responsible_actor_id: string;
  vendor_id: string | null;
  vendor_type_id: string | null;
  entry_type_id?: string | null;
  type_name?: string | null;
  currency_code: BigBookVendorActorOutstandingRow["currency"];
  amount: number;
  vendor_name: string | null;
  vendor_type_name: string | null;
  actor_code: "A" | "B";
  actor_display_name: string;
  is_future_credit?: boolean;
};

export type AggregateVendorActorOutstandingOptions = {
  /**
   * When true, only Future Credit rows bucketed by ledger Type + Actor + Currency.
   * When false/omitted, only actualized Credit bucketed by Vendor Type + Actor + Currency.
   */
  futureOnly?: boolean;
};

/**
 * Aggregate open credit balances.
 * Callers must pass only open credits (credit_settled_at is null).
 * Credit: vendor type + actor + currency. Future Credit: ledger type + actor + currency.
 */
export function aggregateVendorActorOutstanding(
  credits: VendorActorOutstandingCreditInput[],
  options?: AggregateVendorActorOutstandingOptions
): BigBookVendorActorOutstandingRow[] {
  const futureOnly = Boolean(options?.futureOnly);
  const byKey = new Map<string, BigBookVendorActorOutstandingRow>();

  for (const credit of credits) {
    const isFuture = Boolean(credit.is_future_credit);
    if (futureOnly ? !isFuture : isFuture) continue;

    const amount = Math.abs(Number(credit.amount));
    if (!(amount > 0)) continue;

    const typeKey = credit.entry_type_id ?? "none";
    const vendorTypeKey = credit.vendor_type_id ?? "none";
    const key = futureOnly
      ? `type:${typeKey}:${credit.responsible_actor_id}:${credit.currency_code}`
      : `vendor_type:${vendorTypeKey}:${credit.responsible_actor_id}:${credit.currency_code}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.outstanding += amount;
      existing.open_credit_count += 1;
      if (futureOnly) existing.open_future_credit_count += 1;
      continue;
    }

    byKey.set(key, {
      row_key: key,
      vendor_id: null,
      vendor_name: "-",
      vendor_type_id: futureOnly ? null : credit.vendor_type_id,
      vendor_type_name: futureOnly ? "-" : (credit.vendor_type_name ?? "-"),
      entry_type_id: futureOnly ? (credit.entry_type_id ?? null) : null,
      type_name: futureOnly ? (credit.type_name ?? "-") : "-",
      actor_id: credit.responsible_actor_id,
      actor_code: credit.actor_code,
      actor_display_name: credit.actor_display_name,
      currency: credit.currency_code,
      outstanding: amount,
      open_credit_count: 1,
      open_future_credit_count: futureOnly ? 1 : 0
    });
  }

  const currencyOrder: Array<BigBookVendorActorOutstandingRow["currency"]> = [
    "IDR",
    "MYR",
    "USDT",
    "TRX"
  ];

  return [...byKey.values()].sort((a, b) => {
    const currencyDiff =
      currencyOrder.indexOf(a.currency) - currencyOrder.indexOf(b.currency);
    if (currencyDiff !== 0) return currencyDiff;
    if (a.outstanding !== b.outstanding) return b.outstanding - a.outstanding;
    if (futureOnly) {
      if (a.type_name !== b.type_name) return a.type_name.localeCompare(b.type_name);
    } else if (a.vendor_type_name !== b.vendor_type_name) {
      return a.vendor_type_name.localeCompare(b.vendor_type_name);
    }
    return a.actor_display_name.localeCompare(b.actor_display_name);
  });
}
