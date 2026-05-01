import { beforeEach, describe, expect, it, vi } from "vitest";

type EntryRow = {
  id: string;
  responsible_actor_id: string;
  entry_direction: "credit" | "debt";
  currency_code: "IDR" | "MYR" | "USDT" | "TRX";
  amount: number;
  credit_book_actors: { actor_code: "A" | "B"; display_name: string };
};

type SettlementRow = { entry_id: string; amount: number };

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
          in: vi.fn().mockResolvedValue({
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

describe("getCreditBookActorOutstandingMetrics", () => {
  beforeEach(() => {
    entryRowsRef.rows = [];
    settlementRowsRef.rows = [];
    vi.clearAllMocks();
  });

  it("returns empty array when there are no entries", async () => {
    const { getCreditBookActorOutstandingMetrics } = await import("@/lib/db/queries");
    const result = await getCreditBookActorOutstandingMetrics();
    expect(result).toEqual([]);
  });

  it("signs outstanding by direction (credit positive, debt negative) and only counts unsettled portion", async () => {
    entryRowsRef.rows = [
      {
        id: "entry-1",
        responsible_actor_id: "actor-a",
        entry_direction: "credit",
        currency_code: "IDR",
        amount: 1000,
        credit_book_actors: { actor_code: "A", display_name: "Actor A" }
      },
      {
        id: "entry-2",
        responsible_actor_id: "actor-a",
        entry_direction: "debt",
        currency_code: "USDT",
        amount: 500,
        credit_book_actors: { actor_code: "A", display_name: "Actor A" }
      },
      {
        id: "entry-3",
        responsible_actor_id: "actor-b",
        entry_direction: "credit",
        currency_code: "IDR",
        amount: 200,
        credit_book_actors: { actor_code: "B", display_name: "Actor B" }
      }
    ];
    settlementRowsRef.rows = [
      { entry_id: "entry-1", amount: 400 },
      { entry_id: "entry-3", amount: 200 }
    ];

    const { getCreditBookActorOutstandingMetrics } = await import("@/lib/db/queries");
    const result = await getCreditBookActorOutstandingMetrics();

    expect(result).toHaveLength(2);

    const actorA = result.find((row) => row.actor_id === "actor-a");
    expect(actorA?.actor_code).toBe("A");
    expect(actorA?.totals.IDR).toBe(600);
    expect(actorA?.totals.USDT).toBe(-500);

    const actorB = result.find((row) => row.actor_id === "actor-b");
    expect(actorB?.actor_code).toBe("B");
    expect(actorB?.totals.IDR).toBe(0);
  });

  it("excludes fully settled entries from outstanding totals", async () => {
    entryRowsRef.rows = [
      {
        id: "entry-1",
        responsible_actor_id: "actor-a",
        entry_direction: "credit",
        currency_code: "MYR",
        amount: 300,
        credit_book_actors: { actor_code: "A", display_name: "Actor A" }
      }
    ];
    settlementRowsRef.rows = [{ entry_id: "entry-1", amount: 300 }];

    const { getCreditBookActorOutstandingMetrics } = await import("@/lib/db/queries");
    const result = await getCreditBookActorOutstandingMetrics();
    expect(result).toHaveLength(1);
    expect(result[0].totals.MYR).toBe(0);
  });

  it("sorts actors by actor_code", async () => {
    entryRowsRef.rows = [
      {
        id: "entry-1",
        responsible_actor_id: "actor-b",
        entry_direction: "credit",
        currency_code: "IDR",
        amount: 100,
        credit_book_actors: { actor_code: "B", display_name: "Actor B" }
      },
      {
        id: "entry-2",
        responsible_actor_id: "actor-a",
        entry_direction: "credit",
        currency_code: "IDR",
        amount: 100,
        credit_book_actors: { actor_code: "A", display_name: "Actor A" }
      }
    ];

    const { getCreditBookActorOutstandingMetrics } = await import("@/lib/db/queries");
    const result = await getCreditBookActorOutstandingMetrics();
    expect(result.map((row) => row.actor_code)).toEqual(["A", "B"]);
  });
});
