import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ABSOLUTE_MS, ABSOLUTE_RM_MS, decode } from "@/lib/security/session-meta";
import { SESSION_META_COOKIE } from "@/lib/security/cookies";

const signInWithPasswordMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      signInWithPassword: signInWithPasswordMock
    }
  }))
}));

function sessionMetaValue(setCookies: string[]): string | undefined {
  const raw = setCookies.find((cookie) => cookie.startsWith(`${SESSION_META_COOKIE}=`));
  if (!raw) {
    return undefined;
  }
  return decodeURIComponent(raw.slice(`${SESSION_META_COOKIE}=`.length).split(";")[0]);
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.resetModules();
});

describe("POST /auth/sign-in", () => {
  it("mints the app session only after the password grant succeeds", async () => {
    signInWithPasswordMock.mockResolvedValueOnce({
      data: { user: { id: "user-1" }, session: {} },
      error: null
    });

    const { POST } = await import("@/app/auth/sign-in/route");
    const response = await POST(
      new Request("https://example.com/auth/sign-in", {
        method: "POST",
        headers: {
          origin: "https://example.com",
          host: "example.com",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          email: "admin@example.com",
          password: "correct-horse",
          remember: true,
          next: "/dashboard/big-book"
        })
      })
    );

    expect(signInWithPasswordMock).toHaveBeenCalledWith({
      email: "admin@example.com",
      password: "correct-horse"
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ redirect: "/dashboard/big-book" });

    const value = sessionMetaValue(response.headers.getSetCookie());
    const meta = await decode(value);
    expect(meta?.uid).toBe("user-1");
    expect(meta?.rm).toBe(true);
    expect(meta?.iat).toBe(meta?.la);
    const maxAge = response.headers.getSetCookie().find((cookie) => cookie.startsWith(`${SESSION_META_COOKIE}=`));
    expect(maxAge).toContain(`Max-Age=${Math.floor(ABSOLUTE_RM_MS / 1000)}`);
  });

  it("does not mint a session when the password grant fails", async () => {
    signInWithPasswordMock.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { message: "Invalid login credentials" }
    });

    const { POST } = await import("@/app/auth/sign-in/route");
    const response = await POST(
      new Request("https://example.com/auth/sign-in", {
        method: "POST",
        headers: {
          origin: "https://example.com",
          host: "example.com",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          email: "admin@example.com",
          password: "wrong",
          remember: true
        })
      })
    );

    expect(response.status).toBe(401);
    expect(sessionMetaValue(response.headers.getSetCookie())).toBeUndefined();
  });

  it("rejects a cross-origin post before calling Supabase", async () => {
    const { POST } = await import("@/app/auth/sign-in/route");
    const response = await POST(
      new Request("https://example.com/auth/sign-in", {
        method: "POST",
        headers: {
          origin: "https://evil.example",
          host: "example.com",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          email: "admin@example.com",
          password: "correct-horse",
          remember: true
        })
      })
    );

    expect(response.status).toBe(403);
    expect(signInWithPasswordMock).not.toHaveBeenCalled();
  });

  it("uses the 12 hour cap when remember is not set", async () => {
    signInWithPasswordMock.mockResolvedValueOnce({
      data: { user: { id: "user-1" }, session: {} },
      error: null
    });

    const { POST } = await import("@/app/auth/sign-in/route");
    const response = await POST(
      new Request("https://example.com/auth/sign-in", {
        method: "POST",
        headers: {
          origin: "https://example.com",
          host: "example.com",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          email: "admin@example.com",
          password: "correct-horse",
          remember: false,
          next: "https://evil.example"
        })
      })
    );

    expect(await response.json()).toEqual({ redirect: "/dashboard" });
    const meta = await decode(sessionMetaValue(response.headers.getSetCookie()));
    expect(meta?.rm).toBe(false);
    const setCookie = response.headers.getSetCookie().find((cookie) => cookie.startsWith(`${SESSION_META_COOKIE}=`));
    expect(setCookie).toContain(`Max-Age=${Math.floor(ABSOLUTE_MS / 1000)}`);
  });
});
