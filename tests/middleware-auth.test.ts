import { describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const updateSessionMock = vi.fn();

vi.mock("@/lib/supabase/middleware", () => ({
  updateSession: (request: NextRequest) => updateSessionMock(request)
}));

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

  it("allows protected routes when session user exists", async () => {
    updateSessionMock.mockResolvedValueOnce({
      response: NextResponse.next(),
      user: { id: "user-1" }
    });

    const { middleware } = await import("@/middleware");
    const request = new NextRequest("https://example.com/dashboard");
    const response = await middleware(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});
