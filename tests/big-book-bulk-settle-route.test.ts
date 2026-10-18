import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminApiMock = vi.fn();
const assertCsrfAndOriginMock = vi.fn();
const rpcMock = vi.fn();

vi.mock("@/lib/security/origin", () => ({
  assertCsrfAndOrigin: assertCsrfAndOriginMock,
  hasTrustedOrigin: vi.fn(() => true)
}));

vi.mock("@/lib/auth-api", () => ({
  requireAdminApi: requireAdminApiMock
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    rpc: rpcMock,
    from: vi.fn(() => {
      throw new Error("bulk settle must record through big_book_record_settlement, not table writes");
    })
  }))
}));

const CREDIT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CREDIT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const REQUEST_ID = "99999999-9999-4999-8999-999999999999";

function createdOutcome(amount: number) {
  return {
    status: "created",
    group_id: "group-1",
    payments: [
      {
        payment_id: "settle-1",
        amount,
        currency_code: "USDT",
        allocations: [
          { obligation_id: CREDIT_A, applied_amount: 100 },
          { obligation_id: CREDIT_B, applied_amount: 50 }
        ]
      }
    ],
    companion_ids: ["profit-1", "kurs-1"],
    closed_obligation_ids: [CREDIT_A, CREDIT_B],
    unallocated_obligation_ids: []
  };
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
    rpcMock.mockResolvedValue({ data: createdOutcome(150), error: null });
  });

  it("sends one settlement call with every selected obligation and one amount", async () => {
    const { POST } = await import("@/app/api/big-book/entries/bulk-settle/route");
    const request = new Request("https://app.localhost/api/big-book/entries/bulk-settle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_request_id: REQUEST_ID,
        credit_entry_ids: [CREDIT_A, CREDIT_B],
        mode: "single",
        entry_date: "2026-10-01",
        currency_code: "USDT",
        amount: 150,
        settlement_conversion_rate: 4.2
      })
    });

    const response = await POST(request);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.settlement_ids).toEqual(["settle-1"]);
    expect(data.payments).toHaveLength(1);
    expect(data.payments[0].allocations.map((row: { obligation_id: string }) => row.obligation_id)).toEqual([
      CREDIT_A,
      CREDIT_B
    ]);
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith(
      "big_book_record_settlement",
      expect.objectContaining({
        p_request_id: REQUEST_ID,
        p_mode: "single",
        p_obligation_ids: [CREDIT_A, CREDIT_B],
        p_amount: 150,
        p_currency_code: "USDT",
        p_conversion_rate: 4.2
      })
    );
  });

  it("rejects a single settlement that omits the amount", async () => {
    const { POST } = await import("@/app/api/big-book/entries/bulk-settle/route");
    const request = new Request("https://app.localhost/api/big-book/entries/bulk-settle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_request_id: REQUEST_ID,
        credit_entry_ids: [CREDIT_A, CREDIT_B],
        mode: "single",
        entry_date: "2026-10-01"
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects a settlement without client_request_id", async () => {
    const { POST } = await import("@/app/api/big-book/entries/bulk-settle/route");
    const request = new Request("https://app.localhost/api/big-book/entries/bulk-settle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        credit_entry_ids: [CREDIT_A],
        mode: "single",
        entry_date: "2026-10-01",
        amount: 100
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("sends per-credit settlement as one each-mode call covering every obligation", async () => {
    rpcMock.mockResolvedValueOnce({
      data: {
        status: "created",
        group_id: "group-1",
        payments: [
          {
            payment_id: "settle-a",
            amount: 100,
            currency_code: "USDT",
            allocations: [{ obligation_id: CREDIT_A, applied_amount: 100 }]
          },
          {
            payment_id: "settle-b",
            amount: 50,
            currency_code: "USDT",
            allocations: [{ obligation_id: CREDIT_B, applied_amount: 50 }]
          }
        ],
        companion_ids: [],
        closed_obligation_ids: [CREDIT_A, CREDIT_B],
        unallocated_obligation_ids: []
      },
      error: null
    });

    const { POST } = await import("@/app/api/big-book/entries/bulk-settle/route");
    const request = new Request("https://app.localhost/api/big-book/entries/bulk-settle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_request_id: REQUEST_ID,
        credit_entry_ids: [CREDIT_A, CREDIT_B],
        mode: "per_credit",
        entry_date: "2026-10-01"
      })
    });

    const response = await POST(request);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.settlement_ids).toEqual(["settle-a", "settle-b"]);
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith(
      "big_book_record_settlement",
      expect.objectContaining({
        p_mode: "each",
        p_obligation_ids: [CREDIT_A, CREDIT_B],
        p_amount: null
      })
    );
  });

  it("forwards profit and kurs companions on the single settlement call", async () => {
    const { POST } = await import("@/app/api/big-book/entries/bulk-settle/route");
    const request = new Request("https://app.localhost/api/big-book/entries/bulk-settle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_request_id: REQUEST_ID,
        credit_entry_ids: [CREDIT_A],
        mode: "single",
        entry_date: "2026-10-01",
        currency_code: "USDT",
        amount: 110,
        profit_amount: 42,
        kurs_amount: 1.1
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith(
      "big_book_record_settlement",
      expect.objectContaining({
        p_obligation_ids: [CREDIT_A],
        p_amount: 110,
        p_companions: expect.arrayContaining([
          { role: "profit", amount: 42 },
          { role: "kurs", amount: 1.1 }
        ])
      })
    );
  });

  it("surfaces a missing PROFIT type from the settlement function", async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: {
        message: "companion_type_missing",
        hint: JSON.stringify({ role: "profit" }),
        code: "PT422"
      }
    });

    const { POST } = await import("@/app/api/big-book/entries/bulk-settle/route");
    const request = new Request("https://app.localhost/api/big-book/entries/bulk-settle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_request_id: REQUEST_ID,
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
    expect(response.status).toBe(422);
    expect(String(data.error)).toMatch(/PROFIT ledger type not found/i);
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });
});
