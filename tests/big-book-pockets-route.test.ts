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

    selectEqMock.mockResolvedValue({
      data: [{ code: "BANK", name: "Bank", is_active: true, sort_order: 20 }],
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
      currency_code: "IDR",
      sort_order: 30
    });
  });

  it("returns a readable conflict when the pocket code already exists", async () => {
    selectEqMock.mockResolvedValueOnce({
      data: [{ code: "PETTY_CASH", name: "Petty Cash", is_active: true, sort_order: 20 }],
      error: null
    });

    const { POST } = await import("@/app/api/big-book/pockets/route");
    const request = new Request("https://app.localhost/api/big-book/pockets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actor_id: "11111111-1111-4111-8111-111111111111",
        code: "PETTY_CASH",
        name: "Cash Drawer"
      })
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toContain('already uses the code "PETTY_CASH"');
    expect(insertMock).not.toHaveBeenCalled();
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

  it("links a brand when creating a pocket", async () => {
    const { POST } = await import("@/app/api/big-book/pockets/route");
    const brandId = "33333333-3333-4333-8333-333333333333";
    const request = new Request("https://app.localhost/api/big-book/pockets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actor_id: "11111111-1111-4111-8111-111111111111",
        code: "BRAND_POCKET",
        name: "Brand Pocket",
        linked_brand_id: brandId
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(insertMock.mock.calls[0][0]).toMatchObject({
      linked_brand_id: brandId
    });
  });

  it("clears a linked brand via PATCH null", async () => {
    const { PATCH } = await import("@/app/api/big-book/pockets/route");
    const request = new Request("https://app.localhost/api/big-book/pockets", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "55555555-5555-4555-8555-555555555555",
        linked_brand_id: null
      })
    });
    const response = await PATCH(request);
    expect(response.status).toBe(200);
    expect(updateMock.mock.calls[0][0]).toMatchObject({ linked_brand_id: null });
  });

  it("returns 409 when linked brand is already claimed", async () => {
    insertSelectSingleMock.mockResolvedValueOnce({
      data: null,
      error: {
        code: "23505",
        message: 'duplicate key value violates unique constraint "uq_big_book_actor_pockets_linked_brand"',
        details: "Key (linked_brand_id)=(...) already exists."
      }
    });

    const { POST } = await import("@/app/api/big-book/pockets/route");
    const request = new Request("https://app.localhost/api/big-book/pockets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actor_id: "11111111-1111-4111-8111-111111111111",
        code: "OTHER",
        name: "Other Pocket",
        linked_brand_id: "33333333-3333-4333-8333-333333333333"
      })
    });

    const response = await POST(request);
    const data = await response.json();
    expect(response.status).toBe(409);
    expect(data.error).toBe("That brand is already linked to another pocket.");
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
