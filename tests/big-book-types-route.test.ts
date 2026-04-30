import { beforeEach, describe, expect, it, vi } from "vitest";

const insertMock = vi.fn();
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
  });
});
