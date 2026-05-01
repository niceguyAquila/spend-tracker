import { beforeEach, describe, expect, it, vi } from "vitest";

type EntryRow = {
  responsible_actor_id: string;
  entry_direction: "credit" | "debt";
  currency_code: "IDR" | "MYR" | "USDT" | "TRX";
  amount: number;
  credit_book_actors: { actor_code: "A" | "B"; display_name: string };
};

type SettlementRow = {
  amount: number;
  amount_in_entry_currency: number;
  settlement_currency_code: "IDR" | "MYR" | "USDT" | "TRX";
  credit_ledger_entries: {
    responsible_actor_id: string;
    entry_direction: "credit" | "debt";
    currency_code: "IDR" | "MYR" | "USDT" | "TRX";
    credit_book_actors: { actor_code: "A" | "B"; display_name: string };
  };
};

const entryRowsRef: { rows: EntryRow[] } = { rows: [] };
const settlementRowsRef: { rows: SettlementRow[] } = { rows: [] };

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => {
      if (table === "credit_ledger_entries") {
        const builder = {
          select: vi.fn(() => builder),
          order: vi.fn(() => builder),
          range: vi.fn().mockResolvedValue({
            data: entryRowsRef.rows,
            error: null
          })
        };
        return builder;
      }
      if (table === "credit_ledger_settlements") {
        const builder = {
          select: vi.fn(() => builder),
          order: vi.fn(() => builder),
          range: vi.fn().mockResolvedValue({
            data: settlementRowsRef.rows,
            error: null
          })
        };
        return builder;
      }
      throw new Error(`Unexpected table: ${table}`);
    }
  }))
}));

