import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

import { ABSOLUTE_MS, IDLE_MS, issue } from "@/lib/security/session-meta";
import { SESSION_META_COOKIE } from "@/lib/security/cookies";

const updateSessionMock = vi.fn();

vi.mock("@/lib/supabase/middleware", () => ({
  updateSession: (request: NextRequest) => updateSessionMock(request)
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
  vi.resetModules();
});

describe("middleware auth gate", () => {
  it("redirects protected routes to login when session user is missing", async () => {
    updateSessionMock.mockResolvedValueOnce({
      response: NextResponse.next(),
      user: null
    });

    const { middleware } = await import("@/middleware");
    const request = new NextRequest("https://example.com/dashboard?month=2026-04-01");
    const response = await middleware(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login");
    expect(response.headers.get("location")).toContain("next=%2Fdashboard%3Fmonth%3D2026-04-01");
  });

  it("redirects to login when authenticated user has no session-meta cookie", async () => {
    updateSessionMock.mockResolvedValueOnce({
      response: NextResponse.next(),
      user: { id: "user-1" }
    });

    const { middleware } = await import("@/middleware");
    const request = new NextRequest("https://example.com/dashboard");
    const response = await middleware(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login");
    expect(response.headers.get("location")).toContain("error=session-expired");
  });

  it("redirects to login when session-meta is signed for a different user id", async () => {
    const minted = await issue("other-user", false);
    updateSessionMock.mockResolvedValueOnce({
      response: NextResponse.next(),
      user: { id: "user-1" }
    });

    const { middleware } = await import("@/middleware");
    const request = new NextRequest("https://example.com/dashboard", {
      headers: { cookie: `${SESSION_META_COOKIE}=${encodeURIComponent(minted.value)}` }
    });
    const response = await middleware(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("error=session-expired");
  });

  it("redirects to login when last activity is older than the idle window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-30T10:00:00Z"));
    const minted = await issue("user-1", false);

    // Jump forward past the idle window with no activity.
    vi.setSystemTime(new Date(Date.now() + IDLE_MS + 60_000));

    updateSessionMock.mockResolvedValueOnce({
      response: NextResponse.next(),
      user: { id: "user-1" }
    });

    const { middleware } = await import("@/middleware");
    const request = new NextRequest("https://example.com/dashboard", {
      headers: { cookie: `${SESSION_META_COOKIE}=${encodeURIComponent(minted.value)}` }
    });
    const response = await middleware(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("error=session-expired");
  });

  it("redirects to login when absolute lifetime has elapsed (no remember-me)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-30T10:00:00Z"));
    const minted = await issue("user-1", false);

    // Roll forward in small steps to keep `la` fresh, ending past the absolute cap.
    const stepCount = 25; // each step well under IDLE_MS
    const stepMs = (ABSOLUTE_MS + 60_000) / stepCount;
    for (let i = 0; i < stepCount; i += 1) {
      vi.setSystemTime(new Date(Date.now() + stepMs));
    }

    updateSessionMock.mockResolvedValueOnce({
      response: NextResponse.next(),
      user: { id: "user-1" }
    });

    const { middleware } = await import("@/middleware");
    const request = new NextRequest("https://example.com/dashboard", {
      headers: { cookie: `${SESSION_META_COOKIE}=${encodeURIComponent(minted.value)}` }
    });
    const response = await middleware(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("error=session-expired");
  });

  it("allows protected routes when session is valid and rolls the session-meta cookie", async () => {
    const minted = await issue("user-1", false);
    updateSessionMock.mockResolvedValueOnce({
      response: NextResponse.next(),
      user: { id: "user-1" }
    });

    const { middleware } = await import("@/middleware");
    const request = new NextRequest("https://example.com/dashboard", {
      headers: { cookie: `${SESSION_META_COOKIE}=${encodeURIComponent(minted.value)}` }
    });
    const response = await middleware(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    const cookies = response.headers.getSetCookie();
    expect(cookies.some((c) => c.startsWith(`${SESSION_META_COOKIE}=`))).toBe(true);
  });

  it("mints a CSRF cookie when authenticated user has none", async () => {
    const minted = await issue("user-1", false);
    updateSessionMock.mockResolvedValueOnce({
      response: NextResponse.next(),
      user: { id: "user-1" }
    });

    const { middleware } = await import("@/middleware");
    const request = new NextRequest("https://example.com/dashboard", {
      headers: { cookie: `${SESSION_META_COOKIE}=${encodeURIComponent(minted.value)}` }
    });
    const response = await middleware(request);

    const cookies = response.headers.getSetCookie();
    expect(cookies.some((c) => c.startsWith("csrf=") || c.startsWith("__Host-csrf="))).toBe(true);
  });

  it("does not gate unprotected paths", async () => {
    updateSessionMock.mockResolvedValueOnce({
      response: NextResponse.next(),
      user: null
    });

    const { middleware } = await import("@/middleware");
    const request = new NextRequest("https://example.com/login");
    const response = await middleware(request);

    expect(response.status).toBe(200);
  });

  it("protects /api/big-book/* when unauthenticated", async () => {
    updateSessionMock.mockResolvedValueOnce({
      response: NextResponse.next(),
      user: null
    });

    const { middleware } = await import("@/middleware");
    const request = new NextRequest("https://example.com/api/big-book/entries");
    const response = await middleware(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login");
  });

  it("protects /api/web-transactions/* when unauthenticated", async () => {
    updateSessionMock.mockResolvedValueOnce({
      response: NextResponse.next(),
      user: null
    });

    const { middleware } = await import("@/middleware");
    const request = new NextRequest("https://example.com/api/web-transactions/import");
    const response = await middleware(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login");
  });
});
