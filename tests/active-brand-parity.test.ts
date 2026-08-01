import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The page layer (requireAllowedUser) and the API layer (resolveApiAccess) both
// pick an active brand from the same membership list. When they disagree, the
// brand switcher offers a brand every mutation then silently rewrites to
// another one, so these two are asserted against the same fixture.

const getUserMock = vi.fn();
const getClaimsMock = vi.fn();
const maybeSingleMock = vi.fn();
const cookieGetMock = vi.fn();

const LIVE_BRAND = "11111111-1111-4111-8111-111111111111";
const RETIRED_BRAND = "22222222-2222-4222-8222-222222222222";

function createThenableQuery() {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = vi.fn(self);
  chain.eq = vi.fn(self);
  chain.ilike = vi.fn(self);
  chain.order = vi.fn(self);
  chain.maybeSingle = maybeSingleMock;
  return chain;
}

function membership(brandId: string, code: string, brandIsActive: boolean, createdAt: string) {
  return {
    brand_id: brandId,
    role: "admin",
    is_active: true,
    created_at: createdAt,
    brands: { id: brandId, code, name: code, is_active: brandIsActive }
  };
}

/** A retired brand joined first, so a naive "take the first membership" picks it. */
function allowedUserWithRetiredBrandFirst() {
  return {
    id: "allowed-1",
    role: "admin",
    is_active: true,
    user_brand_roles: [
      membership(RETIRED_BRAND, "RETIRED", false, "2026-01-01T00:00:00.000Z"),
      membership(LIVE_BRAND, "LIVE", true, "2026-02-01T00:00:00.000Z")
    ]
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock, getClaims: getClaimsMock }
  }))
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: vi.fn(() => createThenableQuery()) }))
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: cookieGetMock }))
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  })
}));

beforeEach(() => {
  vi.clearAllMocks();
  getClaimsMock.mockResolvedValue({ data: null, error: null });
  getUserMock.mockResolvedValue({
    data: { user: { email: "admin@acme.com", id: "u1" } },
    error: null
  });
  cookieGetMock.mockReturnValue(undefined);
  maybeSingleMock.mockResolvedValue({ data: allowedUserWithRetiredBrandFirst(), error: null });
});

afterEach(() => {
  vi.resetModules();
});

describe("requireAllowedUser", () => {
  it("keeps deactivated brands out of the switcher options", async () => {
    const { requireAllowedUser } = await import("@/lib/auth");

    const result = await requireAllowedUser();

    expect(result.brandRoles.map((row) => row.brand_id)).toEqual([LIVE_BRAND]);
    expect(result.activeBrandId).toBe(LIVE_BRAND);
  });

  it("ignores a cookie pointing at a deactivated brand", async () => {
    cookieGetMock.mockReturnValue({ value: RETIRED_BRAND });
    const { requireAllowedUser } = await import("@/lib/auth");

    const result = await requireAllowedUser();

    expect(result.activeBrandId).toBe(LIVE_BRAND);
  });

  it("resolves the same active brand as the API layer", async () => {
    const { requireAllowedUser } = await import("@/lib/auth");
    const { requireAdminApi } = await import("@/lib/auth-api");

    const page = await requireAllowedUser();
    const api = await requireAdminApi();

    expect(api.ok).toBe(true);
    if (api.ok) expect(api.activeBrandId).toBe(page.activeBrandId);
  });

  it("still resolves when every brand is deactivated, rather than locking the user out", async () => {
    maybeSingleMock.mockResolvedValue({
      data: {
        id: "allowed-1",
        role: "admin",
        is_active: true,
        user_brand_roles: [membership(RETIRED_BRAND, "RETIRED", false, "2026-01-01T00:00:00.000Z")]
      },
      error: null
    });
    const { requireAllowedUser } = await import("@/lib/auth");

    const result = await requireAllowedUser();

    expect(result.activeBrandId).toBe(RETIRED_BRAND);
  });
});
