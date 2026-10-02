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

  it("is false for USDT settlements even when credit currency differs", () => {
    expect(settlementNeedsConversionRate("USDT", "MYR")).toBe(false);
    expect(settlementNeedsConversionRate("USDT", "IDR")).toBe(false);
  });

  it("is true for non-USDT settle when currency differs from credit", () => {
    expect(settlementNeedsConversionRate("IDR", "USDT")).toBe(true);
    expect(settlementNeedsConversionRate("MYR", "IDR")).toBe(true);
  });

  it("is false when credit currency is missing", () => {
    expect(settlementNeedsConversionRate("USDT", null)).toBe(false);
    expect(settlementNeedsConversionRate("IDR", undefined)).toBe(false);
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
    settlementConversionRate: "4.2"
  };

  it("allows a complete USDT cross-currency settlement with a rate", () => {
    expect(describeSettlementMissingFields(usdtBase)).toBeNull();
  });

  it("allows USDT settle without a conversion rate", () => {
    expect(
      describeSettlementMissingFields({
        ...usdtBase,
        settlementConversionRate: ""
      })
    ).toBeNull();
  });

  it("still requires explanation/amount for USDT settle without a rate", () => {
    expect(
      describeSettlementMissingFields({
        ...usdtBase,
        explanation: "",
        amount: "",
        settlementConversionRate: ""
      })
    ).toBe("Add an explanation and amount to save.");
  });

  it("blocks non-USDT cross-currency submit when conversion rate is missing", () => {
    expect(
      describeSettlementMissingFields({
        explanation: "Settlement for: Vendor invoice",
        amount: "100",
        currencyCode: "IDR",
        creditCurrencyCode: "MYR",
        settlementConversionRate: ""
      })
    ).toBe("Enter a conversion rate greater than 0 to save.");
  });

  it("prefers conversion-rate hint for non-USDT when rate and other fields are missing", () => {
    expect(
      describeSettlementMissingFields({
        explanation: "",
        amount: "",
        currencyCode: "IDR",
        creditCurrencyCode: "MYR",
        settlementConversionRate: ""
      })
    ).toBe("Enter a conversion rate greater than 0 to save.");
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

  it("still requires explanation/amount for same-currency", () => {
    expect(
      describeSettlementMissingFields({
        ...usdtBase,
        currencyCode: "MYR",
        creditCurrencyCode: "MYR",
        settlementConversionRate: "1",
        explanation: "",
        amount: ""
      })
    ).toBe("Add an explanation and amount to save.");
  });
});
