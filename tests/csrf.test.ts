import { describe, expect, it } from "vitest";
import { generateCsrfToken, verifyCsrfToken } from "@/lib/security/csrf";

describe("CSRF token", () => {
  it("generates 32-byte url-safe tokens that differ between calls", () => {
    const a = generateCsrfToken();
    const b = generateCsrfToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a.length).toBeGreaterThanOrEqual(32);
  });

  it("returns false when cookie is missing", async () => {
    const req = new Request("https://app.localhost/api/foo", {
      method: "POST",
      headers: { "x-csrf-token": "anything" }
    });
    await expect(verifyCsrfToken(req)).resolves.toBe(false);
  });

  it("returns false when header is missing", async () => {
    const req = new Request("https://app.localhost/api/foo", {
      method: "POST",
      headers: { cookie: "csrf=expected" }
    });
    await expect(verifyCsrfToken(req)).resolves.toBe(false);
  });

  it("returns false when header does not match cookie", async () => {
    const req = new Request("https://app.localhost/api/foo", {
      method: "POST",
      headers: {
        cookie: "csrf=expected",
        "x-csrf-token": "wrong"
      }
    });
    await expect(verifyCsrfToken(req)).resolves.toBe(false);
  });

  it("returns true when header matches cookie", async () => {
    const req = new Request("https://app.localhost/api/foo", {
      method: "POST",
      headers: {
        cookie: "csrf=expected",
        "x-csrf-token": "expected"
      }
    });
    await expect(verifyCsrfToken(req)).resolves.toBe(true);
  });

  it("accepts the token from a form field for HTML form submissions", async () => {
    const body = new URLSearchParams({ csrf_token: "expected", other: "value" });
    const req = new Request("https://app.localhost/auth/logout", {
      method: "POST",
      headers: {
        cookie: "csrf=expected",
        "content-type": "application/x-www-form-urlencoded"
      },
      body: body.toString()
    });
    await expect(verifyCsrfToken(req)).resolves.toBe(true);
  });

  it("does not consume the original request body when validating form-based CSRF", async () => {
    const body = new URLSearchParams({ csrf_token: "expected", important: "payload" });
    const req = new Request("https://app.localhost/auth/logout", {
      method: "POST",
      headers: {
        cookie: "csrf=expected",
        "content-type": "application/x-www-form-urlencoded"
      },
      body: body.toString()
    });
    await verifyCsrfToken(req);
    const form = await req.formData();
    expect(form.get("important")).toBe("payload");
  });
});
