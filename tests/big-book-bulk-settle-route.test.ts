import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminApiMock = vi.fn();
const assertCsrfAndOriginMock = vi.fn();
const insertMock = vi.fn();
const updateMock = vi.fn();
const selectInMock = vi.fn();
const typesIlikeMock = vi.fn();
const typesSelectMock = vi.fn(() => ({ ilike: typesIlikeMock }));
const groupInsertSingleMock = vi.fn();
const groupInsertMock = vi.fn(() => ({
  select: vi.fn(() => ({
    single: groupInsertSingleMock
  }))
}));
const groupDeleteEqMock = vi.fn();

vi.mock("@/lib/security/origin", () => ({
  assertCsrfAndOrigin: assertCsrfAndOriginMock,
  hasTrustedOrigin: vi.fn(() => true)
}));

vi.mock("@/lib/auth-api", () => ({
  requireAdminApi: requireAdminApiMock
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: vi.fn((table: string) => {
      if (table === "business_ledger_entries") {
        return {
          select: vi.fn(() => ({
            in: selectInMock
          })),
          insert: insertMock,
          update: updateMock
        };
      }
      if (table === "business_ledger_entry_groups") {
        return {
          insert: groupInsertMock,
          delete: vi.fn(() => ({ eq: groupDeleteEqMock }))
        };
      }
      if (table === "business_ledger_types") {
        return {
          select: typesSelectMock
        };
      }
      return {};
    })
  }))
}));

const CREDIT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CREDIT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PROFIT_TYPE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const KURS_TYPE_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function mockCredits(rows: Array<Record<string, unknown>>) {
  selectInMock.mockResolvedValue({ data: rows, error: null });
}

function mockInsertReturning(
  rows: Array<{ id: string; settles_entry_id?: string | null; entry_type_id?: string }>
) {
  insertMock.mockReturnValue({
    select: vi.fn().mockResolvedValue({ data: rows, error: null })
  });
}

