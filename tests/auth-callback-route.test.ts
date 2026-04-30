import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const exchangeCodeForSessionMock = vi.fn();
const getUserMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      exchangeCodeForSession: exchangeCodeForSessionMock,
      getUser: getUserMock
    }
  }))
}));

beforeEach(() => {
  vi.clearAllMocks();
  exchangeCodeForSessionMock.mockResolvedValue(undefined);
  getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
});

afterEach(() => {
  vi.resetModules();
});

describe("auth callback route", () => {
  it("falls back to dashboard for unsafe next values", async () => {
    const { GET } = await import("@/app/auth/callback/route");
    const response = await GET(new Request("https://example.com/auth/callback?next=https://evil.site"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://example.com/dashboard");
  });

  it("exchanges auth code, mints session-meta + csrf cookies, and redirects to validated next path", async () => {
    const { GET } = await import("@/app/auth/callback/route");
    const response = await GET(
      new Request("https://example.com/auth/callback?code=abc123&next=/dashboard/reports")
    );

    expect(exchangeCodeForSessionMock).toHaveBeenCalledWith("abc123");
    expect(response.headers.get("location")).toBe("https://example.com/dashboard/reports");

    const setCookies = response.headers.getSetCookie();
    expect(setCookies.some((c) => c.startsWith("session-meta=") || c.startsWith("__Host-session-meta="))).toBe(true);
    expect(setCookies.some((c) => c.startsWith("csrf=") || c.startsWith("__Host-csrf="))).toBe(true);
  });

  it("does not mint cookies if no code is supplied", async () => {
    const { GET } = await import("@/app/auth/callback/route");
    const response = await GET(new Request("https://example.com/auth/callback"));

    expect(response.status).toBe(307);
    expect(exchangeCodeForSessionMock).not.toHaveBeenCalled();
    const setCookies = response.headers.getSetCookie();
    expect(setCookies.some((c) => c.startsWith("session-meta="))).toBe(false);
  });
});
