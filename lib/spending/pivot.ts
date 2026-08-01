import type { DashboardReportRow } from "@/lib/types";

export type SpendingPivotRow = {
  categoryId: string;
  categoryName: string;
  subcategoryId: string;
  subcategoryName: string;
  byMonth: Record<string, number>;
  subtotal: number;
};

export type SpendingPivotResult = {
  pivotRows: SpendingPivotRow[];
  categorySubtotals: Record<string, { byMonth: Record<string, number>; subtotal: number }>;
  monthGrandTotals: Record<string, number>;
};

export function buildSpendingPivot(
  rows: DashboardReportRow[],
  monthColumns: string[]
): SpendingPivotResult {
  const groupedRows = new Map<string, SpendingPivotRow>();

  for (const row of rows) {
    const key = `${row.category_id}:${row.subcategory_id}`;
    const existing = groupedRows.get(key);
    if (!existing) {
      const byMonth = Object.fromEntries(monthColumns.map((monthKey) => [monthKey, 0]));
      byMonth[row.month_key] = row.amount;
      groupedRows.set(key, {
        categoryId: row.category_id,
        categoryName: row.category_name,
        subcategoryId: row.subcategory_id,
        subcategoryName: row.subcategory_name,
        byMonth,
        subtotal: row.amount
      });
      continue;
    }

    existing.byMonth[row.month_key] = (existing.byMonth[row.month_key] ?? 0) + row.amount;
    existing.subtotal += row.amount;
  }

  const pivotRows = [...groupedRows.values()].sort((a, b) => {
    if (a.categoryName !== b.categoryName) return a.categoryName.localeCompare(b.categoryName);
    return a.subcategoryName.localeCompare(b.subcategoryName);
  });

  const monthGrandTotals = Object.fromEntries(monthColumns.map((monthKey) => [monthKey, 0])) as Record<
    string,
    number
  >;
  const categorySubtotals: Record<string, { byMonth: Record<string, number>; subtotal: number }> = {};

  for (const row of pivotRows) {
    if (!categorySubtotals[row.categoryId]) {
      categorySubtotals[row.categoryId] = {
        byMonth: Object.fromEntries(monthColumns.map((monthKey) => [monthKey, 0])),
        subtotal: 0
      };
    }

    for (const monthKey of monthColumns) {
      categorySubtotals[row.categoryId].byMonth[monthKey] += row.byMonth[monthKey] ?? 0;
      monthGrandTotals[monthKey] += row.byMonth[monthKey] ?? 0;
    }
    categorySubtotals[row.categoryId].subtotal += row.subtotal;
  }

  return { pivotRows, categorySubtotals, monthGrandTotals };
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
