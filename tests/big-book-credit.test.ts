import { describe, expect, it } from "vitest";
import {
  computeBigBookCreditStatus,
  computeProfitFromAmountReceived,
  computeSettlementAmountFromCredit,
  computeSettlementAmountInCreditCurrency
} from "@/lib/big-book/credit";

describe("big book credit helpers", () => {
  it("derives status from credit_settled_at", () => {
    expect(computeBigBookCreditStatus(null)).toBe("open");
    expect(computeBigBookCreditStatus("")).toBe("open");
    expect(computeBigBookCreditStatus("2026-08-01T00:00:00Z")).toBe("settled");
  });

  it("rounds settlement amount in credit currency to 4dp", () => {
    // credit_equiv = settlement_amount * rate
    expect(computeSettlementAmountInCreditCurrency(9000000, 0.000066)).toBe(594);
    expect(computeSettlementAmountInCreditCurrency(100, 1)).toBe(100);
    expect(computeSettlementAmountInCreditCurrency(150, 4.2)).toBe(630);
  });

  it("computes USDT settlement amount as credit_amount / rate", () => {
    // 630 MYR at 1 USDT = 4.2 MYR → 150 USDT
    expect(computeSettlementAmountFromCredit(630, 4.2)).toBe(150);
    expect(computeSettlementAmountFromCredit(100, 1)).toBe(100);
    expect(computeSettlementAmountFromCredit(100, 0)).toBe(0);
  });

  it("computes PROFIT as amount received minus the credit total", () => {
    expect(computeProfitFromAmountReceived(1150, 1000)).toBe(150);
    expect(computeProfitFromAmountReceived(1000.12349, 1000)).toBe(0.1235);
    expect(computeProfitFromAmountReceived(1000, 1000)).toBe(0);
    expect(computeProfitFromAmountReceived(900, 1000)).toBe(0);
    expect(computeProfitFromAmountReceived(Number.NaN, 1000)).toBe(0);
  });
});

