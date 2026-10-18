import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IDLE_MS, issue, decode } from "@/lib/security/session-meta";
import { SESSION_META_COOKIE } from "@/lib/security/cookies";

const getUserMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: getUserMock
    }
  }))
}));

function sessionMetaValues(setCookies: string[]): string[] {
  return setCookies
    .filter((cookie) => cookie.startsWith(`${SESSION_META_COOKIE}=`))
    .map((cookie) => decodeURIComponent(cookie.slice(`${SESSION_META_COOKIE}=`.length).split(";")[0]));
}

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
});

afterEach(() => {
  vi.useRealTimers();
  vi.resetModules();
});

describe("GET /auth/init-session", () => {
  it("does not mint a session when the Supabase user is still valid and no app session exists", async () => {
    const { GET } = await import("@/app/auth/init-session/route");
    const response = await GET(
      new Request("https://example.com/auth/init-session?remember=1&next=/dashboard/big-book")
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login");
    expect(response.headers.get("location")).toContain("error=session-expired");

    const values = sessionMetaValues(response.headers.getSetCookie());
    for (const value of values) {
      expect(await decode(value)).toBeNull();
    }
  });

  it("keeps the existing absolute cap when remember=1 is requested for a live app session", async () => {
    const minted = await issue("user-1", false);
    const { GET } = await import("@/app/auth/init-session/route");
    const response = await GET(
      new Request("https://example.com/auth/init-session?remember=1&next=/dashboard/big-book", {
        headers: { cookie: `${SESSION_META_COOKIE}=${encodeURIComponent(minted.value)}` }
      })
    );

    expect(response.headers.get("location")).toBe("https://example.com/dashboard/big-book");

    const values = sessionMetaValues(response.headers.getSetCookie());
    expect(values).toHaveLength(0);
    expect((await decode(minted.value))?.iat).toBe(minted.meta.iat);
    expect((await decode(minted.value))?.rm).toBe(false);
  });

  it("does not mint a new absolute window for an idle-expired app session", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-30T10:00:00Z"));
    const minted = await issue("user-1", false);
    vi.setSystemTime(new Date(Date.now() + IDLE_MS + 60_000));

    const { GET } = await import("@/app/auth/init-session/route");
    const response = await GET(
      new Request("https://example.com/auth/init-session?remember=1", {
        headers: { cookie: `${SESSION_META_COOKIE}=${encodeURIComponent(minted.value)}` }
      })
    );

    expect(response.headers.get("location")).toContain("/login");
    expect(response.headers.get("location")).toContain("error=session-expired");
    const values = sessionMetaValues(response.headers.getSetCookie());
    for (const value of values) {
      expect(await decode(value)).toBeNull();
    }
    vi.useRealTimers();
  });
});
