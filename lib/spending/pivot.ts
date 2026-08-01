import type { DashboardReportRow, SpendingCurrencyCode } from "@/lib/types";

export const SPENDING_CURRENCY_ORDER: SpendingCurrencyCode[] = ["IDR", "MYR", "USDT", "TRX"];

export type SpendingPivotRow = {
  categoryId: string;
  categoryName: string;
  byMonth: Record<string, number>;
  subtotal: number;
};

export type SpendingPivotResult = {
  pivotRows: SpendingPivotRow[];
  monthGrandTotals: Record<string, number>;
};

export function buildSpendingPivot(
  rows: DashboardReportRow[],
  monthColumns: string[]
): SpendingPivotResult {
  const groupedRows = new Map<string, SpendingPivotRow>();

  for (const row of rows) {
    const key = row.category_id;
    const existing = groupedRows.get(key);
    if (!existing) {
      const byMonth = Object.fromEntries(monthColumns.map((monthKey) => [monthKey, 0]));
      byMonth[row.month_key] = row.amount;
      groupedRows.set(key, {
        categoryId: row.category_id,
        categoryName: row.category_name,
        byMonth,
        subtotal: row.amount
      });
      continue;
    }

    existing.byMonth[row.month_key] = (existing.byMonth[row.month_key] ?? 0) + row.amount;
    existing.subtotal += row.amount;
  }

  const pivotRows = [...groupedRows.values()].sort((a, b) =>
    a.categoryName.localeCompare(b.categoryName)
  );

  const monthGrandTotals = Object.fromEntries(monthColumns.map((monthKey) => [monthKey, 0])) as Record<
    string,
    number
  >;

  for (const row of pivotRows) {
    for (const monthKey of monthColumns) {
      monthGrandTotals[monthKey] += row.byMonth[monthKey] ?? 0;
    }
  }

  return { pivotRows, monthGrandTotals };
}

export function buildSpendingNetByMonth(
  inflowTotals: Record<string, number>,
  outflowTotals: Record<string, number>,
  monthColumns: string[]
): Record<string, number> {
  return Object.fromEntries(
    monthColumns.map((monthKey) => [
      monthKey,
      (inflowTotals[monthKey] ?? 0) - (outflowTotals[monthKey] ?? 0)
    ])
  );
}

export function partitionSpendingRowsByDirection(rows: DashboardReportRow[]) {
  const outflowRows: DashboardReportRow[] = [];
  const inflowRows: DashboardReportRow[] = [];
  for (const row of rows) {
    if (row.entry_direction === "profit") {
      inflowRows.push(row);
    } else {
      outflowRows.push(row);
    }
  }
  return { outflowRows, inflowRows };
}

/** One block per currency that has rows; currencies with no rows are omitted. */
export function partitionSpendingRowsByCurrency(
  rows: DashboardReportRow[]
): Array<{ currency: SpendingCurrencyCode; rows: DashboardReportRow[] }> {
  const map = new Map<SpendingCurrencyCode, DashboardReportRow[]>();
  for (const row of rows) {
    const list = map.get(row.currency_code) ?? [];
    list.push(row);
    map.set(row.currency_code, list);
  }

  return SPENDING_CURRENCY_ORDER.flatMap((currency) => {
    const currencyRows = map.get(currency);
    if (!currencyRows?.length) return [];
    return [{ currency, rows: currencyRows }];
  });
}