describe("big book bulk settle route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertCsrfAndOriginMock.mockResolvedValue(true);
    requireAdminApiMock.mockResolvedValue({
      ok: true,
      activeBrandId: "brand-1",
      user: { id: "auth-user-1" }
    });

    mockCredits([
      {
        id: CREDIT_A,
        entry_date: "2026-09-01",
        entry_direction: "spending",
        entry_type_id: "type-1",
        entry_sub_type_id: null,
        vendor_type_id: "vt-1",
        vendor_id: "v-1",
        action_by_id: null,
        explanation: "Credit A",
        amount: 100,
        currency_code: "USDT",
        responsible_actor_id: "actor-1",
        is_credit: true,
        settles_entry_id: null,
        credit_settled_at: null
      },
      {
        id: CREDIT_B,
        entry_date: "2026-09-02",
        entry_direction: "spending",
        entry_type_id: "type-1",
        entry_sub_type_id: null,
        vendor_type_id: "vt-1",
        vendor_id: "v-1",
        action_by_id: null,
        explanation: "Credit B",
        amount: 50,
        currency_code: "USDT",
        responsible_actor_id: "actor-1",
        is_credit: true,
        settles_entry_id: null,
        credit_settled_at: null
      }
    ]);

    mockInsertReturning([{ id: "settle-1", settles_entry_id: CREDIT_A }]);
    groupInsertSingleMock.mockResolvedValue({ data: { id: "group-1" }, error: null });
    groupDeleteEqMock.mockResolvedValue({ error: null });
    typesIlikeMock.mockImplementation((column: string, name: string) => {
      void column;
      const lower = name.toLowerCase();
      if (lower === "profit") {
        return Promise.resolve({
          data: [{ id: PROFIT_TYPE_ID, name: "PROFIT", is_active: true }],
          error: null
        });
      }
      if (lower === "kurs") {
        return Promise.resolve({
          data: [{ id: KURS_TYPE_ID, name: "KURS", is_active: true }],
          error: null
        });
      }
      return Promise.resolve({ data: [], error: null });
    });

    updateMock.mockReturnValue({
      in: vi.fn(() => ({
        eq: vi.fn(() => ({
          is: vi.fn(() => ({
            select: vi.fn().mockResolvedValue({
              data: [{ id: CREDIT_A }, { id: CREDIT_B }],
              error: null
            })
          }))
        }))
      }))
    });
  });

  it("creates one settlement covering all selected credits by default", async () => {
    const { POST } = await import("@/app/api/big-book/entries/bulk-settle/route");
    const request = new Request("https://app.localhost/api/big-book/entries/bulk-settle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        credit_entry_ids: [CREDIT_A, CREDIT_B],
        entry_date: "2026-10-01"
      })
    });

    const response = await POST(request);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.mode).toBe("single");
    expect(data.settlement_ids).toEqual(["settle-1"]);
    expect(data.settled_count).toBe(2);
    expect(insertMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          amount: 150,
          settles_entry_id: CREDIT_A,
          currency_code: "USDT",
          is_credit: false
        })
      ])
    );
  });

  it("allows IDR settle against MYR credits without credit-currency amount", async () => {
    mockCredits([
      {
        id: CREDIT_A,
        entry_date: "2026-09-01",
        entry_direction: "spending",
        entry_type_id: "type-1",
        entry_sub_type_id: null,
        vendor_type_id: "vt-1",
        vendor_id: "v-1",
        action_by_id: null,
        explanation: "Credit A",
        amount: 420,
        currency_code: "MYR",
        responsible_actor_id: "actor-1",
        is_credit: true,
        settles_entry_id: null,
        credit_settled_at: null
      }
    ]);

    const { POST } = await import("@/app/api/big-book/entries/bulk-settle/route");
    const request = new Request("https://app.localhost/api/big-book/entries/bulk-settle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        credit_entry_ids: [CREDIT_A],
        mode: "single",
        entry_date: "2026-10-01",
        currency_code: "IDR",
        amount: 1500000
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(insertMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          amount: 1500000,
          currency_code: "IDR",
          settlement_conversion_rate: null,
          settlement_amount_in_credit_currency: null,
          settles_entry_id: CREDIT_A
        })
      ])
    );
  });

  it("allows USDT settle against MYR credits without a conversion rate", async () => {
    mockCredits([
      {
        id: CREDIT_A,
        entry_date: "2026-09-01",
        entry_direction: "spending",
        entry_type_id: "type-1",
        entry_sub_type_id: null,
        vendor_type_id: "vt-1",
        vendor_id: "v-1",
        action_by_id: null,
        explanation: "Credit A",
        amount: 420,
        currency_code: "MYR",
        responsible_actor_id: "actor-1",
        is_credit: true,
        settles_entry_id: null,
        credit_settled_at: null
      }
    ]);

    const { POST } = await import("@/app/api/big-book/entries/bulk-settle/route");
    const request = new Request("https://app.localhost/api/big-book/entries/bulk-settle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        credit_entry_ids: [CREDIT_A],
        mode: "single",
        entry_date: "2026-10-01",
        currency_code: "USDT",
        amount: 95
      })
    });

    const response = await POST(request);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.mode).toBe("single");
    expect(insertMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          amount: 95,
          currency_code: "USDT",
          settlement_conversion_rate: null,
          settlement_amount_in_credit_currency: null,
          settles_entry_id: CREDIT_A
        })
      ])
    );
  });

  it("applies USDT conversion rate for a single combined settlement", async () => {
    mockCredits([
      {
        id: CREDIT_A,
        entry_date: "2026-09-01",
        entry_direction: "spending",
        entry_type_id: "type-1",
        entry_sub_type_id: null,
        vendor_type_id: "vt-1",
        vendor_id: "v-1",
        action_by_id: null,
        explanation: "Credit A",
        amount: 420,
        currency_code: "MYR",
        responsible_actor_id: "actor-1",
        is_credit: true,
        settles_entry_id: null,
        credit_settled_at: null
      },
      {
        id: CREDIT_B,
        entry_date: "2026-09-02",
        entry_direction: "spending",
        entry_type_id: "type-1",
        entry_sub_type_id: null,
        vendor_type_id: "vt-1",
        vendor_id: "v-1",
        action_by_id: null,
        explanation: "Credit B",
        amount: 210,
        currency_code: "MYR",
        responsible_actor_id: "actor-1",
        is_credit: true,
        settles_entry_id: null,
        credit_settled_at: null
      }
    ]);

    const { POST } = await import("@/app/api/big-book/entries/bulk-settle/route");
    const request = new Request("https://app.localhost/api/big-book/entries/bulk-settle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        credit_entry_ids: [CREDIT_A, CREDIT_B],
        mode: "single",
        entry_date: "2026-10-01",
        currency_code: "USDT",
        // 1 USDT = 4.2 MYR → usdt = 630 / 4.2 = 150
        settlement_conversion_rate: 4.2,
        amount: 150
      })
    });

    const response = await POST(request);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.mode).toBe("single");
    expect(insertMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          amount: 150,
          currency_code: "USDT",
          settlement_conversion_rate: 4.2,
          settlement_amount_in_credit_currency: 630,
          settles_entry_id: CREDIT_A
        })
      ])
    );
  });

  it("defaults USDT amount to (base + profit) / rate when amount omitted", async () => {
    mockCredits([
      {
        id: CREDIT_A,
        entry_date: "2026-09-01",
        entry_direction: "spending",
        entry_type_id: "type-1",
        entry_sub_type_id: null,
        vendor_type_id: "vt-1",
        vendor_id: "v-1",
        action_by_id: null,
        explanation: "Credit A",
        amount: 420,
        currency_code: "MYR",
        responsible_actor_id: "actor-1",
        is_credit: true,
        settles_entry_id: null,
        credit_settled_at: null
      }
    ]);
    mockInsertReturning([
      { id: "settle-1", settles_entry_id: CREDIT_A },
      { id: "profit-1", settles_entry_id: null, entry_type_id: PROFIT_TYPE_ID }
    ]);

    const { POST } = await import("@/app/api/big-book/entries/bulk-settle/route");
    const request = new Request("https://app.localhost/api/big-book/entries/bulk-settle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        credit_entry_ids: [CREDIT_A],
        mode: "single",
        entry_date: "2026-10-01",
        currency_code: "USDT",
        settlement_conversion_rate: 4.2,
        // (420 + 42) / 4.2 = 110
        profit_amount: 42
      })
    });

    const response = await POST(request);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.group_id).toBe("group-1");
    expect(data.companion_ids).toContain("profit-1");
    expect(insertMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          amount: 110,
          currency_code: "USDT",
          settles_entry_id: CREDIT_A
        }),
        expect.objectContaining({
          amount: 42,
          currency_code: "MYR",
          entry_direction: "profit",
          entry_type_id: PROFIT_TYPE_ID,
          settles_entry_id: null,
          group_id: "group-1"
        })
      ])
    );
  });

  it("creates PROFIT + settlement + KURS companions in one group", async () => {
    mockCredits([
      {
        id: CREDIT_A,
        entry_date: "2026-09-01",
        entry_direction: "spending",
        entry_type_id: "type-1",
        entry_sub_type_id: null,
        vendor_type_id: "vt-1",
        vendor_id: "v-1",
        action_by_id: null,
        explanation: "Credit A",
        amount: 420,
        currency_code: "MYR",
        responsible_actor_id: "actor-1",
        is_credit: true,
        settles_entry_id: null,
        credit_settled_at: null
      }
    ]);
    mockInsertReturning([
      { id: "settle-1", settles_entry_id: CREDIT_A },
      { id: "profit-1", settles_entry_id: null, entry_type_id: PROFIT_TYPE_ID },
      { id: "kurs-1", settles_entry_id: null, entry_type_id: KURS_TYPE_ID }
    ]);

    const { POST } = await import("@/app/api/big-book/entries/bulk-settle/route");
    const request = new Request("https://app.localhost/api/big-book/entries/bulk-settle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        credit_entry_ids: [CREDIT_A],
        mode: "single",
        entry_date: "2026-10-01",
        currency_code: "USDT",
        settlement_conversion_rate: 4.2,
        amount: 110,
        profit_amount: 42,
        kurs_rate: 0.99,
        kurs_amount: 1.1
      })
    });

    const response = await POST(request);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.group_id).toBe("group-1");
    expect(data.settlement_ids).toEqual(["settle-1"]);
    expect(data.companion_ids).toEqual(expect.arrayContaining(["profit-1", "kurs-1"]));
    expect(insertMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          amount: 110,
          currency_code: "USDT",
          entry_direction: "profit",
          settles_entry_id: CREDIT_A,
          group_id: "group-1"
        }),
        expect.objectContaining({
          amount: 42,
          currency_code: "MYR",
          entry_type_id: PROFIT_TYPE_ID,
          group_id: "group-1"
        }),
        expect.objectContaining({
          amount: 1.1,
          currency_code: "USDT",
          entry_direction: "spending",
          entry_type_id: KURS_TYPE_ID,
          group_id: "group-1"
        })
      ])
    );
  });

  it("rejects when PROFIT type is missing", async () => {
    mockCredits([
      {
        id: CREDIT_A,
        entry_date: "2026-09-01",
        entry_direction: "spending",
        entry_type_id: "type-1",
        entry_sub_type_id: null,
        vendor_type_id: "vt-1",
        vendor_id: "v-1",
        action_by_id: null,
        explanation: "Credit A",
        amount: 100,
        currency_code: "MYR",
        responsible_actor_id: "actor-1",
        is_credit: true,
        settles_entry_id: null,
        credit_settled_at: null
      }
    ]);
    typesIlikeMock.mockImplementation(() => Promise.resolve({ data: [], error: null }));

    const { POST } = await import("@/app/api/big-book/entries/bulk-settle/route");
    const request = new Request("https://app.localhost/api/big-book/entries/bulk-settle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        credit_entry_ids: [CREDIT_A],
        mode: "single",
        entry_date: "2026-10-01",
        currency_code: "MYR",
        amount: 100,
        profit_amount: 10
      })
    });

    const response = await POST(request);
    const data = await response.json();
    expect(response.status).toBe(400);
    expect(String(data.error)).toMatch(/PROFIT ledger type not found/i);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("rejects when KURS type is missing for USDT settle with kurs fields", async () => {
    mockCredits([
      {
        id: CREDIT_A,
        entry_date: "2026-09-01",
        entry_direction: "spending",
        entry_type_id: "type-1",
        entry_sub_type_id: null,
        vendor_type_id: "vt-1",
        vendor_id: "v-1",
        action_by_id: null,
        explanation: "Credit A",
        amount: 420,
        currency_code: "MYR",
        responsible_actor_id: "actor-1",
        is_credit: true,
        settles_entry_id: null,
        credit_settled_at: null
      }
    ]);
    typesIlikeMock.mockImplementation((column: string, name: string) => {
      void column;
      if (name.toLowerCase() === "kurs") {
        return Promise.resolve({ data: [], error: null });
      }
      return Promise.resolve({
        data: [{ id: PROFIT_TYPE_ID, name: "PROFIT", is_active: true }],
        error: null
      });
    });

    const { POST } = await import("@/app/api/big-book/entries/bulk-settle/route");
    const request = new Request("https://app.localhost/api/big-book/entries/bulk-settle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        credit_entry_ids: [CREDIT_A],
        mode: "single",
        entry_date: "2026-10-01",
        currency_code: "USDT",
        amount: 100,
        kurs_rate: 0.99
      })
    });

    const response = await POST(request);
    const data = await response.json();
    expect(response.status).toBe(400);
    expect(String(data.error)).toMatch(/KURS ledger type not found/i);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("creates one settlement per credit when mode is per_credit", async () => {
    mockInsertReturning([
      { id: "settle-a", settles_entry_id: CREDIT_A },
      { id: "settle-b", settles_entry_id: CREDIT_B }
    ]);

    const { POST } = await import("@/app/api/big-book/entries/bulk-settle/route");
    const request = new Request("https://app.localhost/api/big-book/entries/bulk-settle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        credit_entry_ids: [CREDIT_A, CREDIT_B],
        mode: "per_credit",
        entry_date: "2026-10-01"
      })
    });

    const response = await POST(request);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.mode).toBe("per_credit");
    expect(data.settlement_ids).toEqual(["settle-a", "settle-b"]);
    expect(insertMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ settles_entry_id: CREDIT_A, amount: 100 }),
        expect.objectContaining({ settles_entry_id: CREDIT_B, amount: 50 })
      ])
    );
  });
});
