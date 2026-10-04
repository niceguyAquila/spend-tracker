import { beforeEach, describe, expect, it, vi } from "vitest";

const EXPECTED_UPDATED_AT = "2026-04-23T10:00:00.000Z";
const ENTRY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const updateMock = vi.fn();
const updateMaybeSingleMock = vi.fn();
const updateSelectMock = vi.fn(() => ({ maybeSingle: updateMaybeSingleMock }));
const updateEqUpdatedAtMock = vi.fn(() => ({ select: updateSelectMock }));
const updateEqIdMock = vi.fn(() => ({ eq: updateEqUpdatedAtMock }));
const lookupMaybeSingleMock = vi.fn();
const lookupEqMock = vi.fn(() => ({ maybeSingle: lookupMaybeSingleMock }));
const lookupSelectMock = vi.fn(() => ({ eq: lookupEqMock }));
const settleCountMock = vi.fn();
const settleHeadEqMock = vi.fn(() => settleCountMock());
const settleSelectMock = vi.fn(() => ({
  eq: settleHeadEqMock
}));
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
    from: vi.fn((table: string) => {
      if (table === "business_ledger_entries") {
        return {
          select: (...args: unknown[]) => {
            const options = args[1] as { count?: string; head?: boolean } | undefined;
            if (options?.head) return settleSelectMock();
            return lookupSelectMock();
          },
          update: updateMock
        };
      }
      return {};
    })
  }))
}));

describe("big book credit actualize route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertCsrfAndOriginMock.mockResolvedValue(true);
    requireAdminApiMock.mockResolvedValue({
      ok: true,
      activeBrandId: "brand-1",
      user: { id: "auth-user-1" }
    });
    updateMock.mockReturnValue({ eq: updateEqIdMock });
    updateMaybeSingleMock.mockResolvedValue({
      data: { id: ENTRY_ID, updated_at: EXPECTED_UPDATED_AT },
      error: null
    });
    lookupMaybeSingleMock.mockResolvedValue({
      data: {
        id: ENTRY_ID,
        is_credit: true,
        is_future_credit: true,
        is_debt: false,
        credit_settled_at: null,
        updated_at: EXPECTED_UPDATED_AT
      },
      error: null
    });
    settleCountMock.mockResolvedValue({ count: 0, error: null });
  });

  it("actualizes Future Credit to Credit", async () => {
    const { PATCH } = await import("@/app/api/big-book/entries/actualize/route");
    const request = new Request("https://app.localhost/api/big-book/entries/actualize", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: ENTRY_ID,
        expected_updated_at: EXPECTED_UPDATED_AT,
        actualized: true
      })
    });

    const response = await PATCH(request);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data).toEqual({
      ok: true,
      actualized: true,
      updated_at: EXPECTED_UPDATED_AT
    });
    expect(updateMock).toHaveBeenCalledWith({
      is_future_credit: false,
      updated_by: "auth-user-1"
    });
  });

  it("rejects demotion when settlements exist", async () => {
    lookupMaybeSingleMock.mockResolvedValue({
      data: {
        id: ENTRY_ID,
        is_credit: true,
        is_future_credit: false,
        is_debt: false,
        credit_settled_at: null,
        updated_at: EXPECTED_UPDATED_AT
      },
      error: null
    });
    settleCountMock.mockResolvedValue({ count: 2, error: null });

    const { PATCH } = await import("@/app/api/big-book/entries/actualize/route");
    const request = new Request("https://app.localhost/api/big-book/entries/actualize", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: ENTRY_ID,
        expected_updated_at: EXPECTED_UPDATED_AT,
        actualized: false
      })
    });

    const response = await PATCH(request);
    const data = await response.json();
    expect(response.status).toBe(400);
    expect(String(data.error)).toMatch(/settlements exist/i);
    expect(updateMock).not.toHaveBeenCalled();
  });
});
