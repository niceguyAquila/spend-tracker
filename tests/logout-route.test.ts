import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const signOutMock = vi.fn();
const assertCsrfAndOriginMock = vi.fn();

vi.mock("@/lib/security/origin", () => ({
  assertCsrfAndOrigin: assertCsrfAndOriginMock,
  hasTrustedOrigin: vi.fn(() => true)
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      signOut: signOutMock
    }
  }))
}));

beforeEach(() => {
  vi.clearAllMocks();
  signOutMock.mockResolvedValue(undefined);
  assertCsrfAndOriginMock.mockResolvedValue(true);
});

afterEach(() => {
  vi.resetModules();
});

describe("logout route", () => {
  it("signs out globally and redirects to login when origin and CSRF are valid", async () => {
    const { POST } = await import("@/app/auth/logout/route");

    const response = await POST(
      new Request("https://example.com/auth/logout", {
        method: "POST",
        headers: {
          origin: "https://example.com",
          host: "example.com"
        }
      })
    );

    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(signOutMock).toHaveBeenCalledWith({ scope: "global" });
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://example.com/login");

    const setCookies = response.headers.getSetCookie();
    expect(setCookies.some((c) => c.startsWith("session-meta=") || c.startsWith("__Host-session-meta="))).toBe(true);
    expect(setCookies.some((c) => c.startsWith("csrf=") || c.startsWith("__Host-csrf="))).toBe(true);
    expect(setCookies.some((c) => c.startsWith("active_brand_id="))).toBe(true);
  });

  it("returns 403 when origin or CSRF check fails", async () => {
    assertCsrfAndOriginMock.mockResolvedValueOnce(false);
    const { POST } = await import("@/app/auth/logout/route");

    const response = await POST(
      new Request("https://example.com/auth/logout", {
        method: "POST",
        headers: { origin: "https://evil.example", host: "example.com" }
      })
    );

    expect(response.status).toBe(403);
    expect(signOutMock).not.toHaveBeenCalled();
  });
});
