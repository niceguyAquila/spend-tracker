import { beforeEach, describe, expect, it, vi } from "vitest";

type FilterCall = [string, unknown];

const callsRef: {
  eq: FilterCall[];
  is: FilterCall[];
  gte: FilterCall[];
  lte: FilterCall[];
} = {
  eq: [],
  is: [],
  gte: [],
  lte: []
};

type Payload = {
  data: Array<{
    id: string;
    entry_date: string;
    entry_direction: "spending" | "profit";
    explanation: string;
    amount: number;
    currency_code: "MYR";
    remark: string | null;
    business_ledger_types: { name: string };
  }>;
  error: null;
  count: number;
};

const payloadRef: { value: Payload } = {
  value: {
    data: [],
    error: null,
    count: 0
  }
};

function outstandingBuilder() {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      callsRef.eq.push([column, value]);
      return builder;
    },
    is: (column: string, value: unknown) => {
      callsRef.is.push([column, value]);
      return builder;
    },
    gte: (column: string, value: unknown) => {
      callsRef.gte.push([column, value]);
      return builder;
    },
    lte: (column: string, value: unknown) => {
      callsRef.lte.push([column, value]);
      return builder;
    },
    order: () => builder,
    range: () => builder,
    then: (resolve: (value: Payload) => unknown) => resolve(payloadRef.value)
  };
  return builder;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => {
      if (table !== "business_ledger_entries") throw new Error(`Unexpected table: ${table}`);
      return outstandingBuilder();
    }
  }))
}));

const ACTOR_ID = "22222222-2222-4222-8222-222222222222";
const VENDOR_ID = "77777777-7777-4777-8777-777777777777";

describe("getBigBookVendorActorOutstandingEntries", () => {
  beforeEach(() => {
    callsRef.eq = [];
    callsRef.is = [];
    callsRef.gte = [];
    callsRef.lte = [];
    payloadRef.value = {
      data: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          entry_date: "2026-09-01",
          entry_direction: "spending",
          explanation: "Open credit",
          amount: 8100,
          currency_code: "MYR",
          remark: null,
          business_ledger_types: { name: "Float" }
        }
      ],
      error: null,
      count: 1
    };
    vi.clearAllMocks();
  });

  it("looks up unassigned vendors with vendor_id IS NULL", async () => {
    const { getBigBookVendorActorOutstandingEntries } = await import("@/lib/db/queries");
    const result = await getBigBookVendorActorOutstandingEntries({
      vendorId: null,
      actorId: ACTOR_ID,
      currency: "MYR"
    });

    expect(callsRef.is).toContainEqual(["vendor_id", null]);
    expect(callsRef.eq).toContainEqual(["responsible_actor_id", ACTOR_ID]);
    expect(callsRef.eq).toContainEqual(["currency_code", "MYR"]);
    expect(callsRef.eq).toContainEqual(["is_credit", true]);
    expect(callsRef.is).toContainEqual(["credit_settled_at", null]);
    expect(result.rows).toEqual([
      {
        id: "11111111-1111-4111-8111-111111111111",
        entry_date: "2026-09-01",
        entry_direction: "spending",
        type_name: "Float",
        explanation: "Open credit",
        amount: 8100,
        currency_code: "MYR",
        remark: null
      }
    ]);
    expect(result.totalCount).toBe(1);
  });

  it("eq-filters a concrete vendor and optional dates", async () => {
    const { getBigBookVendorActorOutstandingEntries } = await import("@/lib/db/queries");
    await getBigBookVendorActorOutstandingEntries({
      vendorId: VENDOR_ID,
      actorId: ACTOR_ID,
      currency: "MYR",
      dateFrom: "2026-01-01",
      dateTo: "2026-01-31"
    });

    expect(callsRef.eq).toContainEqual(["vendor_id", VENDOR_ID]);
    expect(callsRef.is).not.toContainEqual(["vendor_id", null]);
    expect(callsRef.gte).toContainEqual(["entry_date", "2026-01-01"]);
    expect(callsRef.lte).toContainEqual(["entry_date", "2026-01-31"]);
  });
});
