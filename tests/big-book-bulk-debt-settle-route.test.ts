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
      throw new Error("bulk debt settle must record through big_book_record_settlement, not table writes");
    })
  }))
}));

const DEBT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DEBT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const REQUEST_ID = "99999999-9999-4999-8999-999999999999";

describe("big book bulk debt settle route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertCsrfAndOriginMock.mockResolvedValue(true);
    requireAdminApiMock.mockResolvedValue({
      ok: true,
      activeBrandId: "brand-1",
      user: { id: "auth-user-1" }
    });
    rpcMock.mockResolvedValue({
      data: {
        status: "created",
        group_id: "group-1",
        payments: [
          {
            payment_id: "pay-1",
            amount: 150,
            currency_code: "USDT",
            allocations: [
              { obligation_id: DEBT_A, applied_amount: 100 },
              { obligation_id: DEBT_B, applied_amount: 50 }
            ]
          }
        ],
        companion_ids: [],
        closed_obligation_ids: [DEBT_A, DEBT_B],
        unallocated_obligation_ids: []
      },
      error: null
    });
  });

  it("sends one settlement call with every selected debt and one amount", async () => {
    const { POST } = await import("@/app/api/big-book/entries/bulk-debt-settle/route");
    const request = new Request("https://app.localhost/api/big-book/entries/bulk-debt-settle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_request_id: REQUEST_ID,
        debt_entry_ids: [DEBT_A, DEBT_B],
        mode: "single",
        entry_date: "2026-10-01",
        close_debts: true,
        currency_code: "USDT",
        amount: 150
      })
    });

    const response = await POST(request);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.settlement_ids).toEqual(["pay-1"]);
    expect(data.closed_obligation_ids).toEqual([DEBT_A, DEBT_B]);
    expect(data.payments[0].amount).toBe(150);
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith(
      "big_book_record_settlement",
      expect.objectContaining({
        p_request_id: REQUEST_ID,
        p_mode: "single",
        p_obligation_ids: [DEBT_A, DEBT_B],
        p_amount: 150,
        p_currency_code: "USDT",
        p_close: true
      })
    );
  });

  it("rejects a single debt payment that omits the amount", async () => {
    const { POST } = await import("@/app/api/big-book/entries/bulk-debt-settle/route");
    const request = new Request("https://app.localhost/api/big-book/entries/bulk-debt-settle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_request_id: REQUEST_ID,
        debt_entry_ids: [DEBT_A, DEBT_B],
        mode: "single",
        entry_date: "2026-10-01"
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
