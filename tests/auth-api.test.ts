import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();
const getClaimsMock = vi.fn();
const maybeSingleMock = vi.fn();

const BRAND_ID = "11111111-1111-4111-8111-111111111111";

function allowedUserRow(role: "admin" | "finance" | "viewer") {
  return {
    id: `au-${role}`,
    role,
    is_active: true,
    user_brand_roles: [
      {
        brand_id: BRAND_ID,
        role,
        is_active: true,
        created_at: "2026-01-01T00:00:00.000Z",
        brands: { id: BRAND_ID, code: "ZENPLAY", name: "ZenPlay", is_active: true }
      }
    ]
  };
}

function createThenableQuery(resolveValue: () => unknown) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = vi.fn(self);
  chain.eq = vi.fn(self);
  chain.in = vi.fn(self);
  chain.ilike = vi.fn(self);
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
      getUser: getUserMock,
      getClaims: getClaimsMock
    }
  }))
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => createThenableQuery(() => ({ data: null, error: null })))
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
    // Default to the legacy path so getUser() stays exercised.
    getClaimsMock.mockResolvedValue({ data: null, error: null });
  });

  it("returns 401 for unauthenticated users", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null }, error: null });
    const { requireFinanceApi } = await import("@/lib/auth-api");

    const result = await requireFinanceApi();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
  });

  it("returns 403 for authenticated users without finance role", async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { email: "viewer@acme.com", id: "u1" } },
      error: null
    });
    maybeSingleMock.mockResolvedValueOnce({ data: allowedUserRow("viewer"), error: null });
    const { requireFinanceApi } = await import("@/lib/auth-api");

    const result = await requireFinanceApi();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it("returns success for active admin", async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { email: "admin@acme.com", id: "u2" } },
      error: null
    });
    maybeSingleMock.mockResolvedValueOnce({ data: allowedUserRow("admin"), error: null });
    const { requireAdminApi } = await import("@/lib/auth-api");

    const result = await requireAdminApi();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.activeBrandId).toBe(BRAND_ID);
  });

  it("resolves the session from locally verified claims without calling getUser", async () => {
    getClaimsMock.mockResolvedValue({
      data: { claims: { sub: "u3", email: "admin@acme.com" } },
      error: null
    });
    maybeSingleMock.mockResolvedValueOnce({ data: allowedUserRow("admin"), error: null });
    const { requireAdminApi } = await import("@/lib/auth-api");

    const result = await requireAdminApi();
    expect(result.ok).toBe(true);
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it("denies users missing from the allowlist", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { email: "stranger@acme.com", id: "u4" } },
      error: null
    });
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    const { requireAllowedApi } = await import("@/lib/auth-api");

    const result = await requireAllowedApi();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });
});
