import { beforeEach, describe, expect, it, vi } from "vitest";

const insertMock = vi.fn();
const insertSelectSingleMock = vi.fn();
const updateMock = vi.fn();
const updateEqIdMock = vi.fn();
const updateEqBrandMock = vi.fn();
const deleteSelectMaybeSingleMock = vi.fn();
const deleteSelectMock = vi.fn(() => ({ maybeSingle: deleteSelectMaybeSingleMock }));
const deleteEqBrandMock = vi.fn(() => ({ select: deleteSelectMock }));
const deleteEqIdMock = vi.fn(() => ({ eq: deleteEqBrandMock }));
const selectListMock = vi.fn();
const selectEqMock = vi.fn();

const requireFinanceApiMock = vi.fn();
const assertCsrfAndOriginMock = vi.fn();

vi.mock("@/lib/security/origin", () => ({
  assertCsrfAndOrigin: assertCsrfAndOriginMock,
  hasTrustedOrigin: vi.fn(() => true)
}));

vi.mock("@/lib/auth-api", () => ({
  requireFinanceApi: requireFinanceApiMock
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: vi.fn((table: string) => {
      if (table === "expense_staff") {
        return {
          select: selectListMock,
          insert: insertMock,
          update: updateMock,
          delete: vi.fn(() => ({ eq: deleteEqIdMock }))
        };
      }
      return {};
    })
  }))
}));

describe("expense-staff route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertCsrfAndOriginMock.mockResolvedValue(true);
    requireFinanceApiMock.mockResolvedValue({
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
      data: { id: "staff-1" },
      error: null
    });

    updateMock.mockReturnValue({ eq: updateEqIdMock });
    updateEqIdMock.mockReturnValue({ eq: updateEqBrandMock });
    updateEqBrandMock.mockResolvedValue({ error: null });

    selectEqMock.mockResolvedValue({
      data: [{ code: "JOHN", name: "John", is_active: true, sort_order: 20 }],
      error: null
    });
    selectListMock.mockReturnValue({
      eq: selectEqMock,
      order: vi.fn(() => ({
        order: vi.fn(async () => ({
          data: [{ id: "staff-1", code: "JOHN", name: "John", is_active: true, sort_order: 20 }],
          error: null
        }))
      }))
    });

    deleteSelectMaybeSingleMock.mockResolvedValue({
      data: { id: "55555555-5555-4555-8555-555555555555" },
      error: null
    });
  });

  it("creates a new staff member scoped to the active brand", async () => {
    const { POST } = await import("@/app/api/expense-staff/route");
    const request = new Request("https://app.localhost/api/expense-staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: "JANE",
        name: "Jane"
      })
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.id).toBe("staff-1");
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock.mock.calls[0][0]).toMatchObject({
      brand_id: "brand-1",
      code: "JANE",
      name: "Jane",
      sort_order: 30
    });
  });

  it("returns a readable conflict when the staff code already exists", async () => {
    const { POST } = await import("@/app/api/expense-staff/route");
    const request = new Request("https://app.localhost/api/expense-staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: "JOHN",
        name: "Jonathan"
      })
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toContain('already uses the code "JOHN"');
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("rejects invalid create payload", async () => {
    const { POST } = await import("@/app/api/expense-staff/route");
    const request = new Request("https://app.localhost/api/expense-staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "X", name: "Y" })
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("updates a staff member for the active brand", async () => {
    const { PATCH } = await import("@/app/api/expense-staff/route");
    const request = new Request("https://app.localhost/api/expense-staff", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "55555555-5555-4555-8555-555555555555",
        name: "John Updated"
      })
    });

    const response = await PATCH(request);
    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith({ name: "John Updated" });
    expect(updateEqIdMock).toHaveBeenCalledWith("id", "55555555-5555-4555-8555-555555555555");
    expect(updateEqBrandMock).toHaveBeenCalledWith("brand_id", "brand-1");
  });

  it("deletes a staff member for the active brand", async () => {
    const { DELETE } = await import("@/app/api/expense-staff/route");
    const response = await DELETE(
      new Request("https://app.localhost/api/expense-staff?id=55555555-5555-4555-8555-555555555555", {
        method: "DELETE"
      })
    );
    expect(response.status).toBe(200);
    expect(deleteEqIdMock).toHaveBeenCalledWith("id", "55555555-5555-4555-8555-555555555555");
    expect(deleteEqBrandMock).toHaveBeenCalledWith("brand_id", "brand-1");
  });
});
