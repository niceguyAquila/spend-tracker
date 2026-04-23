import { describe, expect, it } from "vitest";
import { hasTrustedOrigin } from "@/lib/security/origin";

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
