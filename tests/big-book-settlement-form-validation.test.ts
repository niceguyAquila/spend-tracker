import { describe, expect, it } from "vitest";
import {
  describeSettlementMissingFields,
  parsePositiveConversionRate,
  settlementNeedsConversionRate
} from "@/lib/big-book/entry-form-validation";

describe("settlementNeedsConversionRate", () => {
  it("is never required (FX / credit-currency amount are optional)", () => {
    expect(settlementNeedsConversionRate("MYR", "MYR")).toBe(false);
    expect(settlementNeedsConversionRate("USDT", "USDT")).toBe(false);
    expect(settlementNeedsConversionRate("USDT", "MYR")).toBe(false);
    expect(settlementNeedsConversionRate("IDR", "USDT")).toBe(false);
    expect(settlementNeedsConversionRate("MYR", "IDR")).toBe(false);
    expect(settlementNeedsConversionRate("USDT", null)).toBe(false);
  });
});

describe("parsePositiveConversionRate", () => {
  it("parses positive rates and rejects empties / non-positive", () => {
    expect(parsePositiveConversionRate("4.2")).toBe(4.2);
    expect(parsePositiveConversionRate(4.2)).toBe(4.2);
    expect(parsePositiveConversionRate("")).toBeNull();
    expect(parsePositiveConversionRate(null)).toBeNull();
    expect(parsePositiveConversionRate(0)).toBeNull();
    expect(parsePositiveConversionRate("-1")).toBeNull();
  });
});

describe("describeSettlementMissingFields", () => {
  const usdtBase = {
    explanation: "Settlement for: Vendor invoice",
    amount: "100",
    currencyCode: "USDT",
    creditCurrencyCode: "MYR",
    settlementConversionRate: ""
  };

  it("allows MYR credit settled in USDT without rate or credit-currency amount", () => {
    expect(describeSettlementMissingFields(usdtBase)).toBeNull();
  });

  it("allows any cross-currency settle without a conversion rate", () => {
    expect(
      describeSettlementMissingFields({
        explanation: "Settlement for: Vendor invoice",
        amount: "100",
        currencyCode: "IDR",
        creditCurrencyCode: "MYR",
        settlementConversionRate: ""
      })
    ).toBeNull();
  });

  it("still requires explanation and settle amount", () => {
    expect(
      describeSettlementMissingFields({
        ...usdtBase,
        explanation: "",
        amount: ""
      })
    ).toBe("Add an explanation and amount to save.");
  });

  it("does not require a typed rate for same-currency settlements", () => {
    expect(
      describeSettlementMissingFields({
        ...usdtBase,
        currencyCode: "MYR",
        creditCurrencyCode: "MYR",
        settlementConversionRate: ""
      })
    ).toBeNull();
  });
});
