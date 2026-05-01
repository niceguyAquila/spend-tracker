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

describe("getCreditBookActorCurrencyMetrics (realized settlements only)", () => {
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

  it("shows zero realized totals when actor has ledger rows but no settlements", async () => {
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
    expect(result[0].totals.MYR).toBe(0);
    expect(result[0].totals.USDT).toBe(0);
  });

  it("counts cross-currency settlement only in settlement currency (credit inflow)", async () => {
    entryRowsRef.rows = [
      {
        responsible_actor_id: "actor-a",
        entry_direction: "credit",
        currency_code: "MYR",
        amount: 273264.45,
        credit_book_actors: { actor_code: "A", display_name: "Actor A" }
      }
    ];
    settlementRowsRef.rows = [
      {
        amount: 30000,
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
    expect(result[0].totals.MYR).toBe(0);
    expect(result[0].totals.USDT).toBe(30000);
  });

  it("counts MYR remainder settlement as MYR realized (credit inflow)", async () => {
    entryRowsRef.rows = [
      {
        responsible_actor_id: "actor-a",
        entry_direction: "credit",
        currency_code: "MYR",
        amount: 273264.45,
        credit_book_actors: { actor_code: "A", display_name: "Actor A" }
      }
    ];
    settlementRowsRef.rows = [
      {
        amount: 157635.45,
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
    expect(result[0].totals.MYR).toBe(157635.45);
    expect(result[0].totals.USDT).toBe(0);
  });

  it("subtracts settlement currency on debt (outflow)", async () => {
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
    expect(result[0].totals.MYR).toBe(0);
    expect(result[0].totals.USDT).toBe(-5000);
  });

  it("sums multiple settlements per actor/currency", async () => {
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
        settlement_currency_code: "USDT",
        credit_ledger_entries: {
          responsible_actor_id: "actor-a",
          entry_direction: "credit",
          currency_code: "MYR",
          credit_book_actors: { actor_code: "A", display_name: "Actor A" }
        }
      },
      {
        amount: 50000,
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
    expect(result[0].totals.USDT).toBe(30000);
    expect(result[0].totals.MYR).toBe(50000);
  });

  it("nets IDR row to zero realized while recording USDT (cross-ccy)", async () => {
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
