import { beforeEach, describe, expect, it, vi } from "vitest";

const insertMock = vi.fn();
const insertSelectSingleMock = vi.fn();
const updateMock = vi.fn();
const updateEqMock = vi.fn();
const deleteSelectMaybeSingleMock = vi.fn();
const deleteSelectMock = vi.fn(() => ({ maybeSingle: deleteSelectMaybeSingleMock }));
const deleteEqMock = vi.fn(() => ({ select: deleteSelectMock }));
const selectListMock = vi.fn();

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
      if (table === "business_ledger_action_by") {
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

describe("big book action-by route", () => {
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
      data: { id: "action-by-1" },
      error: null
    });

    updateMock.mockReturnValue({ eq: updateEqMock });
    updateEqMock.mockResolvedValue({ error: null });

    selectListMock.mockResolvedValue({
      data: [{ code: "JOHN", name: "John", is_active: true, sort_order: 20 }],
      error: null
    });

    deleteSelectMaybeSingleMock.mockResolvedValue({
      data: { id: "55555555-5555-4555-8555-555555555555" },
      error: null
    });
  });

  it("creates a new Action By", async () => {
    const { POST } = await import("@/app/api/big-book/action-by/route");
    const request = new Request("https://app.localhost/api/big-book/action-by", {
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
    expect(data.id).toBe("action-by-1");
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock.mock.calls[0][0]).toMatchObject({
      code: "JANE",
      name: "Jane",
      sort_order: 30
    });
  });

  it("returns a readable conflict when the Action By code already exists", async () => {
    const { POST } = await import("@/app/api/big-book/action-by/route");
    const request = new Request("https://app.localhost/api/big-book/action-by", {
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
    const { POST } = await import("@/app/api/big-book/action-by/route");
    const request = new Request("https://app.localhost/api/big-book/action-by", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: "m",
        name: "x"
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("rejects non-admin create", async () => {
    requireAdminApiMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      message: "Admin access required."
    });
    const { POST } = await import("@/app/api/big-book/action-by/route");
    const request = new Request("https://app.localhost/api/big-book/action-by", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: "JANE",
        name: "Jane"
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("renames an Action By via PATCH", async () => {
    const { PATCH } = await import("@/app/api/big-book/action-by/route");
    const request = new Request("https://app.localhost/api/big-book/action-by", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "55555555-5555-4555-8555-555555555555",
        code: "JANE_DOE",
        name: "Jane Doe"
      })
    });
    const response = await PATCH(request);
    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock.mock.calls[0][0]).toEqual({
      code: "JANE_DOE",
      name: "Jane Doe"
    });
  });

  it("toggles Action By active state via PATCH", async () => {
    const { PATCH } = await import("@/app/api/big-book/action-by/route");
    const request = new Request("https://app.localhost/api/big-book/action-by", {
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

  it("deletes an Action By", async () => {
    const { DELETE } = await import("@/app/api/big-book/action-by/route");
    const request = new Request(
      "https://app.localhost/api/big-book/action-by?id=55555555-5555-4555-8555-555555555555",
      { method: "DELETE" }
    );
    const response = await DELETE(request);
    expect(response.status).toBe(200);
    expect(deleteEqMock).toHaveBeenCalledWith("id", "55555555-5555-4555-8555-555555555555");
  });

  it("rejects DELETE without id", async () => {
    const { DELETE } = await import("@/app/api/big-book/action-by/route");
    const request = new Request("https://app.localhost/api/big-book/action-by", {
      method: "DELETE"
    });
    const response = await DELETE(request);
    expect(response.status).toBe(400);
  });
});
