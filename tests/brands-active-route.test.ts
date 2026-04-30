import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireAllowedApiMock = vi.fn();
const assertCsrfAndOriginMock = vi.fn();
const maybeSingleMock = vi.fn();

vi.mock("@/lib/security/origin", () => ({
  assertCsrfAndOrigin: assertCsrfAndOriginMock,
  hasTrustedOrigin: vi.fn(() => true)
}));

vi.mock("@/lib/auth-api", () => ({
  requireAllowedApi: requireAllowedApiMock
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: maybeSingleMock
            }))
          }))
        }))
      }))
    }))
  }))
}));

beforeEach(() => {
  vi.clearAllMocks();
  assertCsrfAndOriginMock.mockResolvedValue(true);
  requireAllowedApiMock.mockResolvedValue({
    ok: true,
    allowedUserId: "allowed-1",
    user: { id: "user-1" }
  });
  maybeSingleMock.mockResolvedValue({
    data: { brand_id: "brand-1", is_active: true },
    error: null
  });
});

afterEach(() => {
  vi.resetModules();
});

describe("POST /api/brands/active", () => {
  it("rejects requests when CSRF or origin check fails", async () => {
    assertCsrfAndOriginMock.mockResolvedValueOnce(false);
    const { POST } = await import("@/app/api/brands/active/route");

    const response = await POST(
      new Request("https://app.localhost/api/brands/active", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ brand_id: "11111111-1111-4111-8111-111111111111" })
      })
    );

    expect(response.status).toBe(403);
  });

  it("sets active_brand_id cookie with hardened attributes (HttpOnly, Path=/, Max-Age)", async () => {
    const { POST } = await import("@/app/api/brands/active/route");
    const response = await POST(
      new Request("https://app.localhost/api/brands/active", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ brand_id: "11111111-1111-4111-8111-111111111111" })
      })
    );

    expect(response.status).toBe(200);

    const setCookies = response.headers.getSetCookie();
    const brandCookie = setCookies.find((c) => c.startsWith("active_brand_id="));
    expect(brandCookie).toBeDefined();
    expect(brandCookie).toMatch(/HttpOnly/i);
    expect(brandCookie).toMatch(/Path=\//i);
    expect(brandCookie).toMatch(/Max-Age=\d+/i);
    expect(brandCookie).toMatch(/SameSite=Lax/i);
  });
});
