import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BigBookEntry } from "@/lib/types";

const REQUEST_ID = "99999999-9999-4999-8999-999999999999";
const PAYMENT = "22222222-2222-4222-8222-222222222222";
const GAS_FEE = "33333333-3333-4333-8333-333333333333";
const CREDIT = "11111111-1111-4111-8111-111111111111";

const rpcMock = vi.fn();
const requireAdminApiMock = vi.fn();
const assertCsrfAndOriginMock = vi.fn();

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
      throw new Error("settlement undo must go through RPCs, not table writes");
    })
  }))
}));

const PLAN = {
  request_id: REQUEST_ID,
  legacy: false,
  kind: "credit",
  recorded_at: "2026-10-01T00:00:00Z",
  entry_ids: [PAYMENT, GAS_FEE],
  payments: [
    {
      id: PAYMENT,
      entry_date: "2026-10-01",
      explanation: "Settlement for: Vendor A",
      amount: "150.0000",
      currency_code: "USDT",
      entry_direction: "profit"
    }
  ],
  companions: [
    {
      id: GAS_FEE,
      entry_date: "2026-10-01",
      explanation: "Gas fee — Settlement for: Vendor A",
      amount: "2",
      currency_code: "TRX",
      entry_direction: "spending"
    }
  ],
  obligations: [
    {
      id: CREDIT,
      entry_date: "2026-09-01",
      explanation: "Vendor A",
      amount: "150",
      currency_code: "USDT",
      is_debt: false,
      is_future_credit: true,
      applied_amount: "150.0000",
      reopen: true,
      restore_group: true,
      restore_group_id: null,
      restore_group_label: null
    }
  ],
  group: { id: "group-1", label: "Settlement for: Vendor A", created_by_settlement: true, delete_after_revert: true }
};

