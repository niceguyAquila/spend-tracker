import { beforeEach, describe, expect, it, vi } from "vitest";

const insertMock = vi.fn();
const updateMock = vi.fn();
const deleteMaybeSingleMock = vi.fn();
const deleteSelectMock = vi.fn(() => ({ maybeSingle: deleteMaybeSingleMock }));
const deleteEqBrandMock = vi.fn(() => ({ select: deleteSelectMock }));
const deleteEqIdMock = vi.fn(() => ({ eq: deleteEqBrandMock }));
const updateEqIdMock = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }));
const insertSelectSingleMock = vi.fn();
const requireAdminApiMock = vi.fn();
const assertCsrfAndOriginMock = vi.fn();
const getCreditBookEntriesPagedMock = vi.fn();

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
      if (table === "credit_ledger_entries") {
        return {
          insert: insertMock,
          update: updateMock,
          delete: vi.fn(() => ({ eq: deleteEqIdMock }))
        };
      }
      return {};
    })
  }))
}));

vi.mock("@/lib/db/queries", () => ({
  getCreditBookEntriesPaged: getCreditBookEntriesPagedMock
}));

describe("credit big book entries route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertCsrfAndOriginMock.mockResolvedValue(true);
    requireAdminApiMock.mockResolvedValue({
      ok: true,
      activeBrandId: "brand-1",
      user: { id: "auth-user-1" }
    });

    insertMock.mockReturnValue({
      select: vi.fn(() => ({
        single: insertSelectSingleMock
      }))
    });
    insertSelectSingleMock.mockResolvedValue({
      data: { id: "entry-1" },
      error: null
    });
    updateMock.mockReturnValue({
      eq: updateEqIdMock
    });
    deleteMaybeSingleMock.mockResolvedValue({ data: { id: "entry-1" }, error: null });
    getCreditBookEntriesPagedMock.mockResolvedValue({
      rows: [],
      totalCount: 0
    });
  });

  it("creates an entry for admin users", async () => {
    const { POST } = await import("@/app/api/credit-big-book/entries/route");
    const request = new Request("https://app.localhost/api/credit-big-book/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entry_date: "2026-04-23",
        entry_direction: "debt",
        entry_type_id: "11111111-1111-4111-8111-111111111111",
        explanation: "Vendor invoice",
        amount: 1240.5,
        currency_code: "USDT",
        remark: "Monthly run rate",
        responsible_actor_id: "22222222-2222-4222-8222-222222222222"
      })
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.id).toBe("entry-1");
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock.mock.calls[0][0]).toMatchObject({
      entry_sub_type_id: null,
      entry_direction: "debt"
    });
  });

  it("persists entry_sub_type_id on create when provided", async () => {
    const { POST } = await import("@/app/api/credit-big-book/entries/route");
    const request = new Request("https://app.localhost/api/credit-big-book/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entry_date: "2026-04-23",
        entry_direction: "credit",
        entry_type_id: "11111111-1111-4111-8111-111111111111",
        entry_sub_type_id: "44444444-4444-4444-8444-444444444444",
        explanation: "Customer payment",
        amount: 1240.5,
        currency_code: "USDT",
        remark: "",
        responsible_actor_id: "22222222-2222-4222-8222-222222222222"
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(insertMock.mock.calls[0][0]).toMatchObject({
      entry_sub_type_id: "44444444-4444-4444-8444-444444444444",
      entry_direction: "credit"
    });
  });

  it("persists entry_sub_type_id on patch when provided", async () => {
    const { PATCH } = await import("@/app/api/credit-big-book/entries/route");
    const request = new Request("https://app.localhost/api/credit-big-book/entries", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "55555555-5555-4555-8555-555555555555",
        entry_date: "2026-04-23",
        entry_direction: "debt",
        entry_type_id: "11111111-1111-4111-8111-111111111111",
        entry_sub_type_id: "44444444-4444-4444-8444-444444444444",
        explanation: "Vendor invoice",
        amount: 1240.5,
        currency_code: "USDT",
        remark: "",
        responsible_actor_id: "22222222-2222-4222-8222-222222222222"
      })
    });

    const response = await PATCH(request);
    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock.mock.calls[0][0]).toMatchObject({
      entry_sub_type_id: "44444444-4444-4444-8444-444444444444"
    });
  });

  it("returns 403 when non-admin tries to create entry", async () => {
    requireAdminApiMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      message: "Admin access required"
    });
    const { POST } = await import("@/app/api/credit-big-book/entries/route");
    const request = new Request("https://app.localhost/api/credit-big-book/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
  });

  it("parses repeated categorical query params for GET list", async () => {
    const { GET } = await import("@/app/api/credit-big-book/entries/route");
    const request = new Request(
      "https://app.localhost/api/credit-big-book/entries?page=1&pageSize=25&typeId=11111111-1111-4111-8111-111111111111&typeId=22222222-2222-4222-8222-222222222222&currencyCode=USDT&currencyCode=IDR&actorId=33333333-3333-4333-8333-333333333333&direction=credit&direction=debt&query=test"
    );

    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(getCreditBookEntriesPagedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        pageSize: 25,
        typeId: ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"],
        currencyCode: ["USDT", "IDR"],
        actorId: ["33333333-3333-4333-8333-333333333333"],
        direction: ["credit", "debt"],
        query: "test"
      })
    );
  });

  it("forwards status filter values to paged query", async () => {
    const { GET } = await import("@/app/api/credit-big-book/entries/route");
    const request = new Request(
      "https://app.localhost/api/credit-big-book/entries?status=open&status=partial"
    );

    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(getCreditBookEntriesPagedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: ["open", "partial"]
      })
    );
  });

  it("returns 400 when GET receives an invalid status value", async () => {
    const { GET } = await import("@/app/api/credit-big-book/entries/route");
    const request = new Request("https://app.localhost/api/credit-big-book/entries?status=closed");

    const response = await GET(request);
    expect(response.status).toBe(400);
    expect(getCreditBookEntriesPagedMock).not.toHaveBeenCalled();
  });

  it("returns 400 when GET has invalid categorical values", async () => {
    const { GET } = await import("@/app/api/credit-big-book/entries/route");
    const request = new Request("https://app.localhost/api/credit-big-book/entries?direction=invalid");

    const response = await GET(request);
    expect(response.status).toBe(400);
    expect(getCreditBookEntriesPagedMock).not.toHaveBeenCalled();
  });

  it("returns 400 when GET has Transaction Big Book direction values", async () => {
    const { GET } = await import("@/app/api/credit-big-book/entries/route");
    const request = new Request("https://app.localhost/api/credit-big-book/entries?direction=spending");

    const response = await GET(request);
    expect(response.status).toBe(400);
    expect(getCreditBookEntriesPagedMock).not.toHaveBeenCalled();
  });

  it("deletes entry and returns 200", async () => {
    const { DELETE } = await import("@/app/api/credit-big-book/entries/route");
    const request = new Request("https://app.localhost/api/credit-big-book/entries?id=entry-1", {
      method: "DELETE"
    });

    const response = await DELETE(request);
    expect(response.status).toBe(200);
    expect(deleteEqIdMock).toHaveBeenCalledWith("id", "entry-1");
    expect(deleteEqBrandMock).toHaveBeenCalledWith("brand_id", "brand-1");
  });
});
