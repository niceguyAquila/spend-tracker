import { beforeEach, describe, expect, it, vi } from "vitest";

const insertMock = vi.fn();
const insertSelectSingleMock = vi.fn();
const updateMock = vi.fn();
const updateEqMock = vi.fn();
const deleteSelectMaybeSingleMock = vi.fn();
const deleteSelectMock = vi.fn(() => ({ maybeSingle: deleteSelectMaybeSingleMock }));
const deleteEqMock = vi.fn(() => ({ select: deleteSelectMock }));
const selectEqMock = vi.fn();
const selectListMock = vi.fn(() => ({ eq: selectEqMock }));

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
      if (table === "credit_ledger_sub_types") {
        return {
          select: selectListMock,
          insert: insertMock,
          update: updateMock,
          delete: vi.fn(() => ({ eq: deleteEqMock }))
        };
      }
      return {};
    })
  }))
}));

describe("credit big book sub-types route", () => {
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
      data: { id: "sub-type-1" },
      error: null
    });

    updateMock.mockReturnValue({ eq: updateEqMock });
    updateEqMock.mockResolvedValue({ error: null });

    selectEqMock.mockResolvedValue({
      data: [{ code: "DEPOSIT", name: "Deposit", is_active: true, sort_order: 20 }],
      error: null
    });

    deleteSelectMaybeSingleMock.mockResolvedValue({ data: { id: "sub-type-1" }, error: null });
  });

  it("creates a new sub-type", async () => {
    const { POST } = await import("@/app/api/credit-big-book/sub-types/route");
    const request = new Request("https://app.localhost/api/credit-big-book/sub-types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entry_type_id: "11111111-1111-4111-8111-111111111111",
        code: "INVOICE",
        name: "Invoice"
      })
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.id).toBe("sub-type-1");
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock.mock.calls[0][0]).toMatchObject({
      entry_type_id: "11111111-1111-4111-8111-111111111111",
      code: "INVOICE",
      name: "Invoice",
      sort_order: 30
    });
  });

  it("returns a readable conflict when the code already exists", async () => {
    selectEqMock.mockResolvedValueOnce({
      data: [{ code: "INVOICE", name: "Invoice", is_active: true, sort_order: 20 }],
      error: null
    });

    const { POST } = await import("@/app/api/credit-big-book/sub-types/route");
    const request = new Request("https://app.localhost/api/credit-big-book/sub-types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entry_type_id: "11111111-1111-4111-8111-111111111111",
        code: "INVOICE",
        name: "Customer Invoice"
      })
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toContain('already uses the code "INVOICE"');
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("rejects invalid create payload", async () => {
    const { POST } = await import("@/app/api/credit-big-book/sub-types/route");
    const request = new Request("https://app.localhost/api/credit-big-book/sub-types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entry_type_id: "not-a-uuid",
        code: "inv",
        name: "x"
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("returns 403 for non-admin on POST", async () => {
    requireAdminApiMock.mockResolvedValueOnce({ ok: false, status: 403, message: "Admin only" });
    const { POST } = await import("@/app/api/credit-big-book/sub-types/route");
    const request = new Request("https://app.localhost/api/credit-big-book/sub-types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    const response = await POST(request);
    expect(response.status).toBe(403);
  });

  it("updates a sub-type via PATCH", async () => {
    const { PATCH } = await import("@/app/api/credit-big-book/sub-types/route");
    const request = new Request("https://app.localhost/api/credit-big-book/sub-types", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "55555555-5555-4555-8555-555555555555",
        is_active: false
      })
    });
    const response = await PATCH(request);
    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock.mock.calls[0][0]).toMatchObject({ is_active: false });
  });

  it("deletes a sub-type via DELETE", async () => {
    const { DELETE } = await import("@/app/api/credit-big-book/sub-types/route");
    const request = new Request(
      "https://app.localhost/api/credit-big-book/sub-types?id=55555555-5555-4555-8555-555555555555",
      { method: "DELETE" }
    );
    const response = await DELETE(request);
    expect(response.status).toBe(200);
    expect(deleteEqMock).toHaveBeenCalledWith(
      "id",
      "55555555-5555-4555-8555-555555555555"
    );
  });

  it("returns 400 when DELETE has no id", async () => {
    const { DELETE } = await import("@/app/api/credit-big-book/sub-types/route");
    const request = new Request("https://app.localhost/api/credit-big-book/sub-types", {
      method: "DELETE"
    });
    const response = await DELETE(request);
    expect(response.status).toBe(400);
  });
});
