import { describe, expect, it } from "vitest";
import {
  summarizeCurrencies,
  summarizeGroupCurrencies,
  summarizeSettlementProfitOverview
} from "@/lib/big-book/totals";

type Entry = Parameters<typeof summarizeCurrencies>[0][number];
type GroupEntry = Parameters<typeof summarizeGroupCurrencies>[0][number];
type OverviewEntry = Parameters<typeof summarizeSettlementProfitOverview>[0][number];

function entry(
  amount: number,
  currency_code: Entry["currency_code"],
  entry_direction: Entry["entry_direction"]
): Entry {
  return { amount, currency_code, entry_direction };
}

function groupEntry(
  amount: number,
  currency_code: GroupEntry["currency_code"],
  entry_direction: GroupEntry["entry_direction"],
  flags: {
    is_credit?: boolean;
    is_future_credit?: boolean;
    is_debt?: boolean;
    settles_entry_id?: string | null;
  } = {}
): GroupEntry {
  return { amount, currency_code, entry_direction, ...flags };
}

function overviewEntry(
  amount: number,
  currency_code: OverviewEntry["currency_code"],
  entry_direction: OverviewEntry["entry_direction"],
  flags: {
    type_name?: string | null;
    is_credit?: boolean;
    is_future_credit?: boolean;
    is_debt?: boolean;
    settles_entry_id?: string | null;
  } = {}
): OverviewEntry {
  return { amount, currency_code, entry_direction, ...flags };
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

describe("summarizeGroupCurrencies", () => {
  it("sums all members for ordinary groups", () => {
    const totals = summarizeGroupCurrencies([
      groupEntry(100, "MYR", "profit"),
      groupEntry(25, "MYR", "spending")
    ]);
    expect(totals).toEqual([{ currency: "MYR", spending: 25, profit: 100, net: 75 }]);
  });

  it("counts only settlement rows for Future Credit + settlement groups", () => {
    const totals = summarizeGroupCurrencies([
      groupEntry(50_000, "MYR", "profit", { is_future_credit: true }),
      groupEntry(50_000, "MYR", "profit", { settles_entry_id: "future-1" })
    ]);
    expect(totals).toEqual([{ currency: "MYR", spending: 0, profit: 50_000, net: 50_000 }]);
  });

  it("uses settlement currency only when Future Credit currency differs", () => {
    const totals = summarizeGroupCurrencies([
      groupEntry(50_000, "MYR", "profit", { is_future_credit: true }),
      groupEntry(95, "USDT", "profit", { settles_entry_id: "future-1" })
    ]);
    expect(totals).toEqual([{ currency: "USDT", spending: 0, profit: 95, net: 95 }]);
  });

  it("still sums Future Credit-only groups without settlements", () => {
    const totals = summarizeGroupCurrencies([
      groupEntry(50_000, "MYR", "profit", { is_future_credit: true }),
      groupEntry(10_000, "MYR", "profit", { is_future_credit: true })
    ]);
    expect(totals).toEqual([{ currency: "MYR", spending: 0, profit: 60_000, net: 60_000 }]);
  });

  it("counts only settlement rows for debt + settlement groups", () => {
    const totals = summarizeGroupCurrencies([
      groupEntry(100_000, "IDR", "spending", { is_debt: true }),
      groupEntry(120_000, "IDR", "spending", { is_debt: true }),
      groupEntry(169_024.5, "IDR", "spending", { is_debt: true }),
      groupEntry(389_024.5, "IDR", "spending", { settles_entry_id: "debt-1" })
    ]);
    expect(totals).toEqual([
      { currency: "IDR", spending: 389_024.5, profit: 0, net: -389_024.5 }
    ]);
  });

  it("still sums open debt groups without settlements", () => {
    const totals = summarizeGroupCurrencies([
      groupEntry(100_000, "IDR", "spending", { is_debt: true }),
      groupEntry(50_000, "IDR", "spending", { is_debt: true })
    ]);
    expect(totals).toEqual([
      { currency: "IDR", spending: 150_000, profit: 0, net: -150_000 }
    ]);
  });

  it("uses settlement currency only when debt currency differs", () => {
    const totals = summarizeGroupCurrencies([
      groupEntry(50_000, "MYR", "spending", { is_debt: true }),
      groupEntry(95, "USDT", "spending", { settles_entry_id: "debt-1" })
    ]);
    expect(totals).toEqual([{ currency: "USDT", spending: 95, profit: 0, net: -95 }]);
  });
});

describe("summarizeSettlementProfitOverview", () => {
  it("returns null unless the group has both a settlement and a PROFIT companion", () => {
    expect(
      summarizeSettlementProfitOverview([
        overviewEntry(1_000, "MYR", "spending", { is_credit: true, type_name: "Sales" }),
        overviewEntry(1_000, "MYR", "profit", { settles_entry_id: "credit-1", type_name: "Sales" })
      ])
    ).toBeNull();
    expect(
      summarizeSettlementProfitOverview([
        overviewEntry(50, "MYR", "profit", { type_name: "PROFIT" })
      ])
    ).toBeNull();
    expect(summarizeSettlementProfitOverview([])).toBeNull();
  });

  it("lists profit and settle separately and leaves the original credit out", () => {
    const lines = summarizeSettlementProfitOverview([
      overviewEntry(1_000, "MYR", "spending", { is_credit: true, type_name: "Sales" }),
      overviewEntry(1_000, "MYR", "profit", { settles_entry_id: "credit-1", type_name: "Sales" }),
      overviewEntry(50, "MYR", "profit", { type_name: "PROFIT" })
    ]);

    expect(lines).toEqual([
      { kind: "profit", currency: "MYR", amount: 50 },
      { kind: "settle", currency: "MYR", amount: 1_000 },
      { kind: "total", currency: "MYR", amount: 1_050 }
    ]);
  });

  it("keeps a USDT settlement and a credit-currency profit on separate lines", () => {
    const lines = summarizeSettlementProfitOverview([
      overviewEntry(420, "MYR", "profit", { is_future_credit: true, type_name: "Sales" }),
      overviewEntry(110, "USDT", "profit", { settles_entry_id: "future-1", type_name: "Sales" }),
      overviewEntry(42, "MYR", "profit", { type_name: "profit" }),
      overviewEntry(1.1, "USDT", "spending", { type_name: "KURS" })
    ]);

    expect(lines).toEqual([
      { kind: "profit", currency: "MYR", amount: 42 },
      { kind: "settle", currency: "USDT", amount: 110 },
      { kind: "total", currency: "MYR", amount: 42 },
      { kind: "total", currency: "USDT", amount: 110 }
    ]);
  });

  it("sums every settlement in the group into one settle line", () => {
    const lines = summarizeSettlementProfitOverview([
      overviewEntry(100, "IDR", "spending", { is_credit: true, type_name: "Sales" }),
      overviewEntry(50, "IDR", "spending", { is_credit: true, type_name: "Sales" }),
      overviewEntry(100, "IDR", "profit", { settles_entry_id: "credit-a", type_name: "Sales" }),
      overviewEntry(50, "IDR", "profit", { settles_entry_id: "credit-b", type_name: "Sales" }),
      overviewEntry(15, "IDR", "profit", { type_name: "PROFIT" })
    ]);

    expect(lines).toEqual([
      { kind: "profit", currency: "IDR", amount: 15 },
      { kind: "settle", currency: "IDR", amount: 150 },
      { kind: "total", currency: "IDR", amount: 165 }
    ]);
  });
});
