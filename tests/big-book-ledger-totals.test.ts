import { beforeEach, describe, expect, it, vi } from "vitest";

type ScanRow = {
  id: string;
  group_id: string | null;
  entry_date: string;
  created_at: string;
  amount: number;
  currency_code: "IDR" | "MYR" | "USDT" | "TRX";
  entry_direction: "spending" | "profit";
  pocket_id: string | null;
  is_credit: boolean;
};

type Payload = { data: unknown[]; error: null };

const scanRowsRef: { rows: ScanRow[] } = { rows: [] };
const scanCallsRef: { inFilters: Array<[string, readonly unknown[]]> } = { inFilters: [] };

// The scan select is the only one that omits the embedded relations, which is
// how the stub tells the counting pass apart from the row hydration.
function isScanSelect(columns: string) {
  return !columns.includes("business_ledger_attachments");
}

function thenable(payload: Payload) {
  const builder: Record<string, unknown> = {
    then: (resolve: (value: Payload) => unknown) => resolve(payload)
  };
  for (const method of ["select", "in", "eq", "is", "not", "gte", "lte", "or", "order", "range", "limit"]) {
    builder[method] = () => builder;
  }
  return builder;
}

function scanBuilder() {
  let rangeFrom = 0;
  let rangeTo = Number.MAX_SAFE_INTEGER;
  const builder: Record<string, unknown> = {
    range: (from: number, to: number) => {
      rangeFrom = from;
      rangeTo = to;
      return builder;
    },
    in: (column: string, values: readonly unknown[]) => {
      scanCallsRef.inFilters.push([column, values]);
      return builder;
    },
    then: (resolve: (value: Payload) => unknown) =>
      resolve({ data: scanRowsRef.rows.slice(rangeFrom, rangeTo + 1), error: null })
  };
  for (const method of ["select", "eq", "is", "not", "gte", "lte", "or", "order", "limit"]) {
    builder[method] = () => builder;
  }
  return builder;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => ({
      select: (columns: string) => {
        if (table === "business_ledger_entry_groups") return thenable({ data: [], error: null });
        if (table !== "business_ledger_entries") throw new Error(`Unexpected table: ${table}`);
        // Hydration is stubbed empty; these tests only assert on the totals,
        // which are derived from the scan rather than the hydrated rows.
        return isScanSelect(columns) ? scanBuilder() : thenable({ data: [], error: null });
      }
    })
  }))
}));

function scanRow(overrides: Partial<ScanRow> = {}): ScanRow {
  return {
    id: "entry-1",
    group_id: null,
    entry_date: "2026-01-18",
    created_at: "2026-01-18T00:00:00Z",
    amount: 100,
    currency_code: "IDR",
    entry_direction: "spending",
    pocket_id: null,
    is_credit: false,
    ...overrides
  };
}

async function loadTotals(
  filters?: Partial<Parameters<typeof import("@/lib/db/queries").getBigBookLedgerRowsPaged>[0]>
) {
  const { getBigBookLedgerRowsPaged } = await import("@/lib/db/queries");
  const result = await getBigBookLedgerRowsPaged({ page: 0, pageSize: 25, ...filters });
  return result.totals;
}

function netFor(
  totals: Awaited<ReturnType<typeof loadTotals>>,
  scope: "pageTotals" | "grandTotals",
  currency: "IDR" | "MYR" | "USDT" | "TRX"
) {
  return totals[scope].find((row) => row.currency === currency)?.net ?? 0;
}

