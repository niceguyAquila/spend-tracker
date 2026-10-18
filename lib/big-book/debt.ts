import type {
  BigBookCashflowCurrency,
  BigBookDebtStatus,
  BigBookVendorActorOutstandingDebtRow
} from "@/lib/types";

export function computeBigBookDebtStatus(debtSettledAt: string | null): BigBookDebtStatus {
  return debtSettledAt ? "settled" : "open";
}

/** Row of get_big_book_vendor_actor_outstanding_debt: grouped transaction (or standalone debt) + actor + currency. */
export type VendorActorOutstandingDebtRpcRow = {
  group_id: string | null;
  entry_id: string | null;
  group_label: string | null;
  explanation: string | null;
  vendor_type_id: string | null;
  vendor_type_name: string | null;
  actor_id: string;
  actor_code: "A" | "B";
  actor_display_name: string;
  currency: BigBookVendorActorOutstandingDebtRow["currency"];
  outstanding: number | string;
  open_debt_count: number | string;
  unknown_balance_count: number | string;
};

export function toVendorActorOutstandingDebtRows(
  rows: VendorActorOutstandingDebtRpcRow[]
): BigBookVendorActorOutstandingDebtRow[] {
  const mapped = rows.map((row): BigBookVendorActorOutstandingDebtRow => {
    const groupKey = row.group_id ?? `entry:${row.entry_id}`;
    return {
      row_key: `${groupKey}:${row.actor_id}:${row.currency}`,
      group_id: row.group_id,
      group_label: row.group_id
        ? row.group_label?.trim() || "(Untitled group)"
        : row.explanation?.trim() || "(Ungrouped debt)",
      entry_id: row.group_id ? null : row.entry_id,
      vendor_type_id: row.vendor_type_id,
      vendor_type_name: row.vendor_type_name ?? "-",
      actor_id: row.actor_id,
      actor_code: row.actor_code,
      actor_display_name: row.actor_display_name,
      currency: row.currency,
      outstanding: Number(row.outstanding),
      open_debt_count: Number(row.open_debt_count),
      unknown_balance_count: Number(row.unknown_balance_count ?? 0)
    };
  });

  const currencyOrder: BigBookCashflowCurrency[] = ["IDR", "MYR", "USDT", "TRX"];

  return mapped.sort((a, b) => {
    const currencyDiff = currencyOrder.indexOf(a.currency) - currencyOrder.indexOf(b.currency);
    if (currencyDiff !== 0) return currencyDiff;
    if (a.outstanding !== b.outstanding) return b.outstanding - a.outstanding;
    if (a.group_label !== b.group_label) return a.group_label.localeCompare(b.group_label);
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
