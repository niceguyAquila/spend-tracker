import { describe, expect, it } from "vitest";
import {
  buildCreditIndividualTypeMonthlySummary,
  filterCreditIndividualTypeEntries,
  shouldShowTypeSelector
} from "@/lib/credit-big-book-individual-type-ledger";
import type { CreditBookEntry } from "@/lib/types";

const baseEntry: CreditBookEntry = {
  id: "entry-1",
  entry_date: "2026-01-01",
  entry_direction: "debt",
  entry_type_id: "type-1",
  entry_sub_type_id: null,
  explanation: "Sample",
  amount: 100,
  currency_code: "IDR",
  remark: null,
  responsible_actor_id: "actor-1",
  created_by: null,
  updated_by: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  type_name: "Payable",
  type_code: "PAY",
  sub_type_name: null,
  sub_type_code: null,
  actor_code: "A",
  actor_display_name: "Actor A",
  creator_display_name: "-",
  updater_display_name: "-",
  attachments: []
};

describe("credit individual type ledger utils", () => {
  it("requires selector when type is not chosen", () => {
    expect(shouldShowTypeSelector("")).toBe(true);
    expect(shouldShowTypeSelector("type-1")).toBe(false);
  });

  it("filters entries by date range, currency, and direction", () => {
    const rows: CreditBookEntry[] = [
      { ...baseEntry, id: "a", entry_date: "2026-01-10", currency_code: "IDR", entry_direction: "debt" },
      { ...baseEntry, id: "b", entry_date: "2026-02-10", currency_code: "USDT", entry_direction: "credit" },
      { ...baseEntry, id: "c", entry_date: "2026-03-10", currency_code: "MYR", entry_direction: "debt" }
    ];
    const filtered = filterCreditIndividualTypeEntries(rows, {
      dateFrom: "2026-02-01",
      dateTo: "2026-02-28",
      currencyCode: ["USDT"],
      direction: ["credit"]
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("b");
  });

  it("supports multi-select currency and direction filters", () => {
    const rows: CreditBookEntry[] = [
      { ...baseEntry, id: "a", currency_code: "IDR", entry_direction: "debt" },
      { ...baseEntry, id: "b", currency_code: "USDT", entry_direction: "credit" },
      { ...baseEntry, id: "c", currency_code: "MYR", entry_direction: "debt" }
    ];
    const filtered = filterCreditIndividualTypeEntries(rows, {
      currencyCode: ["USDT", "MYR"],
      direction: ["credit", "debt"]
    });
    expect(filtered.map((row) => row.id)).toEqual(["b", "c"]);
  });

  it("builds monthly summary with signed amounts (debt negative, credit positive) and TRX skipped", () => {
    const rows: CreditBookEntry[] = [
      { ...baseEntry, id: "jan-debt", entry_date: "2026-01-05", currency_code: "IDR", entry_direction: "debt", amount: 200 },
      { ...baseEntry, id: "jan-credit", entry_date: "2026-01-12", currency_code: "IDR", entry_direction: "credit", amount: 50 },
      { ...baseEntry, id: "feb-myr", entry_date: "2026-02-10", currency_code: "MYR", entry_direction: "credit", amount: 88 },
      { ...baseEntry, id: "feb-trx", entry_date: "2026-02-11", currency_code: "TRX", entry_direction: "credit", amount: 1000 },
      { ...baseEntry, id: "other-year", entry_date: "2025-01-01", currency_code: "USDT", entry_direction: "credit", amount: 99 }
    ];

    const summary = buildCreditIndividualTypeMonthlySummary(rows, 2026);
    expect(summary).toHaveLength(12);
    expect(summary[0].totals.IDR).toBe(-150);
    expect(summary[1].totals.MYR).toBe(88);
    expect(summary[1].totals.USDT).toBe(0);
  });
});
