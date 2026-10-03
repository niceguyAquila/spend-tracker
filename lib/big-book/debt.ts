import type {
  BigBookCashflowCurrency,
  BigBookDebtStatus,
  BigBookVendorActorOutstandingDebtRow
} from "@/lib/types";

export function computeBigBookDebtStatus(debtSettledAt: string | null): BigBookDebtStatus {
  return debtSettledAt ? "settled" : "open";
}

export type VendorActorOutstandingDebtInput = {
  id: string;
  responsible_actor_id: string;
  vendor_id: string | null;
  vendor_type_id: string | null;
  currency_code: BigBookVendorActorOutstandingDebtRow["currency"];
  amount: number;
  vendor_name: string | null;
  vendor_type_name: string | null;
  actor_code: "A" | "B";
  actor_display_name: string;
};

/**
 * Aggregate open debt balances by vendor + actor + currency.
 * Callers must pass only open debts (debt_settled_at is null).
 */
export function aggregateVendorActorOutstandingDebt(
  debts: VendorActorOutstandingDebtInput[]
): BigBookVendorActorOutstandingDebtRow[] {
  const byKey = new Map<string, BigBookVendorActorOutstandingDebtRow>();

  for (const debt of debts) {
    const amount = Math.abs(Number(debt.amount));
    if (!(amount > 0)) continue;

    const vendorKey = debt.vendor_id ?? "none";
    const key = `${vendorKey}:${debt.responsible_actor_id}:${debt.currency_code}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.outstanding += amount;
      existing.open_debt_count += 1;
      continue;
    }

    byKey.set(key, {
      row_key: key,
      vendor_id: debt.vendor_id,
      vendor_name: debt.vendor_name ?? "(No vendor)",
      vendor_type_id: debt.vendor_type_id,
      vendor_type_name: debt.vendor_type_name ?? "-",
      actor_id: debt.responsible_actor_id,
      actor_code: debt.actor_code,
      actor_display_name: debt.actor_display_name,
      currency: debt.currency_code,
      outstanding: amount,
      open_debt_count: 1
    });
  }

  const currencyOrder: BigBookCashflowCurrency[] = ["IDR", "MYR", "USDT", "TRX"];

  return [...byKey.values()].sort((a, b) => {
    const currencyDiff = currencyOrder.indexOf(a.currency) - currencyOrder.indexOf(b.currency);
    if (currencyDiff !== 0) return currencyDiff;
    if (a.outstanding !== b.outstanding) return b.outstanding - a.outstanding;
    if (a.vendor_name !== b.vendor_name) return a.vendor_name.localeCompare(b.vendor_name);
    return a.actor_display_name.localeCompare(b.actor_display_name);
  });
}

export type OutstandingCurrencyTotal = {
  currency: BigBookCashflowCurrency;
  outstanding: number;
  openCount: number;
};

/** Sum outstanding rows into a stable currency breakdown (IDR → MYR → USDT → TRX). */
export function sumOutstandingByCurrency(
  rows: Array<{ currency: BigBookCashflowCurrency; outstanding: number; openCount: number }>
): OutstandingCurrencyTotal[] {
  const currencyOrder: BigBookCashflowCurrency[] = ["IDR", "MYR", "USDT", "TRX"];
  const map = new Map<BigBookCashflowCurrency, OutstandingCurrencyTotal>();
  for (const row of rows) {
    const existing = map.get(row.currency) ?? {
      currency: row.currency,
      outstanding: 0,
      openCount: 0
    };
    existing.outstanding += row.outstanding;
    existing.openCount += row.openCount;
    map.set(row.currency, existing);
  }
  return currencyOrder.flatMap((currency) => {
    const totals = map.get(currency);
    return totals ? [totals] : [];
  });
}
