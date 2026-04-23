import { describe, expect, it, vi } from "vitest";

const signOutMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      signOut: signOutMock
    }
  }))
}));

describe("logout route", () => {
  it("signs out and redirects to login", async () => {
    signOutMock.mockResolvedValueOnce(undefined);
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
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://example.com/login");
  });
});
