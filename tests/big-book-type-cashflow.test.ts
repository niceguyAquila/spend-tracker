import { beforeEach, describe, expect, it, vi } from "vitest";

type ScanRow = {
  responsible_actor_id: string;
  entry_type_id: string;
  entry_direction: "spending" | "profit";
  currency_code: "IDR" | "MYR" | "USDT" | "TRX";
  amount: number | string;
  big_book_actors: { display_name: string } | null;
  business_ledger_types: { code: string; name: string } | null;
};

type TypeRow = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  sort_order: number;
};

const typeRowsRef: { rows: TypeRow[] } = { rows: [] };
const scanRowsRef: { rows: ScanRow[] } = { rows: [] };
const scanCallsRef: {
  ranges: Array<[number, number]>;
  isFilters: Array<[string, unknown]>;
  inFilters: Array<[string, readonly unknown[]]>;
  gteFilters: Array<[string, unknown]>;
} = { ranges: [], isFilters: [], inFilters: [], gteFilters: [] };

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => {
      if (table === "business_ledger_types") {
        const builder = {
          select: () => builder,
          order: () => builder,
          eq: () => builder,
          then: (resolve: (value: { data: TypeRow[]; error: null }) => unknown) =>
            resolve({ data: typeRowsRef.rows, error: null })
        };
        return builder;
      }
      if (table === "business_ledger_entries") {
        const builder = {
          select: () => builder,
          is: (column: string, value: unknown) => {
            scanCallsRef.isFilters.push([column, value]);
            return builder;
          },
          in: (column: string, values: readonly unknown[]) => {
            scanCallsRef.inFilters.push([column, values]);
            return builder;
          },
          gte: (column: string, value: unknown) => {
            scanCallsRef.gteFilters.push([column, value]);
            return builder;
          },
          eq: () => builder,
          not: () => builder,
          lte: () => builder,
          or: () => builder,
          order: () => builder,
          range: async (from: number, to: number) => {
            scanCallsRef.ranges.push([from, to]);
            return { data: scanRowsRef.rows.slice(from, to + 1), error: null };
          }
        };
        return builder;
      }
      throw new Error(`Unexpected table: ${table}`);
    }
  }))
}));

function scanRow(overrides: Partial<ScanRow> = {}): ScanRow {
  return {
    responsible_actor_id: "actor-a",
    entry_type_id: "type-1",
    entry_direction: "profit",
    currency_code: "IDR",
    amount: 100,
    big_book_actors: { display_name: "Actor A" },
    business_ledger_types: { code: "OPS", name: "Operations" },
    ...overrides
  };
}

async function loadCashflow(
  filters?: Parameters<
    typeof import("@/lib/db/queries").getBigBookTypeCashflowByCurrency
  >[0]
) {
  const { getBigBookTypeCashflowByCurrency } = await import("@/lib/db/queries");
  return getBigBookTypeCashflowByCurrency(filters);
}

function currencyBlock(
  result: Awaited<ReturnType<typeof loadCashflow>>,
  currency: "IDR" | "MYR" | "USDT" | "TRX"
) {
  const block = result.find((row) => row.currency === currency);
  if (!block) throw new Error(`Missing currency block: ${currency}`);
  return block;
}

