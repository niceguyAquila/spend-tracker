import { describe, expect, it } from "vitest";
import {
  buildProfitEntry,
  buildProfitExplanation,
  findProfitTypeId,
  parseOptionalProfitAmount,
  PROFIT_TYPE_MISSING_ERROR
} from "@/lib/big-book/profit-entry";
import { computeUsdtSettleAmountWithProfit } from "@/lib/big-book/credit";

describe("computeUsdtSettleAmountWithProfit", () => {
  it("computes (base + profit) / rate", () => {
    expect(computeUsdtSettleAmountWithProfit(420, 42, 4.2)).toBe(110);
    expect(computeUsdtSettleAmountWithProfit(630, 0, 4.2)).toBe(150);
    expect(computeUsdtSettleAmountWithProfit(100, 10, 0)).toBe(0);
  });
});

describe("parseOptionalProfitAmount", () => {
  it("parses formatted values and skips empties / non-positive", () => {
    expect(parseOptionalProfitAmount("")).toBeNull();
    expect(parseOptionalProfitAmount(0)).toBeNull();
    expect(parseOptionalProfitAmount("12.5")).toBe(12.5);
    expect(parseOptionalProfitAmount("1,234.5")).toBe(1234.5);
  });
});

describe("buildProfitEntry / findProfitTypeId", () => {
  it("builds a profit-direction companion with PROFIT type id", () => {
    expect(
      buildProfitEntry(
        {
          entry_date: "2026-10-01",
          vendor_type_id: "vt-1",
          vendor_id: "v-1",
          action_by_id: null,
          explanation: "Bulk settlement for 2 open credits",
          responsible_actor_id: "actor-1"
        },
        "profit-type-1",
        42,
        "MYR"
      )
    ).toEqual({
      entry_date: "2026-10-01",
      entry_direction: "profit",
      entry_type_id: "profit-type-1",
      vendor_type_id: "vt-1",
      vendor_id: "v-1",
      pocket_id: null,
      action_by_id: null,
      explanation: "PROFIT — Bulk settlement for 2 open credits",
      amount: 42,
      currency_code: "MYR",
      remark: "",
      responsible_actor_id: "actor-1"
    });
  });

  it("matches PROFIT type case-insensitively and prefers active", () => {
    expect(findProfitTypeId([])).toBeNull();
    expect(
      findProfitTypeId([
        { id: "inactive", name: "profit", is_active: false },
        { id: "active", name: "PROFIT", is_active: true }
      ])
    ).toBe("active");
    expect(findProfitTypeId([{ id: "only", name: "Profit", is_active: false }])).toBe("only");
  });

  it("truncates a long explanation and exposes missing-type copy", () => {
    expect(buildProfitExplanation("x".repeat(600)).length).toBe(500);
    expect(PROFIT_TYPE_MISSING_ERROR).toMatch(/PROFIT/);
  });
});
