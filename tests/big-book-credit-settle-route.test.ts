import { beforeEach, describe, expect, it, vi } from "vitest";

const updateMock = vi.fn();
const updateEqIdMock = vi.fn().mockResolvedValue({ error: null });
const lookupMaybeSingleMock = vi.fn();
const lookupEqMock = vi.fn(() => ({ maybeSingle: lookupMaybeSingleMock }));
const lookupSelectMock = vi.fn(() => ({ eq: lookupEqMock }));
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
          select: lookupSelectMock,
          update: updateMock
        };
      }
      return {};
    })
  }))
}));

describe("big book credit settle route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertCsrfAndOriginMock.mockResolvedValue(true);
    requireAdminApiMock.mockResolvedValue({
      ok: true,
      activeBrandId: "brand-1",
      user: { id: "auth-user-1" }
    });
    updateMock.mockReturnValue({ eq: updateEqIdMock });
    lookupMaybeSingleMock.mockResolvedValue({
      data: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", is_credit: true, is_debt: false },
      error: null
    });
  });

  it("marks a credit as settled", async () => {
    const { PATCH } = await import("@/app/api/big-book/entries/settle/route");
    const request = new Request("https://app.localhost/api/big-book/entries/settle", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        settled: true,
        note: "Vendor paid in full"
      })
    });

    const response = await PATCH(request);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data).toEqual({ ok: true, settled: true, kind: "credit" });
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        credit_settled_by: "auth-user-1",
        credit_settlement_note: "Vendor paid in full",
        updated_by: "auth-user-1"
      })
    );
    expect(typeof updateMock.mock.calls[0][0].credit_settled_at).toBe("string");
    expect(updateEqIdMock).toHaveBeenCalledWith("id", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  });

  it("reopens a settled credit", async () => {
    const { PATCH } = await import("@/app/api/big-book/entries/settle/route");
    const request = new Request("https://app.localhost/api/big-book/entries/settle", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        settled: false
      })
    });

    const response = await PATCH(request);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data).toEqual({ ok: true, settled: false, kind: "credit" });
    expect(updateMock).toHaveBeenCalledWith({
      credit_settled_at: null,
      credit_settled_by: null,
      credit_settlement_note: null,
      updated_by: "auth-user-1"
    });
  });

  it("marks a debt as settled", async () => {
    lookupMaybeSingleMock.mockResolvedValueOnce({
      data: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", is_credit: false, is_debt: true },
      error: null
    });

    const { PATCH } = await import("@/app/api/big-book/entries/settle/route");
    const request = new Request("https://app.localhost/api/big-book/entries/settle", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        settled: true,
        note: "Paid vendor"
      })
    });

    const response = await PATCH(request);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data).toEqual({ ok: true, settled: true, kind: "debt" });
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        debt_settled_by: "auth-user-1",
        debt_settlement_note: "Paid vendor",
        updated_by: "auth-user-1"
      })
    );
  });

  it("rejects non-credit non-debt targets", async () => {
    lookupMaybeSingleMock.mockResolvedValueOnce({
      data: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", is_credit: false, is_debt: false },
      error: null
    });

    const { PATCH } = await import("@/app/api/big-book/entries/settle/route");
    const request = new Request("https://app.localhost/api/big-book/entries/settle", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        settled: true
      })
    });

    const response = await PATCH(request);
    const data = await response.json();
    expect(response.status).toBe(400);
    expect(data.error).toMatch(/credit or debt/i);
    expect(updateMock).not.toHaveBeenCalled();
  });
});