describe("getBigBookTypeCashflowByCurrency", () => {
  beforeEach(() => {
    typeRowsRef.rows = [
      { id: "type-1", code: "OPS", name: "Operations", is_active: true, sort_order: 1 },
      { id: "type-2", code: "MKT", name: "Marketing", is_active: false, sort_order: 2 }
    ];
    scanRowsRef.rows = [];
    scanCallsRef.ranges = [];
    scanCallsRef.isFilters = [];
    scanCallsRef.inFilters = [];
    scanCallsRef.gteFilters = [];
    vi.clearAllMocks();
  });

  it("returns a block per currency even when the ledger is empty", async () => {
    const result = await loadCashflow();
    expect(result.map((row) => row.currency)).toEqual(["IDR", "MYR", "USDT", "TRX"]);
    expect(result.every((row) => row.rows.length === 0)).toBe(true);
    expect(currencyBlock(result, "IDR").combined).toEqual({ inflow: 0, outflow: 0, net: 0 });
  });

  it("excludes pocket-tagged entries so totals reconcile with Grand Total by Actor", async () => {
    await loadCashflow();
    expect(scanCallsRef.isFilters).toContainEqual(["pocket_id", null]);
  });

  it("splits inflow and outflow per actor and type and nets them", async () => {
    scanRowsRef.rows = [
      scanRow({ amount: 250, entry_direction: "profit" }),
      scanRow({ amount: 100, entry_direction: "spending" }),
      scanRow({ entry_type_id: "type-2", amount: 40, entry_direction: "spending" }),
      scanRow({
        responsible_actor_id: "actor-b",
        big_book_actors: { display_name: "Actor B" },
        amount: 70,
        entry_direction: "profit"
      })
    ];

    const idr = currencyBlock(await loadCashflow(), "IDR");
    expect(idr.rows).toHaveLength(3);
    expect(idr.rows).toEqual([
      expect.objectContaining({
        actor_display_name: "Actor A",
        type_name: "Marketing",
        inflow: 0,
        outflow: 40,
        net: -40
      }),
      expect.objectContaining({
        actor_display_name: "Actor A",
        type_name: "Operations",
        inflow: 250,
        outflow: 100,
        net: 150
      }),
      expect.objectContaining({
        actor_display_name: "Actor B",
        type_name: "Operations",
        inflow: 70,
        outflow: 0,
        net: 70
      })
    ]);
    expect(idr.combined).toEqual({ inflow: 320, outflow: 140, net: 180 });
  });

  it("never mixes currencies into the same row or combined total", async () => {
    scanRowsRef.rows = [
      scanRow({ currency_code: "IDR", amount: 100 }),
      scanRow({ currency_code: "USDT", amount: 5 })
    ];

    const result = await loadCashflow();
    expect(currencyBlock(result, "IDR").combined.net).toBe(100);
    expect(currencyBlock(result, "USDT").combined.net).toBe(5);
    expect(currencyBlock(result, "MYR").rows).toEqual([]);
  });

  it("pages past the first batch instead of truncating the ledger", async () => {
    scanRowsRef.rows = Array.from({ length: 1500 }, () => scanRow({ amount: 1 }));

    const idr = currencyBlock(await loadCashflow(), "IDR");
    expect(idr.combined.inflow).toBe(1500);
    expect(scanCallsRef.ranges).toEqual([
      [0, 999],
      [1000, 1999]
    ]);
  });

  it("stops scanning once a short batch comes back", async () => {
    scanRowsRef.rows = Array.from({ length: 12 }, () => scanRow({ amount: 2 }));

    const idr = currencyBlock(await loadCashflow(), "IDR");
    expect(idr.combined.inflow).toBe(24);
    expect(scanCallsRef.ranges).toEqual([[0, 999]]);
  });

  it("pushes the caller filters down to the query", async () => {
    await loadCashflow({
      actorId: ["actor-a"],
      typeId: ["type-1"],
      currencyCode: ["IDR"],
      dateFrom: "2026-01-01"
    });

    expect(scanCallsRef.inFilters).toContainEqual(["responsible_actor_id", ["actor-a"]]);
    expect(scanCallsRef.inFilters).toContainEqual(["entry_type_id", ["type-1"]]);
    expect(scanCallsRef.inFilters).toContainEqual(["currency_code", ["IDR"]]);
    expect(scanCallsRef.gteFilters).toContainEqual(["entry_date", "2026-01-01"]);
  });

  it("only returns the currencies that were asked for", async () => {
    scanRowsRef.rows = [scanRow({ currency_code: "MYR", amount: 10 })];
    const result = await loadCashflow({ currencyCode: ["MYR"] });
    expect(result.map((row) => row.currency)).toEqual(["MYR"]);
    expect(currencyBlock(result, "MYR").combined.net).toBe(10);
  });

  it("treats amounts as magnitudes regardless of stored sign or type", async () => {
    scanRowsRef.rows = [
      scanRow({ amount: "250.5", entry_direction: "profit" }),
      scanRow({ amount: -100, entry_direction: "spending" })
    ];

    const idr = currencyBlock(await loadCashflow(), "IDR");
    expect(idr.combined).toEqual({ inflow: 250.5, outflow: 100, net: 150.5 });
  });

  it("ignores non-finite amounts instead of poisoning the total", async () => {
    scanRowsRef.rows = [
      scanRow({ amount: 50, entry_direction: "profit" }),
      scanRow({ amount: "not-a-number", entry_direction: "profit" })
    ];

    expect(currencyBlock(await loadCashflow(), "IDR").combined.inflow).toBe(50);
  });

  it("rounds away floating point drift from repeated addition", async () => {
    scanRowsRef.rows = [
      scanRow({ currency_code: "USDT", amount: 0.1, entry_direction: "spending" }),
      scanRow({ currency_code: "USDT", amount: 0.2, entry_direction: "spending" })
    ];

    const usdt = currencyBlock(await loadCashflow(), "USDT");
    expect(usdt.combined.outflow).toBe(0.3);
    expect(usdt.combined.net).toBe(-0.3);
  });

  it("falls back to the joined type when the type list does not resolve the id", async () => {
    typeRowsRef.rows = [];
    scanRowsRef.rows = [scanRow({ business_ledger_types: { code: "OPS", name: "Operations" } })];

    const idr = currencyBlock(await loadCashflow(), "IDR");
    expect(idr.rows[0]).toMatchObject({ type_code: "OPS", type_name: "Operations" });
  });
});
