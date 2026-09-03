import { describe, expect, it } from "vitest";
import {
  BIG_BOOK_GROUP_ENTRY_MAX,
  buildGasFeeEntry,
  buildGasFeeExplanation,
  buildGasFeeGroupLabel,
  expandGroupPayloadsWithGasFees,
  parseOptionalGasFeeAmount,
  willCreateGasFeeEntry
} from "@/lib/big-book/gas-fee-entry";

const main = {
  entry_date: "2026-09-03",
  entry_direction: "profit" as const,
  entry_type_id: "11111111-1111-4111-8111-111111111111",
  entry_sub_type_id: "44444444-4444-4444-8444-444444444444",
  vendor_type_id: "66666666-6666-4666-8666-666666666666",
  vendor_id: "77777777-7777-4777-8777-777777777777",
  pocket_id: null as string | null,
  action_by_id: "99999999-9999-4999-8999-999999999999",
  explanation: "Vendor payout",
  amount: 250,
  currency_code: "USDT" as "IDR" | "MYR" | "USDT" | "TRX",
  remark: "keep on main only",
  responsible_actor_id: "22222222-2222-4222-8222-222222222222"
};

describe("parseOptionalGasFeeAmount", () => {
  it("skips empty, invalid, and non-positive values", () => {
    expect(parseOptionalGasFeeAmount("")).toBeNull();
    expect(parseOptionalGasFeeAmount(null)).toBeNull();
    expect(parseOptionalGasFeeAmount(undefined)).toBeNull();
    expect(parseOptionalGasFeeAmount("abc")).toBeNull();
    expect(parseOptionalGasFeeAmount(0)).toBeNull();
    expect(parseOptionalGasFeeAmount(-1)).toBeNull();
  });

  it("parses formatted positive amounts", () => {
    expect(parseOptionalGasFeeAmount("1.33")).toBe(1.33);
    expect(parseOptionalGasFeeAmount("1,234.5")).toBe(1234.5);
    expect(parseOptionalGasFeeAmount(2)).toBe(2);
  });
});

describe("willCreateGasFeeEntry", () => {
  it("is true only for USDT with a positive gas amount", () => {
    expect(willCreateGasFeeEntry("USDT", "1.33")).toBe(true);
    expect(willCreateGasFeeEntry("USDT", "")).toBe(false);
    expect(willCreateGasFeeEntry("IDR", "1.33")).toBe(false);
    expect(willCreateGasFeeEntry("TRX", "1.33")).toBe(false);
  });
});

describe("buildGasFeeEntry", () => {
  it("copies classification fields and forces TRX spending with no pocket or credit", () => {
    expect(buildGasFeeEntry(main, 1.33)).toEqual({
      entry_date: "2026-09-03",
      entry_direction: "spending",
      entry_type_id: main.entry_type_id,
      entry_sub_type_id: main.entry_sub_type_id,
      vendor_type_id: main.vendor_type_id,
      vendor_id: main.vendor_id,
      pocket_id: null,
      action_by_id: main.action_by_id,
      explanation: "Gas fee — Vendor payout",
      amount: 1.33,
      currency_code: "TRX",
      remark: "",
      responsible_actor_id: main.responsible_actor_id
    });
  });

  it("truncates a long explanation and group label", () => {
    const long = "x".repeat(600);
    expect(buildGasFeeExplanation(long).length).toBe(500);
    expect(buildGasFeeGroupLabel(long).length).toBe(200);
  });
});

describe("expandGroupPayloadsWithGasFees", () => {
  it("appends a TRX companion only for USDT rows with gas", () => {
    const idr = { ...main, currency_code: "IDR" as const, amount: 100, explanation: "Cash" };
    const expanded = expandGroupPayloadsWithGasFees([
      { entry: main, gasFeeAmount: "1.33" },
      { entry: idr, gasFeeAmount: "9" },
      { entry: { ...main, explanation: "No gas" }, gasFeeAmount: "" }
    ]);
    expect(expanded).toHaveLength(4);
    expect(expanded.map((row) => row.currency_code)).toEqual(["USDT", "TRX", "IDR", "USDT"]);
    expect(expanded[1]).toMatchObject({ currency_code: "TRX", amount: 1.33, entry_direction: "spending" });
  });

  it("stays within the group entry cap constant", () => {
    expect(BIG_BOOK_GROUP_ENTRY_MAX).toBe(50);
  });
});
