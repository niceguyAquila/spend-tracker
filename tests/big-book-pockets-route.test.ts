import { beforeEach, describe, expect, it, vi } from "vitest";

const insertMock = vi.fn();
const insertSelectSingleMock = vi.fn();
const updateMock = vi.fn();
const updateEqMock = vi.fn();
const deleteSelectMaybeSingleMock = vi.fn();
const deleteSelectMock = vi.fn(() => ({ maybeSingle: deleteSelectMaybeSingleMock }));
const deleteEqMock = vi.fn(() => ({ select: deleteSelectMock }));
const selectMaybeSingleMock = vi.fn();
const selectListMock = vi.fn(() => ({
  eq: vi.fn(() => ({
    order: vi.fn(() => ({
      limit: vi.fn(() => ({ maybeSingle: selectMaybeSingleMock }))
    }))
  }))
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
      if (table === "big_book_actor_pockets") {
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

describe("big book pockets route", () => {
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
      data: { id: "pocket-1" },
      error: null
    });

    updateMock.mockReturnValue({ eq: updateEqMock });
    updateEqMock.mockResolvedValue({ error: null });

    selectMaybeSingleMock.mockResolvedValue({
      data: { sort_order: 20 },
      error: null
    });

    deleteSelectMaybeSingleMock.mockResolvedValue({ data: { id: "pocket-1" }, error: null });
  });

  it("creates a new pocket with IDR currency", async () => {
    const { POST } = await import("@/app/api/big-book/pockets/route");
    const request = new Request("https://app.localhost/api/big-book/pockets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actor_id: "11111111-1111-4111-8111-111111111111",
        code: "PETTY_CASH",
        name: "Petty Cash"
      })
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.id).toBe("pocket-1");
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock.mock.calls[0][0]).toMatchObject({
      actor_id: "11111111-1111-4111-8111-111111111111",
      code: "PETTY_CASH",
      name: "Petty Cash",
      currency_code: "IDR"
    });
  });

  it("rejects non-IDR currency_code", async () => {
    const { POST } = await import("@/app/api/big-book/pockets/route");
    const request = new Request("https://app.localhost/api/big-book/pockets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actor_id: "11111111-1111-4111-8111-111111111111",
        code: "PETTY_CASH",
        name: "Petty Cash",
        currency_code: "MYR"
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("rejects invalid create payload", async () => {
    const { POST } = await import("@/app/api/big-book/pockets/route");
    const request = new Request("https://app.localhost/api/big-book/pockets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actor_id: "not-a-uuid",
        code: "r",
        name: "x"
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("updates a pocket via PATCH", async () => {
    const { PATCH } = await import("@/app/api/big-book/pockets/route");
    const request = new Request("https://app.localhost/api/big-book/pockets", {
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

  it("deletes a pocket via DELETE", async () => {
    const { DELETE } = await import("@/app/api/big-book/pockets/route");
    const request = new Request(
      "https://app.localhost/api/big-book/pockets?id=55555555-5555-4555-8555-555555555555",
      { method: "DELETE" }
    );
    const response = await DELETE(request);
    expect(response.status).toBe(200);
    expect(deleteEqMock).toHaveBeenCalledWith("id", "55555555-5555-4555-8555-555555555555");
  });

  it("returns 400 when DELETE has no id", async () => {
    const { DELETE } = await import("@/app/api/big-book/pockets/route");
    const request = new Request("https://app.localhost/api/big-book/pockets", {
      method: "DELETE"
    });
    const response = await DELETE(request);
    expect(response.status).toBe(400);
  });
});