describe("settlement revert route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertCsrfAndOriginMock.mockResolvedValue(true);
    requireAdminApiMock.mockResolvedValue({ ok: true, user: { id: "auth-user-1" } });
  });

  it("previews by request id and normalizes numbers", async () => {
    rpcMock.mockResolvedValue({ data: PLAN, error: null });
    const { GET } = await import("@/app/api/big-book/settlements/revert/route");
    const response = await GET(
      new Request(`https://app.localhost/api/big-book/settlements/revert?request_id=${REQUEST_ID}`)
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith("big_book_settlement_revert_plan", {
      p_request_id: REQUEST_ID,
      p_payment_id: null
    });
    expect(data.plan.payments[0].amount).toBe(150);
    expect(data.plan.obligations[0]).toMatchObject({ applied_amount: 150, reopen: true, is_future_credit: true });
  });

  it("previews a legacy payment by payment id", async () => {
    rpcMock.mockResolvedValue({ data: { ...PLAN, request_id: null, legacy: true }, error: null });
    const { GET } = await import("@/app/api/big-book/settlements/revert/route");
    await GET(new Request(`https://app.localhost/api/big-book/settlements/revert?payment_id=${PAYMENT}`));
    expect(rpcMock).toHaveBeenCalledWith("big_book_settlement_revert_plan", {
      p_request_id: null,
      p_payment_id: PAYMENT
    });
  });

  it("requires exactly one of request_id / payment_id", async () => {
    const { GET } = await import("@/app/api/big-book/settlements/revert/route");
    const none = await GET(new Request("https://app.localhost/api/big-book/settlements/revert"));
    const both = await GET(
      new Request(
        `https://app.localhost/api/big-book/settlements/revert?request_id=${REQUEST_ID}&payment_id=${PAYMENT}`
      )
    );
    expect(none.status).toBe(400);
    expect(both.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("reverts with the expected entry ids and reason", async () => {
    rpcMock.mockResolvedValue({
      data: {
        request_id: REQUEST_ID,
        deleted_ids: [PAYMENT, GAS_FEE],
        reopened_ids: [CREDIT],
        regrouped_ids: [CREDIT],
        group_id: "group-1",
        group_deleted: true
      },
      error: null
    });
    const { POST } = await import("@/app/api/big-book/settlements/revert/route");
    const response = await POST(
      new Request("https://app.localhost/api/big-book/settlements/revert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: REQUEST_ID, expected_entry_ids: [PAYMENT, GAS_FEE], reason: " wrong rate " })
      })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith("big_book_revert_settlement", {
      p_request_id: REQUEST_ID,
      p_payment_id: null,
      p_expected_entry_ids: [PAYMENT, GAS_FEE],
      p_reason: "wrong rate"
    });
    expect(data).toMatchObject({ ok: true, reopened_ids: [CREDIT], group_deleted: true });
  });

  it("rejects a revert without CSRF", async () => {
    assertCsrfAndOriginMock.mockResolvedValue(false);
    const { POST } = await import("@/app/api/big-book/settlements/revert/route");
    const response = await POST(
      new Request("https://app.localhost/api/big-book/settlements/revert", {
        method: "POST",
        body: JSON.stringify({ request_id: REQUEST_ID, expected_entry_ids: [PAYMENT] })
      })
    );
    expect(response.status).toBe(403);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("maps database errors to statuses", async () => {
    const { POST } = await import("@/app/api/big-book/settlements/revert/route");
    const send = () =>
      POST(
        new Request("https://app.localhost/api/big-book/settlements/revert", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ request_id: REQUEST_ID, expected_entry_ids: [PAYMENT] })
        })
      );

    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { code: "PT409", message: "settlement_changed", hint: JSON.stringify({ entry_ids: [PAYMENT, GAS_FEE] }) }
    });
    const changed = await send();
    expect(changed.status).toBe(409);
    expect(await changed.json()).toMatchObject({ code: "settlement_changed", entry_ids: [PAYMENT, GAS_FEE] });

    rpcMock.mockResolvedValueOnce({ data: null, error: { code: "PT409", message: "settlement_already_reverted" } });
    expect((await send()).status).toBe(409);

    rpcMock.mockResolvedValueOnce({ data: null, error: { code: "PT404", message: "settlement_not_found" } });
    expect((await send()).status).toBe(404);

    rpcMock.mockResolvedValueOnce({ data: null, error: { code: "PT403", message: "not_admin" } });
    expect((await send()).status).toBe(403);
  });
});

describe("settlementUndoCandidates", () => {
  function entry(overrides: Partial<BigBookEntry>): BigBookEntry {
    return {
      id: "x",
      entry_date: "2026-10-01",
      created_at: "2026-10-01T00:00:00Z",
      amount: 10,
      currency_code: "IDR",
      settles: [],
      settlement_request_id: null,
      ...overrides
    } as BigBookEntry;
  }
  const target = { explanation: "Vendor A", is_debt: false } as BigBookEntry["settles"][number];

  it("offers one candidate per settlement request, newest first, and legacy payments individually", async () => {
    const { settlementUndoCandidates } = await import("@/lib/big-book/settlement-undo-candidates");
    const candidates = settlementUndoCandidates([
      entry({ id: "credit", is_credit: true }),
      entry({ id: "p1", settles: [target], settlement_request_id: "req-old", entry_date: "2026-10-01" }),
      entry({ id: "p2", settles: [target], settlement_request_id: "req-new", entry_date: "2026-10-05" }),
      entry({ id: "p3", settles: [target], settlement_request_id: "req-new", entry_date: "2026-10-05" }),
      entry({ id: "gas", settlement_request_id: "req-new" }),
      entry({ id: "legacy", settles: [target], entry_date: "2026-09-01" })
    ]);

    expect(candidates.map((candidate) => candidate.ref)).toEqual([
      { request_id: "req-new" },
      { request_id: "req-old" },
      { payment_id: "legacy" }
    ]);
  });
});
