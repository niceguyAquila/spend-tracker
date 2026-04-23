import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();
const maybeSingleMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: getUserMock
    }
  }))
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: maybeSingleMock
        }))
      }))
    }))
  }))
}));

describe("auth api guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 for unauthenticated users", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null }, error: null });
    const { requireFinanceApi } = await import("@/lib/auth-api");

    const result = await requireFinanceApi();
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
  });

  it("returns 403 for authenticated users without finance role", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { email: "viewer@acme.com", id: "u1" } }, error: null });
    maybeSingleMock.mockResolvedValueOnce({
      data: { role: "viewer", is_active: true },
      error: null
    });
    const { requireFinanceApi } = await import("@/lib/auth-api");

    const result = await requireFinanceApi();
    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
  });

  it("returns success for active admin", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { email: "admin@acme.com", id: "u2" } }, error: null });
    maybeSingleMock.mockResolvedValueOnce({
      data: { role: "admin", is_active: true },
      error: null
    });
    const { requireAdminApi } = await import("@/lib/auth-api");

    const result = await requireAdminApi();
    expect(result.ok).toBe(true);
  });
});
