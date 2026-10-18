import type { BigBookCreditStatus } from "@/lib/types";

export function computeBigBookCreditStatus(
  creditSettledAt: string | null
): BigBookCreditStatus {
  return creditSettledAt ? "settled" : "open";
}

export function roundSettlementAmount(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/**
 * Settlement conversion convention (matches Record Settlement / entries API):
 *   conversion_rate = credit_currency units per 1 settlement_currency unit
 *   e.g. settle MYR credit in USDT at "1 USDT = 4.20 MYR" → rate = 4.20
 *
 * credit_equiv = settlement_amount * conversion_rate
 */
export function computeSettlementAmountInCreditCurrency(
  amount: number,
  conversionRate: number
): number {
  return roundSettlementAmount(amount * conversionRate);
}

/**
 * Inverse of {@link computeSettlementAmountInCreditCurrency}:
 *   settlement_amount = credit_amount / conversion_rate
 * Used when admin enters the day's USDT rate and we populate Amount in USDT.
 */
export function computeSettlementAmountFromCredit(
  creditAmount: number,
  conversionRate: number
): number {
  if (!(conversionRate > 0)) return 0;
  return roundSettlementAmount(creditAmount / conversionRate);
}

/**
 * USDT settle with optional PROFIT surcharge:
 *   A = (base + profit) / rate
 * where rate = credit-currency units per 1 USDT.
 */
export function computeUsdtSettleAmountWithProfit(
  baseCreditAmount: number,
  profitAmount: number,
  conversionRate: number
): number {
  const profit = Number.isFinite(profitAmount) && profitAmount > 0 ? profitAmount : 0;
  return computeSettlementAmountFromCredit(baseCreditAmount + profit, conversionRate);
}

/**
 * PROFIT surcharge from cash received, both amounts in the credit currency:
 *   profit = amountReceived − creditTotal
 * Zero or negative results mean there is no PROFIT companion.
 */
export function computeProfitFromAmountReceived(
  amountReceived: number,
  creditTotal: number
): number {
  if (!Number.isFinite(amountReceived) || !Number.isFinite(creditTotal)) return 0;
  const profit = roundSettlementAmount(amountReceived - creditTotal);
  return profit > 0 ? profit : 0;
}
