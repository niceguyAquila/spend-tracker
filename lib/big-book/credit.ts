import type {
  BigBookCreditStatus,
  BigBookVendorActorOutstandingRow
} from "@/lib/types";

export const BIG_BOOK_SETTLEMENT_EPSILON = 0.0001;

export function computeOutstanding(amount: number, totalSettled: number): number {
  return Math.max(0, amount - totalSettled);
}

export function computeBigBookCreditStatus(
  amount: number,
  totalSettled: number
): BigBookCreditStatus {
  if (totalSettled <= BIG_BOOK_SETTLEMENT_EPSILON) return "open";
  if (totalSettled + BIG_BOOK_SETTLEMENT_EPSILON >= amount) return "settled";
  return "partial";
}

export function roundSettlementAmount(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function computeSettlementAmountInCreditCurrency(
  amount: number,
  conversionRate: number
): number {
  return roundSettlementAmount(amount * conversionRate);
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
 * `settledByCreditId` must include ALL settlements for the given credits,
 * regardless of any date filter that selected those credits.
 */
export function aggregateVendorActorOutstanding(
  credits: VendorActorOutstandingCreditInput[],
  settledByCreditId: Map<string, number>
): BigBookVendorActorOutstandingRow[] {
  const byKey = new Map<string, BigBookVendorActorOutstandingRow>();

  for (const credit of credits) {
    const amount = Math.abs(Number(credit.amount));
    const totalSettled = settledByCreditId.get(credit.id) ?? 0;
    const outstanding = computeOutstanding(amount, totalSettled);
    if (outstanding <= BIG_BOOK_SETTLEMENT_EPSILON) continue;

    const vendorKey = credit.vendor_id ?? "none";
    const key = `${vendorKey}:${credit.responsible_actor_id}:${credit.currency_code}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.total_credited += amount;
      existing.total_settled += totalSettled;
      existing.outstanding += outstanding;
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
      total_credited: amount,
      total_settled: totalSettled,
      outstanding,
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
