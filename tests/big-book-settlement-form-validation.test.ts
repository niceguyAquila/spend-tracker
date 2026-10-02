import { describe, expect, it } from "vitest";
import {
  describeSettlementMissingFields,
  parsePositiveConversionRate,
  settlementNeedsConversionRate
} from "@/lib/big-book/entry-form-validation";

describe("settlementNeedsConversionRate", () => {
  it("is false for same-currency settlements", () => {
    expect(settlementNeedsConversionRate("MYR", "MYR")).toBe(false);
    expect(settlementNeedsConversionRate("USDT", "USDT")).toBe(false);
  });

  it("is true when settle currency differs from credit currency", () => {
    expect(settlementNeedsConversionRate("USDT", "MYR")).toBe(true);
    expect(settlementNeedsConversionRate("IDR", "USDT")).toBe(true);
  });

  it("is false when credit currency is missing", () => {
    expect(settlementNeedsConversionRate("USDT", null)).toBe(false);
    expect(settlementNeedsConversionRate("USDT", undefined)).toBe(false);
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
  const base = {
    explanation: "Settlement for: Vendor invoice",
    amount: "100",
    currencyCode: "USDT",
    creditCurrencyCode: "MYR",
    settlementConversionRate: "4.2"
  };

  it("allows a complete cross-currency settlement", () => {
    expect(describeSettlementMissingFields(base)).toBeNull();
  });

  it("blocks cross-currency submit when conversion rate is missing", () => {
    expect(
      describeSettlementMissingFields({
        ...base,
        settlementConversionRate: ""
      })
    ).toBe("Enter a conversion rate greater than 0 to save.");
  });

  it("prefers conversion-rate hint over amount/explanation when rate is missing", () => {
    expect(
      describeSettlementMissingFields({
        ...base,
        explanation: "",
        amount: "",
        settlementConversionRate: ""
      })
    ).toBe("Enter a conversion rate greater than 0 to save.");
  });

  it("does not require a typed rate for same-currency settlements", () => {
    expect(
      describeSettlementMissingFields({
        ...base,
        currencyCode: "MYR",
        creditCurrencyCode: "MYR",
        settlementConversionRate: ""
      })
    ).toBeNull();
  });

  it("still requires explanation/amount for same-currency", () => {
    expect(
      describeSettlementMissingFields({
        ...base,
        currencyCode: "MYR",
        creditCurrencyCode: "MYR",
        settlementConversionRate: "1",
        explanation: "",
        amount: ""
      })
    ).toBe("Add an explanation and amount to save.");
  });
});
