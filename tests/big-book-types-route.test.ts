import { beforeEach, describe, expect, it, vi } from "vitest";

const insertMock = vi.fn();
// POST loads every existing type via select("code, name, is_active, sort_order")
// for the duplicate check and the next sort_order.
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
    from: vi.fn(() => ({
      select: selectListMock,
      insert: insertMock
    }))
  }))
}));

describe("big book types route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertCsrfAndOriginMock.mockResolvedValue(true);
    requireAdminApiMock.mockResolvedValue({
      ok: true,
      user: { id: "admin-1" },
      activeBrandId: "brand-1"
    });
    insertMock.mockReturnValue({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({ data: { id: "type-1" }, error: null })
      }))
    });
    selectListMock.mockResolvedValue({
      data: [{ code: "OPERATIONAL", name: "Operational", is_active: true, sort_order: 10 }],
      error: null
    });
  });

  it("creates a new ledger type", async () => {
    const { POST } = await import("@/app/api/big-book/types/route");
    const request = new Request("https://app.localhost/api/big-book/types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: "PARTNER_REBATE",
        name: "Partner Rebate",
        sort_order: 50
      })
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.id).toBe("type-1");
    expect(insertMock.mock.calls[0][0]).toMatchObject({
      code: "PARTNER_REBATE",
      name: "Partner Rebate",
      sort_order: 20
    });
  });

  it("returns a readable conflict when the type name already exists", async () => {
    const { POST } = await import("@/app/api/big-book/types/route");
    const request = new Request("https://app.localhost/api/big-book/types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: "OPS",
        name: "operational"
      })
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toContain('already uses the name "operational"');
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("explains which rule a malformed code broke", async () => {
    const { POST } = await import("@/app/api/big-book/types/route");
    const request = new Request("https://app.localhost/api/big-book/types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: "PARTNER REBATE",
        name: "Partner Rebate"
      })
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error.fieldErrors.code[0]).toContain("uppercase letters, numbers, and underscores");
    expect(insertMock).not.toHaveBeenCalled();
  });
});