describe("getCreditBookActorCurrencyMetrics (net after settlements)", () => {
  beforeEach(() => {
    entryRowsRef.rows = [];
    settlementRowsRef.rows = [];
    vi.clearAllMocks();
  });

  it("returns empty array when there are no entries or settlements", async () => {
    const { getCreditBookActorCurrencyMetrics } = await import("@/lib/db/queries");
    const result = await getCreditBookActorCurrencyMetrics();
    expect(result).toEqual([]);
  });

  it("aggregates entry amounts when there are no settlements", async () => {
    entryRowsRef.rows = [
      {
        responsible_actor_id: "actor-a",
        entry_direction: "credit",
        currency_code: "MYR",
        amount: 1000,
        credit_book_actors: { actor_code: "A", display_name: "Actor A" }
      },
      {
        responsible_actor_id: "actor-a",
        entry_direction: "debt",
        currency_code: "MYR",
        amount: 200,
        credit_book_actors: { actor_code: "A", display_name: "Actor A" }
      }
    ];

    const { getCreditBookActorCurrencyMetrics } = await import("@/lib/db/queries");
    const result = await getCreditBookActorCurrencyMetrics();
    expect(result).toHaveLength(1);
    expect(result[0].totals.MYR).toBe(800);
    expect(result[0].totals.USDT).toBe(0);
  });

  it("nets MYR by entry-currency equivalent and adds USDT for cross-currency credit settlement", async () => {
    entryRowsRef.rows = [
      {
        responsible_actor_id: "actor-a",
        entry_direction: "credit",
        currency_code: "MYR",
        amount: 200000,
        credit_book_actors: { actor_code: "A", display_name: "Actor A" }
      }
    ];
    settlementRowsRef.rows = [
      {
        amount: 30000,
        amount_in_entry_currency: 115629,
        settlement_currency_code: "USDT",
        credit_ledger_entries: {
          responsible_actor_id: "actor-a",
          entry_direction: "credit",
          currency_code: "MYR",
          credit_book_actors: { actor_code: "A", display_name: "Actor A" }
        }
      }
    ];

    const { getCreditBookActorCurrencyMetrics } = await import("@/lib/db/queries");
    const result = await getCreditBookActorCurrencyMetrics();
    expect(result).toHaveLength(1);
    expect(result[0].totals.MYR).toBe(84371);
    expect(result[0].totals.USDT).toBe(30000);
  });

  it("nets MYR toward zero for debt and subtracts USDT outflow on cross-currency debt settlement", async () => {
    entryRowsRef.rows = [
      {
        responsible_actor_id: "actor-a",
        entry_direction: "debt",
        currency_code: "MYR",
        amount: 100000,
        credit_book_actors: { actor_code: "A", display_name: "Actor A" }
      }
    ];
    settlementRowsRef.rows = [
      {
        amount: 5000,
        amount_in_entry_currency: 19000,
        settlement_currency_code: "USDT",
        credit_ledger_entries: {
          responsible_actor_id: "actor-a",
          entry_direction: "debt",
          currency_code: "MYR",
          credit_book_actors: { actor_code: "A", display_name: "Actor A" }
        }
      }
    ];

    const { getCreditBookActorCurrencyMetrics } = await import("@/lib/db/queries");
    const result = await getCreditBookActorCurrencyMetrics();
    expect(result).toHaveLength(1);
    expect(result[0].totals.MYR).toBe(-81000);
    expect(result[0].totals.USDT).toBe(-5000);
  });

  it("subtracts same-currency settlements from the entry currency bucket only", async () => {
    entryRowsRef.rows = [
      {
        responsible_actor_id: "actor-a",
        entry_direction: "credit",
        currency_code: "MYR",
        amount: 200000,
        credit_book_actors: { actor_code: "A", display_name: "Actor A" }
      }
    ];
    settlementRowsRef.rows = [
      {
        amount: 50000,
        amount_in_entry_currency: 50000,
        settlement_currency_code: "MYR",
        credit_ledger_entries: {
          responsible_actor_id: "actor-a",
          entry_direction: "credit",
          currency_code: "MYR",
          credit_book_actors: { actor_code: "A", display_name: "Actor A" }
        }
      }
    ];

    const { getCreditBookActorCurrencyMetrics } = await import("@/lib/db/queries");
    const result = await getCreditBookActorCurrencyMetrics();
    expect(result).toHaveLength(1);
    expect(result[0].totals.MYR).toBe(150000);
    expect(result[0].totals.USDT).toBe(0);
  });

  it("fully nets a settled credit entry when equiv equals face amount", async () => {
    entryRowsRef.rows = [
      {
        responsible_actor_id: "actor-a",
        entry_direction: "credit",
        currency_code: "MYR",
        amount: 2920000,
        credit_book_actors: { actor_code: "A", display_name: "Actor A" }
      }
    ];
    settlementRowsRef.rows = [
      {
        amount: 2920000,
        amount_in_entry_currency: 2920000,
        settlement_currency_code: "MYR",
        credit_ledger_entries: {
          responsible_actor_id: "actor-a",
          entry_direction: "credit",
          currency_code: "MYR",
          credit_book_actors: { actor_code: "A", display_name: "Actor A" }
        }
      }
    ];

    const { getCreditBookActorCurrencyMetrics } = await import("@/lib/db/queries");
    const result = await getCreditBookActorCurrencyMetrics();
    expect(result).toHaveLength(1);
    expect(result[0].totals.MYR).toBe(0);
  });

  it("nets cross-currency settlement against matching ledger row", async () => {
    entryRowsRef.rows = [
      {
        responsible_actor_id: "actor-b",
        entry_direction: "credit",
        currency_code: "IDR",
        amount: 2400000,
        credit_book_actors: { actor_code: "B", display_name: "Actor B" }
      }
    ];
    settlementRowsRef.rows = [
      {
        amount: 1500,
        amount_in_entry_currency: 2400000,
        settlement_currency_code: "USDT",
        credit_ledger_entries: {
          responsible_actor_id: "actor-b",
          entry_direction: "credit",
          currency_code: "IDR",
          credit_book_actors: { actor_code: "B", display_name: "Actor B" }
        }
      }
    ];

    const { getCreditBookActorCurrencyMetrics } = await import("@/lib/db/queries");
    const result = await getCreditBookActorCurrencyMetrics();
    expect(result).toHaveLength(1);
    expect(result[0].actor_id).toBe("actor-b");
    expect(result[0].totals.IDR).toBe(0);
    expect(result[0].totals.USDT).toBe(1500);
  });

  it("sorts actors by actor_code", async () => {
    entryRowsRef.rows = [
      {
        responsible_actor_id: "actor-b",
        entry_direction: "credit",
        currency_code: "IDR",
        amount: 100,
        credit_book_actors: { actor_code: "B", display_name: "Actor B" }
      },
      {
        responsible_actor_id: "actor-a",
        entry_direction: "credit",
        currency_code: "IDR",
        amount: 100,
        credit_book_actors: { actor_code: "A", display_name: "Actor A" }
      }
    ];

    const { getCreditBookActorCurrencyMetrics } = await import("@/lib/db/queries");
    const result = await getCreditBookActorCurrencyMetrics();
    expect(result.map((row) => row.actor_code)).toEqual(["A", "B"]);
  });
});
