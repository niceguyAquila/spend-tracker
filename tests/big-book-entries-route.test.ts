import { beforeEach, describe, expect, it, vi } from "vitest";

const insertMock = vi.fn();
const updateMock = vi.fn();
const deleteEqBrandMock = vi.fn();
const deleteEqIdMock = vi.fn(() => ({ eq: deleteEqBrandMock }));
const updateEqIdMock = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }));
const insertSelectSingleMock = vi.fn();
const requireAdminApiMock = vi.fn();
const hasTrustedOriginMock = vi.fn();

vi.mock("@/lib/security/origin", () => ({
  hasTrustedOrigin: hasTrustedOriginMock
}));

vi.mock("@/lib/auth-api", () => ({
  requireAdminApi: requireAdminApiMock
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: vi.fn((table: string) => {
      if (table === "business_ledger_entries") {
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

describe("big book entries route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasTrustedOriginMock.mockReturnValue(true);
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
    deleteEqBrandMock.mockResolvedValue({ error: null });
  });

  it("creates an entry for admin users", async () => {
    const { POST } = await import("@/app/api/big-book/entries/route");
    const request = new Request("https://app.localhost/api/big-book/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entry_date: "2026-04-23",
        entry_type_id: "11111111-1111-4111-8111-111111111111",
        explanation: "Operational cloud cost",
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
  });

  it("returns 403 when non-admin tries to create entry", async () => {
    requireAdminApiMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      message: "Admin access required"
    });
    const { POST } = await import("@/app/api/big-book/entries/route");
    const request = new Request("https://app.localhost/api/big-book/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
  });
});
