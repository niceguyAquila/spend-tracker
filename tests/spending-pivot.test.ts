import { describe, expect, it } from "vitest";
import type { DashboardReportRow } from "@/lib/types";
import {
  buildSpendingNetByMonth,
  buildSpendingPivot,
  partitionSpendingRowsByCurrency,
  partitionSpendingRowsByDirection
} from "@/lib/spending/pivot";

function row(
  partial: Pick<DashboardReportRow, "category_id" | "month_key" | "amount" | "entry_direction"> &
    Partial<DashboardReportRow>
): DashboardReportRow {
  return {
    category_name: partial.category_name ?? "Cat",
    currency_code: partial.currency_code ?? "IDR",
    ...partial
  };
}

describe("buildSpendingPivot", () => {
  it("aggregates amounts by category and month", () => {
    const rows = [
      row({
        category_id: "c1",
        category_name: "Ads",
        month_key: "2026-04-01",
        amount: 100,
        entry_direction: "spending"
      }),
      row({
        category_id: "c1",
        category_name: "Ads",
        month_key: "2026-04-01",
        amount: 50,
        entry_direction: "spending"
      }),
      row({
        category_id: "c2",
        category_name: "Ops",
        month_key: "2026-05-01",
        amount: 25,
        entry_direction: "spending"
      })
    ];

    const result = buildSpendingPivot(rows, ["2026-04-01", "2026-05-01"]);
    expect(result.pivotRows).toHaveLength(2);
    expect(result.pivotRows[0]?.categoryName).toBe("Ads");
    expect(result.pivotRows[0]?.byMonth["2026-04-01"]).toBe(150);
    expect(result.monthGrandTotals["2026-04-01"]).toBe(150);
    expect(result.monthGrandTotals["2026-05-01"]).toBe(25);
  });
});

describe("partitionSpendingRowsByDirection", () => {
  it("splits profit into inflow and everything else into outflow", () => {
    const rows = [
      row({
        category_id: "c1",
        month_key: "2026-04-01",
        amount: 10,
        entry_direction: "spending"
      }),
      row({
        category_id: "c1",
        month_key: "2026-04-01",
        amount: 5,
        entry_direction: "profit"
      })
    ];
    const { outflowRows, inflowRows } = partitionSpendingRowsByDirection(rows);
    expect(outflowRows).toHaveLength(1);
    expect(inflowRows).toHaveLength(1);
  });
});

describe("partitionSpendingRowsByCurrency", () => {
  it("returns one block per currency in stable order and omits empty ones", () => {
    const rows = [
      row({
        category_id: "c1",
        month_key: "2026-04-01",
        amount: 10,
        entry_direction: "spending",
        currency_code: "USDT"
      }),
      row({
        category_id: "c1",
        month_key: "2026-04-01",
        amount: 5,
        entry_direction: "profit",
        currency_code: "IDR"
      })
    ];
    const blocks = partitionSpendingRowsByCurrency(rows);
    expect(blocks.map((block) => block.currency)).toEqual(["IDR", "USDT"]);
    expect(blocks[0]?.rows).toHaveLength(1);
    expect(blocks[1]?.rows).toHaveLength(1);
  });
});

describe("buildSpendingNetByMonth", () => {
  it("computes inflow minus outflow per month", () => {
    expect(
      buildSpendingNetByMonth({ "2026-04-01": 100 }, { "2026-04-01": 40 }, ["2026-04-01"])
    ).toEqual({ "2026-04-01": 60 });
  });
});
