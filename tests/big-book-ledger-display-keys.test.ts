import { describe, expect, it } from "vitest";
import {
  buildLedgerDisplayKeys,
  compareLedgerSortValues,
  type LedgerScanRow
} from "@/lib/big-book/ledger-display-keys";

function row(partial: Partial<LedgerScanRow> & Pick<LedgerScanRow, "id">): LedgerScanRow {
  return {
    group_id: null,
    entry_date: "2026-04-01",
    created_at: "2026-04-01T10:00:00.000Z",
    amount: 100,
    currency_code: "USDT",
    entry_direction: "spending",
    explanation: "example",
    entry_type_id: "type-a",
    ...partial
  };
}

describe("compareLedgerSortValues", () => {
  it("sorts numbers ascending and descending", () => {
    expect(compareLedgerSortValues(1, 2, "asc")).toBeLessThan(0);
    expect(compareLedgerSortValues(1, 2, "desc")).toBeGreaterThan(0);
  });

  it("keeps empty values last in both directions", () => {
    expect(compareLedgerSortValues(null, "alpha", "asc")).toBeGreaterThan(0);
    expect(compareLedgerSortValues(null, "alpha", "desc")).toBeGreaterThan(0);
    expect(compareLedgerSortValues("", 10, "asc")).toBeGreaterThan(0);
    expect(compareLedgerSortValues("", 10, "desc")).toBeGreaterThan(0);
  });
});

describe("buildLedgerDisplayKeys", () => {
  it("defaults to entry_date descending", () => {
    const keys = buildLedgerDisplayKeys([
      row({ id: "older", entry_date: "2026-03-01", created_at: "2026-03-01T10:00:00.000Z" }),
      row({ id: "newer", entry_date: "2026-04-01", created_at: "2026-04-01T10:00:00.000Z" })
    ]);
    expect(keys.map((key) => key.id)).toEqual(["newer", "older"]);
  });

  it("sorts amount ascending and descending", () => {
    const rows = [
      row({ id: "small", amount: 10, entry_date: "2026-04-01" }),
      row({ id: "large", amount: 500, entry_date: "2026-04-02" }),
      row({ id: "mid", amount: 50, entry_date: "2026-04-03" })
    ];
    expect(
      buildLedgerDisplayKeys(rows, { sortBy: "amount", sortDir: "asc" }).map((key) => key.id)
    ).toEqual(["small", "mid", "large"]);
    expect(
      buildLedgerDisplayKeys(rows, { sortBy: "amount", sortDir: "desc" }).map((key) => key.id)
    ).toEqual(["large", "mid", "small"]);
  });

  it("sorts text keys ascending with empty values last", () => {
    const lookups = {
      typeNameById: new Map([
        ["type-a", "Alpha"],
        ["type-b", "Beta"]
      ])
    };
    const keys = buildLedgerDisplayKeys(
      [
        row({ id: "b", entry_type_id: "type-b" }),
        row({ id: "empty", entry_type_id: null }),
        row({ id: "a", entry_type_id: "type-a" })
      ],
      { sortBy: "type_name", sortDir: "asc", lookups }
    );
    expect(keys.map((key) => key.id)).toEqual(["a", "b", "empty"]);
  });

  it("keeps a group as one key and picks the member value that sorts first", () => {
    const lookups = {
      typeNameById: new Map([
        ["type-z", "Zulu"],
        ["type-a", "Alpha"]
      ])
    };
    const keys = buildLedgerDisplayKeys(
      [
        row({
          id: "g1-late",
          group_id: "group-1",
          entry_type_id: "type-z",
          entry_date: "2026-04-10",
          created_at: "2026-04-10T12:00:00.000Z"
        }),
        row({
          id: "g1-early",
          group_id: "group-1",
          entry_type_id: "type-a",
          entry_date: "2026-04-01",
          created_at: "2026-04-01T12:00:00.000Z"
        }),
        row({
          id: "solo",
          entry_type_id: "type-z",
          entry_date: "2026-04-05",
          created_at: "2026-04-05T12:00:00.000Z"
        })
      ],
      { sortBy: "type_name", sortDir: "asc", lookups }
    );

    expect(keys).toHaveLength(2);
    expect(keys[0]).toMatchObject({ kind: "group", id: "group-1", sort_value: "Alpha" });
    expect(keys[1]).toMatchObject({ kind: "entry", id: "solo", sort_value: "Zulu" });
  });

  it("reproduces newest-member group positioning for entry_date desc", () => {
    const keys = buildLedgerDisplayKeys(
      [
        row({
          id: "g-old",
          group_id: "group-1",
          entry_date: "2026-01-01",
          created_at: "2026-01-01T00:00:00.000Z"
        }),
        row({
          id: "g-new",
          group_id: "group-1",
          entry_date: "2026-05-01",
          created_at: "2026-05-01T00:00:00.000Z"
        }),
        row({
          id: "solo",
          entry_date: "2026-03-01",
          created_at: "2026-03-01T00:00:00.000Z"
        })
      ],
      { sortBy: "entry_date", sortDir: "desc" }
    );

    expect(keys.map((key) => key.id)).toEqual(["group-1", "solo"]);
    expect(keys[0].sort_date).toBe("2026-05-01");
  });
});
