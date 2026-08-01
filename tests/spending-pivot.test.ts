import { describe, expect, it } from "vitest";
import type { DashboardReportRow } from "@/lib/types";
import {
  buildSpendingNetByMonth,
  buildSpendingPivot,
  partitionSpendingRowsByDirection
} from "@/lib/spending/pivot";

function row(
  partial: Partial<DashboardReportRow> &
    Pick<DashboardReportRow, "category_id" | "subcategory_id" | "month_key" | "amount" | "entry_direction">
): DashboardReportRow {
  return {
    category_name: partial.category_name ?? "Category",
    subcategory_name: partial.subcategory_name ?? "Sub",
    ...partial
  };
}

describe("spending pivot helpers", () => {
  const monthColumns = ["2026-01-01", "2026-02-01"];

  const rows: DashboardReportRow[] = [
    row({
      category_id: "c1",
      category_name: "Fixed",
      subcategory_id: "s1",
      subcategory_name: "Rent",
      month_key: "2026-01-01",
      amount: 100,
      entry_direction: "spending"
    }),
    row({
      category_id: "c1",
      category_name: "Fixed",
      subcategory_id: "s1",
      subcategory_name: "Rent",
      month_key: "2026-02-01",
      amount: 40,
      entry_direction: "spending"
    }),
    row({
      category_id: "c2",
      category_name: "Income",
      subcategory_id: "s2",
      subcategory_name: "Top Up",
      month_key: "2026-01-01",
      amount: 250,
      entry_direction: "profit"
    })
  ];

  it("aggregates amounts by category/sub-category and month", () => {
    const outflow = rows.filter((item) => item.entry_direction === "spending");
    const pivot = buildSpendingPivot(outflow, monthColumns);
    expect(pivot.pivotRows).toHaveLength(1);
    expect(pivot.pivotRows[0].byMonth["2026-01-01"]).toBe(100);
    expect(pivot.pivotRows[0].byMonth["2026-02-01"]).toBe(40);
    expect(pivot.pivotRows[0].subtotal).toBe(140);
    expect(pivot.monthGrandTotals["2026-01-01"]).toBe(100);
    expect(pivot.monthGrandTotals["2026-02-01"]).toBe(40);
  });

  it("partitions rows into outflow and inflow", () => {
    const { outflowRows, inflowRows } = partitionSpendingRowsByDirection(rows);
    expect(outflowRows).toHaveLength(2);
    expect(inflowRows).toHaveLength(1);
    expect(inflowRows[0].amount).toBe(250);
  });

  it("builds net as inflow minus outflow per month", () => {
    const { outflowRows, inflowRows } = partitionSpendingRowsByDirection(rows);
    const outflowPivot = buildSpendingPivot(outflowRows, monthColumns);
    const inflowPivot = buildSpendingPivot(inflowRows, monthColumns);
    const net = buildSpendingNetByMonth(
      inflowPivot.monthGrandTotals,
      outflowPivot.monthGrandTotals,
      monthColumns
    );
    expect(net["2026-01-01"]).toBe(150);
    expect(net["2026-02-01"]).toBe(-40);
  });
});
