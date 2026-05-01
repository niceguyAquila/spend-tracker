import { describe, expect, it } from "vitest";
import {
  buildIndividualTypeMonthlySummary,
  filterIndividualTypeEntries,
  shouldShowTypeSelector
} from "@/lib/big-book-individual-type-ledger";
import type { BigBookEntry } from "@/lib/types";

const baseEntry: BigBookEntry = {
  id: "entry-1",
  entry_date: "2026-01-01",
  entry_direction: "spending",
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
  type_name: "Operations",
  type_code: "OPS",
  sub_type_name: null,
  sub_type_code: null,
  actor_code: "A",
  actor_display_name: "Actor A",
  creator_display_name: "-",
  updater_display_name: "-",
  attachments: []
};

describe("individual type ledger utils", () => {
  it("requires selector when type is not chosen", () => {
    expect(shouldShowTypeSelector("")).toBe(true);
    expect(shouldShowTypeSelector("type-1")).toBe(false);
  });

  it("filters entries by date range, currency, and direction", () => {
    const rows: BigBookEntry[] = [
      { ...baseEntry, id: "a", entry_date: "2026-01-10", currency_code: "IDR", entry_direction: "spending" },
      { ...baseEntry, id: "b", entry_date: "2026-02-10", currency_code: "USDT", entry_direction: "profit" },
      { ...baseEntry, id: "c", entry_date: "2026-03-10", currency_code: "MYR", entry_direction: "spending" }
    ];
    const filtered = filterIndividualTypeEntries(rows, {
      dateFrom: "2026-02-01",
      dateTo: "2026-02-28",
      currencyCode: ["USDT"],
      direction: ["profit"]
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("b");
  });

  it("supports multi-select currency and direction filters", () => {
    const rows: BigBookEntry[] = [
      { ...baseEntry, id: "a", currency_code: "IDR", entry_direction: "spending" },
      { ...baseEntry, id: "b", currency_code: "USDT", entry_direction: "profit" },
      { ...baseEntry, id: "c", currency_code: "MYR", entry_direction: "spending" }
    ];
    const filtered = filterIndividualTypeEntries(rows, {
      currencyCode: ["USDT", "MYR"],
      direction: ["profit", "spending"]
    });
    expect(filtered.map((row) => row.id)).toEqual(["b", "c"]);
  });

  it("builds monthly summary with signed amounts and TRX skipped", () => {
    const rows: BigBookEntry[] = [
      { ...baseEntry, id: "jan-spend", entry_date: "2026-01-05", currency_code: "IDR", entry_direction: "spending", amount: 200 },
      { ...baseEntry, id: "jan-profit", entry_date: "2026-01-12", currency_code: "IDR", entry_direction: "profit", amount: 50 },
      { ...baseEntry, id: "feb-myr", entry_date: "2026-02-10", currency_code: "MYR", entry_direction: "profit", amount: 88 },
      { ...baseEntry, id: "feb-trx", entry_date: "2026-02-11", currency_code: "TRX", entry_direction: "profit", amount: 1000 },
      { ...baseEntry, id: "other-year", entry_date: "2025-01-01", currency_code: "USDT", entry_direction: "profit", amount: 99 }
    ];

    const summary = buildIndividualTypeMonthlySummary(rows, 2026);
    expect(summary).toHaveLength(12);
    expect(summary[0].totals.IDR).toBe(-150);
    expect(summary[1].totals.MYR).toBe(88);
    expect(summary[1].totals.USDT).toBe(0);
  });
});
