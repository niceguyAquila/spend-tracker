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

export type VendorActorOutstandingCreditInput = {
  id: string;
  responsible_actor_id: string;
  vendor_id: string | null;
  vendor_type_id: string | null;
  currency_code: BigBookVendorActorOutstandingRow["currency"];
  amount: number;
  vendor_name: string | null;
  vendor_type_name: string | null;
  actor_code: "A" | "B";
  actor_display_name: string;
};

/**
 * Aggregate open credit balances by vendor + actor + currency.
 * Callers must pass only open credits (credit_settled_at is null).
 */
export function aggregateVendorActorOutstanding(
  credits: VendorActorOutstandingCreditInput[]
): BigBookVendorActorOutstandingRow[] {
  const byKey = new Map<string, BigBookVendorActorOutstandingRow>();

  for (const credit of credits) {
    const amount = Math.abs(Number(credit.amount));
    if (!(amount > 0)) continue;

    const vendorKey = credit.vendor_id ?? "none";
    const key = `${vendorKey}:${credit.responsible_actor_id}:${credit.currency_code}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.outstanding += amount;
      existing.open_credit_count += 1;
      continue;
    }

    byKey.set(key, {
      row_key: key,
      vendor_id: credit.vendor_id,
      vendor_name: credit.vendor_name ?? "(No vendor)",
      vendor_type_id: credit.vendor_type_id,
      vendor_type_name: credit.vendor_type_name ?? "-",
      actor_id: credit.responsible_actor_id,
      actor_code: credit.actor_code,
      actor_display_name: credit.actor_display_name,
      currency: credit.currency_code,
      outstanding: amount,
      open_credit_count: 1
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
    if (a.vendor_name !== b.vendor_name) return a.vendor_name.localeCompare(b.vendor_name);
    return a.actor_display_name.localeCompare(b.actor_display_name);
  });
}
