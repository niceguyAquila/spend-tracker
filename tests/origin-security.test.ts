import { describe, expect, it } from "vitest";
import { assertCsrfAndOrigin, hasTrustedOrigin } from "@/lib/security/origin";

function makeRequest(url: string, init?: RequestInit) {
  return new Request(url, init);
}

describe("hasTrustedOrigin", () => {
  it("allows safe methods", () => {
    const req = makeRequest("https://app.localhost/dashboard", { method: "GET" });
    expect(hasTrustedOrigin(req)).toBe(true);
  });

  it("allows mutating requests when origin and host match", () => {
    const req = makeRequest("https://app.localhost/api/expenses", {
      method: "POST",
      headers: {
        origin: "https://app.localhost",
        host: "app.localhost"
      }
    });
    expect(hasTrustedOrigin(req)).toBe(true);
  });

  it("rejects mutating requests when origin and host mismatch", () => {
    const req = makeRequest("https://app.localhost/api/expenses", {
      method: "POST",
      headers: {
        origin: "https://evil.localhost",
        host: "app.localhost"
      }
    });
    expect(hasTrustedOrigin(req)).toBe(false);
  });
});

describe("assertCsrfAndOrigin", () => {
  it("allows safe methods without checking CSRF", async () => {
    const req = makeRequest("https://app.localhost/api/expenses", { method: "GET" });
    await expect(assertCsrfAndOrigin(req)).resolves.toBe(true);
  });

  it("rejects when origin is wrong (independent of CSRF)", async () => {
    const req = makeRequest("https://app.localhost/api/expenses", {
      method: "POST",
      headers: {
        origin: "https://evil.localhost",
        host: "app.localhost",
        cookie: "csrf=abc",
        "x-csrf-token": "abc"
      }
    });
    await expect(assertCsrfAndOrigin(req)).resolves.toBe(false);
  });

  it("rejects when CSRF cookie is missing", async () => {
    const req = makeRequest("https://app.localhost/api/expenses", {
      method: "POST",
      headers: {
        origin: "https://app.localhost",
        host: "app.localhost",
        "x-csrf-token": "abc"
      }
    });
    await expect(assertCsrfAndOrigin(req)).resolves.toBe(false);
  });

  it("rejects when header token does not match cookie token", async () => {
    const req = makeRequest("https://app.localhost/api/expenses", {
      method: "POST",
      headers: {
        origin: "https://app.localhost",
        host: "app.localhost",
        cookie: "csrf=expectedtoken",
        "x-csrf-token": "wrongtoken"
      }
    });
    await expect(assertCsrfAndOrigin(req)).resolves.toBe(false);
  });

  it("accepts when origin matches and header token matches cookie", async () => {
    const req = makeRequest("https://app.localhost/api/expenses", {
      method: "POST",
      headers: {
        origin: "https://app.localhost",
        host: "app.localhost",
        cookie: "csrf=matchingtoken",
        "x-csrf-token": "matchingtoken"
      }
    });
    await expect(assertCsrfAndOrigin(req)).resolves.toBe(true);
  });

  it("accepts when token is supplied via form field instead of header", async () => {
    const form = new URLSearchParams({ csrf_token: "matchingtoken", other: "data" });
    const req = new Request("https://app.localhost/auth/logout", {
      method: "POST",
      headers: {
        origin: "https://app.localhost",
        host: "app.localhost",
        cookie: "csrf=matchingtoken",
        "content-type": "application/x-www-form-urlencoded"
      },
      body: form.toString()
    });
    await expect(assertCsrfAndOrigin(req)).resolves.toBe(true);
  });
});
