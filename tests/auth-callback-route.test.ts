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
  exchangeCodeForSessionMock.mockResolvedValue({ data: { session: {}, user: { id: "user-1" } }, error: null });
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

  it("does not mint a session when the code exchange fails and a Supabase user is still present", async () => {
    exchangeCodeForSessionMock.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: { message: "invalid grant" }
    });
    getUserMock.mockResolvedValueOnce({ data: { user: { id: "user-1" } }, error: null });

    const { GET } = await import("@/app/auth/callback/route");
    const response = await GET(
      new Request("https://example.com/auth/callback?code=stale&remember=1&next=/dashboard")
    );

    expect(exchangeCodeForSessionMock).toHaveBeenCalledWith("stale");
    expect(response.headers.get("location")).toContain("/login");
    const setCookies = response.headers.getSetCookie();
    expect(setCookies.some((cookie) => cookie.startsWith("session-meta=") && !cookie.startsWith("session-meta=;"))).toBe(
      false
    );
  });
});
