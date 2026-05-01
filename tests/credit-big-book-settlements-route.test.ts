import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminApiMock = vi.fn();
const assertCsrfAndOriginMock = vi.fn();
const insertMock = vi.fn();
const insertSelectSingleMock = vi.fn();
const updateMock = vi.fn();
const updateEqMock = vi.fn();
const deleteEqMock = vi.fn();
const deleteSelectMock = vi.fn();
const deleteMaybeSingleMock = vi.fn();
const entryMaybeSingleMock = vi.fn();
const entrySelectEqMock = vi.fn(() => ({ maybeSingle: entryMaybeSingleMock }));
const entrySelectMock = vi.fn(() => ({ eq: entrySelectEqMock }));
const getCreditBookSettlementsForEntryMock = vi.fn();

vi.mock("@/lib/auth-api", () => ({
  requireAdminApi: requireAdminApiMock
}));

vi.mock("@/lib/security/origin", () => ({
  assertCsrfAndOrigin: assertCsrfAndOriginMock,
  hasTrustedOrigin: vi.fn(() => true)
}));

vi.mock("@/lib/db/queries", () => ({
  getCreditBookSettlementsForEntry: getCreditBookSettlementsForEntryMock
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: vi.fn((table: string) => {
      if (table === "credit_ledger_settlements") {
        return {
          insert: insertMock,
          update: updateMock,
          delete: vi.fn(() => ({ eq: deleteEqMock }))
        };
      }
      if (table === "credit_ledger_entries") {
        return {
          select: entrySelectMock
        };
      }
      return {};
    })
  }))
}));