describe("getBigBookLedgerRowsPaged totals", () => {
  beforeEach(() => {
    scanRowsRef.rows = [];
    scanCallsRef.inFilters = [];
    vi.clearAllMocks();
  });

  it("holds pocket-tagged entries back from the totals", async () => {
    scanRowsRef.rows = [
      scanRow({ id: "no-pocket", amount: 170_000_000, entry_direction: "spending" }),
      scanRow({ id: "pocket", amount: 20_006_500, entry_direction: "spending", pocket_id: "pocket-1" })
    ];

    const totals = await loadTotals();
    expect(netFor(totals, "grandTotals", "IDR")).toBe(-170_000_000);
    expect(netFor(totals, "pageTotals", "IDR")).toBe(-170_000_000);
  });

  it("keeps the entry counts describing every row on screen", async () => {
    scanRowsRef.rows = [
      scanRow({ id: "no-pocket" }),
      scanRow({ id: "pocket", pocket_id: "pocket-1" })
    ];

    const totals = await loadTotals();
    expect(totals.grandEntryCount).toBe(2);
    expect(totals.pageEntryCount).toBe(2);
  });

  it("reports how many rows were excluded so the footer can say so", async () => {
    scanRowsRef.rows = [
      scanRow({ id: "a" }),
      scanRow({ id: "b", pocket_id: "pocket-1" }),
      scanRow({ id: "c", pocket_id: "pocket-2" })
    ];

    const totals = await loadTotals();
    expect(totals.grandPocketExcludedCount).toBe(2);
    expect(totals.pagePocketExcludedCount).toBe(2);
  });

  it("reports nothing excluded when no entry carries a pocket", async () => {
    scanRowsRef.rows = [scanRow({ id: "a" }), scanRow({ id: "b" })];

    const totals = await loadTotals();
    expect(totals.grandPocketExcludedCount).toBe(0);
    expect(totals.pagePocketExcludedCount).toBe(0);
  });

  it("sums pocket entries when the caller is filtering by pocket", async () => {
    scanRowsRef.rows = [
      scanRow({ id: "pocket-a", amount: 20_006_500, pocket_id: "pocket-1" }),
      scanRow({ id: "pocket-b", amount: 3_766_500, pocket_id: "pocket-1" })
    ];

    const totals = await loadTotals({ pocketId: ["pocket-1"] });
    expect(netFor(totals, "grandTotals", "IDR")).toBe(-23_773_000);
    expect(totals.grandPocketExcludedCount).toBe(0);
    expect(scanCallsRef.inFilters).toContainEqual(["pocket_id", ["pocket-1"]]);
  });

  it("would otherwise leave a pocket-filtered footer reading zero", async () => {
    scanRowsRef.rows = [scanRow({ id: "pocket-a", amount: 500, pocket_id: "pocket-1" })];

    const withoutFilter = await loadTotals();
    expect(withoutFilter.grandTotals).toEqual([]);

    const withFilter = await loadTotals({ pocketId: ["pocket-1"] });
    expect(netFor(withFilter, "grandTotals", "IDR")).toBe(-500);
  });

  it("excludes pocket members of a group without dropping its other entries", async () => {
    scanRowsRef.rows = [
      scanRow({ id: "child-a", group_id: "group-1", amount: 1_000 }),
      scanRow({ id: "child-b", group_id: "group-1", amount: 250, pocket_id: "pocket-1" })
    ];

    const totals = await loadTotals();
    expect(netFor(totals, "grandTotals", "IDR")).toBe(-1_000);
    expect(totals.grandEntryCount).toBe(2);
    expect(totals.grandPocketExcludedCount).toBe(1);
  });

  it("separates inflow from outflow across currencies", async () => {
    scanRowsRef.rows = [
      scanRow({ id: "in", amount: 205_052_630, entry_direction: "profit" }),
      scanRow({ id: "out", amount: 170_000_000, entry_direction: "spending" }),
      scanRow({ id: "usdt", amount: 10, entry_direction: "profit", currency_code: "USDT" })
    ];

    const totals = await loadTotals();
    expect(totals.grandTotals).toEqual([
      { currency: "IDR", spending: 170_000_000, profit: 205_052_630, net: 35_052_630 },
      { currency: "USDT", spending: 0, profit: 10, net: 10 }
    ]);
  });

  it("scopes page totals to the current page while grand totals span all pages", async () => {
    scanRowsRef.rows = [
      scanRow({ id: "a", entry_date: "2026-01-18", created_at: "2026-01-18T03:00:00Z", amount: 5 }),
      scanRow({ id: "b", entry_date: "2026-01-17", created_at: "2026-01-17T02:00:00Z", amount: 7 }),
      scanRow({ id: "c", entry_date: "2026-01-16", created_at: "2026-01-16T01:00:00Z", amount: 9 })
    ];

    const totals = await loadTotals({ pageSize: 2 });
    expect(netFor(totals, "pageTotals", "IDR")).toBe(-12);
    expect(netFor(totals, "grandTotals", "IDR")).toBe(-21);
    expect(totals.pageEntryCount).toBe(2);
    expect(totals.grandEntryCount).toBe(3);
  });
});
