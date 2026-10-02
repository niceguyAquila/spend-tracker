import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminApiMock = vi.fn();
const assertCsrfAndOriginMock = vi.fn();
const insertMock = vi.fn();
const updateMock = vi.fn();
const selectInMock = vi.fn();

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
      if (table !== "business_ledger_entries") return {};
      return {
        select: vi.fn(() => ({
          in: selectInMock
        })),
        insert: insertMock,
        update: updateMock
      };
    })
  }))
}));

const CREDIT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CREDIT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("big book bulk settle route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertCsrfAndOriginMock.mockResolvedValue(true);
    requireAdminApiMock.mockResolvedValue({
      ok: true,
      activeBrandId: "brand-1",
      user: { id: "auth-user-1" }
    });

    selectInMock.mockResolvedValue({
      data: [
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
      ],
      error: null
    });

    insertMock.mockReturnValue({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({ data: { id: "settle-1" }, error: null })
      }))
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
      expect.objectContaining({
        amount: 150,
        settles_entry_id: CREDIT_A,
        currency_code: "USDT",
        is_credit: false
      })
    );
  });

  it("allows IDR settle against MYR credits without credit-currency amount", async () => {
    selectInMock.mockResolvedValue({
      data: [
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
      ],
      error: null
    });

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
      expect.objectContaining({
        amount: 1500000,
        currency_code: "IDR",
        settlement_conversion_rate: null,
        settlement_amount_in_credit_currency: null,
        settles_entry_id: CREDIT_A
      })
    );
  });

  it("allows USDT settle against MYR credits without a conversion rate", async () => {
    selectInMock.mockResolvedValue({
      data: [
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
      ],
      error: null
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
        amount: 95
      })
    });

    const response = await POST(request);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.mode).toBe("single");
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 95,
        currency_code: "USDT",
        settlement_conversion_rate: null,
        settlement_amount_in_credit_currency: null,
        settles_entry_id: CREDIT_A
      })
    );
  });

  it("applies USDT conversion rate for a single combined settlement", async () => {
    selectInMock.mockResolvedValue({
      data: [
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
      ],
      error: null
    });

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
      expect.objectContaining({
        amount: 150,
        currency_code: "USDT",
        settlement_conversion_rate: 4.2,
        settlement_amount_in_credit_currency: 630,
        settles_entry_id: CREDIT_A
      })
    );
  });

  it("creates one settlement per credit when mode is per_credit", async () => {
    insertMock.mockReturnValue({
      select: vi.fn().mockResolvedValue({
        data: [{ id: "settle-a" }, { id: "settle-b" }],
        error: null
      })
    });

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