describe("credit big book settlements route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertCsrfAndOriginMock.mockResolvedValue(true);
    requireAdminApiMock.mockResolvedValue({
      ok: true,
      activeBrandId: "brand-1",
      user: { id: "auth-user-1" }
    });

    entryMaybeSingleMock.mockResolvedValue({
      data: { id: "11111111-1111-4111-8111-111111111111", brand_id: "brand-1" },
      error: null
    });
    insertMock.mockReturnValue({
      select: vi.fn(() => ({
        single: insertSelectSingleMock
      }))
    });
    insertSelectSingleMock.mockResolvedValue({
      data: { id: "settlement-1" },
      error: null
    });
    updateMock.mockReturnValue({
      eq: updateEqMock
    });
    updateEqMock.mockResolvedValue({ error: null });
    deleteEqMock.mockReturnValue({
      select: deleteSelectMock
    });
    deleteSelectMock.mockReturnValue({
      maybeSingle: deleteMaybeSingleMock
    });
    deleteMaybeSingleMock.mockResolvedValue({ data: { id: "settlement-1" }, error: null });
    getCreditBookSettlementsForEntryMock.mockResolvedValue([]);
  });

  it("creates a settlement for admin users", async () => {
    const { POST } = await import("@/app/api/credit-big-book/settlements/route");
    const request = new Request("https://app.localhost/api/credit-big-book/settlements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entry_id: "11111111-1111-4111-8111-111111111111",
        settlement_date: "2026-05-01",
        amount: 250.5,
        note: "First installment"
      })
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.id).toBe("settlement-1");
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock.mock.calls[0][0]).toMatchObject({
      entry_id: "11111111-1111-4111-8111-111111111111",
      settlement_date: "2026-05-01",
      amount: 250.5,
      note: "First installment"
    });
  });

  it("returns 400 when payload is invalid (missing amount)", async () => {
    const { POST } = await import("@/app/api/credit-big-book/settlements/route");
    const request = new Request("https://app.localhost/api/credit-big-book/settlements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entry_id: "11111111-1111-4111-8111-111111111111",
        settlement_date: "2026-05-01"
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("returns 403 for non-admin users on POST", async () => {
    requireAdminApiMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      message: "Admin access required"
    });
    const { POST } = await import("@/app/api/credit-big-book/settlements/route");
    const request = new Request("https://app.localhost/api/credit-big-book/settlements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entry_id: "11111111-1111-4111-8111-111111111111",
        settlement_date: "2026-05-01",
        amount: 100
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the parent entry does not exist", async () => {
    entryMaybeSingleMock.mockResolvedValueOnce({ data: null, error: null });
    const { POST } = await import("@/app/api/credit-big-book/settlements/route");
    const request = new Request("https://app.localhost/api/credit-big-book/settlements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entry_id: "11111111-1111-4111-8111-111111111111",
        settlement_date: "2026-05-01",
        amount: 100
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(404);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("surfaces trigger errors when settlement amount exceeds outstanding", async () => {
    insertSelectSingleMock.mockResolvedValueOnce({
      data: null,
      error: { message: "settlement amount 100 exceeds outstanding balance" }
    });
    const { POST } = await import("@/app/api/credit-big-book/settlements/route");
    const request = new Request("https://app.localhost/api/credit-big-book/settlements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entry_id: "11111111-1111-4111-8111-111111111111",
        settlement_date: "2026-05-01",
        amount: 100
      })
    });

    const response = await POST(request);
    const data = await response.json();
    expect(response.status).toBe(400);
    expect(data.error).toContain("exceeds outstanding");
  });

  it("updates a settlement on PATCH", async () => {
    const { PATCH } = await import("@/app/api/credit-big-book/settlements/route");
    const request = new Request("https://app.localhost/api/credit-big-book/settlements", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "44444444-4444-4444-8444-444444444444",
        amount: 75,
        note: "Adjusted"
      })
    });

    const response = await PATCH(request);
    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock.mock.calls[0][0]).toMatchObject({
      amount: 75,
      note: "Adjusted"
    });
  });

  it("deletes a settlement on DELETE", async () => {
    const { DELETE } = await import("@/app/api/credit-big-book/settlements/route");
    const request = new Request(
      "https://app.localhost/api/credit-big-book/settlements?id=44444444-4444-4444-8444-444444444444",
      { method: "DELETE" }
    );

    const response = await DELETE(request);
    expect(response.status).toBe(200);
    expect(deleteEqMock).toHaveBeenCalledWith("id", "44444444-4444-4444-8444-444444444444");
  });

  it("returns 400 on DELETE without id param", async () => {
    const { DELETE } = await import("@/app/api/credit-big-book/settlements/route");
    const request = new Request("https://app.localhost/api/credit-big-book/settlements", {
      method: "DELETE"
    });

    const response = await DELETE(request);
    expect(response.status).toBe(400);
    expect(deleteEqMock).not.toHaveBeenCalled();
  });

  it("lists settlements for entry on GET", async () => {
    getCreditBookSettlementsForEntryMock.mockResolvedValueOnce([
      {
        id: "settlement-1",
        entry_id: "11111111-1111-4111-8111-111111111111",
        settlement_date: "2026-05-01",
        amount: 100,
        note: null,
        created_by: null,
        updated_by: null,
        created_at: "2026-05-01T00:00:00Z",
        updated_at: "2026-05-01T00:00:00Z",
        creator_display_name: "-",
        updater_display_name: "-",
        attachments: []
      }
    ]);

    const { GET } = await import("@/app/api/credit-big-book/settlements/route");
    const request = new Request(
      "https://app.localhost/api/credit-big-book/settlements?entryId=11111111-1111-4111-8111-111111111111"
    );

    const response = await GET(request);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(getCreditBookSettlementsForEntryMock).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111"
    );
    expect(Array.isArray(data.settlements)).toBe(true);
    expect(data.settlements).toHaveLength(1);
  });

  it("returns 400 when GET has invalid entryId", async () => {
    const { GET } = await import("@/app/api/credit-big-book/settlements/route");
    const request = new Request(
      "https://app.localhost/api/credit-big-book/settlements?entryId=not-a-uuid"
    );

    const response = await GET(request);
    expect(response.status).toBe(400);
    expect(getCreditBookSettlementsForEntryMock).not.toHaveBeenCalled();
  });
});
