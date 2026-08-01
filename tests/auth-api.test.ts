import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();
const maybeSingleMock = vi.fn();
const membershipsResultMock = vi.fn();
const brandsResultMock = vi.fn();

function createThenableQuery(resolveValue: () => unknown) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = vi.fn(self);
  chain.eq = vi.fn(self);
  chain.in = vi.fn(self);
  chain.order = vi.fn(self);
  chain.maybeSingle = maybeSingleMock;
  chain.then = (
    onFulfilled: (value: unknown) => unknown,
    onRejected?: (reason: unknown) => unknown
  ) => Promise.resolve(resolveValue()).then(onFulfilled, onRejected);
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: getUserMock
    }
  }))
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === "allowed_users") {
        return createThenableQuery(() => ({ data: null, error: null }));
      }
      if (table === "user_brand_roles") {
        return createThenableQuery(() => membershipsResultMock());
      }
      if (table === "brands") {
        return createThenableQuery(() => brandsResultMock());
      }
      return createThenableQuery(() => ({ data: null, error: null }));
    })
  }))
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn(() => undefined)
  }))
}));

describe("auth api guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    membershipsResultMock.mockReturnValue({
      data: [{ brand_id: "11111111-1111-4111-8111-111111111111", role: "viewer", is_active: true }],
      error: null
    });
    brandsResultMock.mockReturnValue({
      data: [{ id: "11111111-1111-4111-8111-111111111111", is_active: true }],
      error: null
    });
  });

  it("returns 401 for unauthenticated users", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null }, error: null });
    const { requireFinanceApi } = await import("@/lib/auth-api");

    const result = await requireFinanceApi();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
  });

  it("returns 403 for authenticated users without finance role", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { email: "viewer@acme.com", id: "u1" } }, error: null });
    maybeSingleMock.mockResolvedValueOnce({
      data: { id: "au1", role: "viewer", is_active: true },
      error: null
    });
    membershipsResultMock.mockReturnValue({
      data: [{ brand_id: "11111111-1111-4111-8111-111111111111", role: "viewer", is_active: true }],
      error: null
    });
    const { requireFinanceApi } = await import("@/lib/auth-api");

    const result = await requireFinanceApi();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it("returns success for active admin", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { email: "admin@acme.com", id: "u2" } }, error: null });
    maybeSingleMock.mockResolvedValueOnce({
      data: { id: "au2", role: "admin", is_active: true },
      error: null
    });
    membershipsResultMock.mockReturnValue({
      data: [{ brand_id: "11111111-1111-4111-8111-111111111111", role: "admin", is_active: true }],
      error: null
    });
    const { requireAdminApi } = await import("@/lib/auth-api");

    const result = await requireAdminApi();
    expect(result.ok).toBe(true);
  });
});
