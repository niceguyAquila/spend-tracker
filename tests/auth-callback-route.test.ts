import { describe, expect, it, vi } from "vitest";

const exchangeCodeForSessionMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      exchangeCodeForSession: exchangeCodeForSessionMock
    }
  }))
}));

describe("auth callback route", () => {
  it("falls back to dashboard for unsafe next values", async () => {
    const { GET } = await import("@/app/auth/callback/route");
    const response = await GET(new Request("https://example.com/auth/callback?next=https://evil.site"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://example.com/dashboard");
  });

  it("exchanges auth code and redirects to validated next path", async () => {
    exchangeCodeForSessionMock.mockResolvedValueOnce(undefined);
    const { GET } = await import("@/app/auth/callback/route");
    const response = await GET(new Request("https://example.com/auth/callback?code=abc123&next=/dashboard/reports"));

    expect(exchangeCodeForSessionMock).toHaveBeenCalledWith("abc123");
    expect(response.headers.get("location")).toBe("https://example.com/dashboard/reports");
  });
});
