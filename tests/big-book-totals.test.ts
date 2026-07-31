import { describe, expect, it } from "vitest";
import { summarizeCurrencies } from "@/lib/big-book/totals";

type Entry = Parameters<typeof summarizeCurrencies>[0][number];

function entry(
  amount: number,
  currency_code: Entry["currency_code"],
  entry_direction: Entry["entry_direction"]
): Entry {
  return { amount, currency_code, entry_direction };
}

describe("summarizeCurrencies", () => {
  it("returns nothing for an empty ledger", () => {
    expect(summarizeCurrencies([])).toEqual([]);
  });

  it("splits out and in per currency and nets them", () => {
    const totals = summarizeCurrencies([
      entry(100, "IDR", "spending"),
      entry(250, "IDR", "profit"),
      entry(25, "IDR", "spending"),
      entry(10, "USDT", "profit")
    ]);

    expect(totals).toEqual([
      { currency: "IDR", spending: 125, profit: 250, net: 125 },
      { currency: "USDT", spending: 0, profit: 10, net: 10 }
    ]);
  });

  it("keeps currencies separate and never sums across them", () => {
    const totals = summarizeCurrencies([
      entry(5, "MYR", "spending"),
      entry(5, "TRX", "spending")
    ]);

    expect(totals.map((total) => total.currency)).toEqual(["MYR", "TRX"]);
    expect(totals.every((total) => total.spending === 5)).toBe(true);
  });

  it("reports a negative net when spending exceeds income", () => {
    const totals = summarizeCurrencies([entry(900, "IDR", "spending"), entry(100, "IDR", "profit")]);
    expect(totals[0]).toMatchObject({ spending: 900, profit: 100, net: -800 });
  });

  it("orders currencies consistently regardless of input order", () => {
    const totals = summarizeCurrencies([
      entry(1, "TRX", "profit"),
      entry(1, "IDR", "profit"),
      entry(1, "USDT", "profit"),
      entry(1, "MYR", "profit")
    ]);

    expect(totals.map((total) => total.currency)).toEqual(["IDR", "MYR", "USDT", "TRX"]);
  });

  it("omits currencies that have no entries", () => {
    const totals = summarizeCurrencies([entry(1, "USDT", "profit")]);
    expect(totals).toHaveLength(1);
    expect(totals[0].currency).toBe("USDT");
  });

  it("rounds away floating point drift from repeated addition", () => {
    const totals = summarizeCurrencies([
      entry(0.1, "USDT", "spending"),
      entry(0.2, "USDT", "spending")
    ]);

    expect(totals[0].spending).toBe(0.3);
    expect(totals[0].net).toBe(-0.3);
  });

  it("ignores non-finite amounts instead of poisoning the total", () => {
    const totals = summarizeCurrencies([
      entry(50, "IDR", "spending"),
      entry(Number.NaN, "IDR", "spending")
    ]);

    expect(totals[0].spending).toBe(50);
  });
});
