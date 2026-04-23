import { describe, expect, it } from "vitest";
import { DEFAULT_AUTH_REDIRECT, sanitizeNextPath } from "@/lib/auth/redirect";

describe("sanitizeNextPath", () => {
  it("falls back to default for missing values", () => {
    expect(sanitizeNextPath(null)).toBe(DEFAULT_AUTH_REDIRECT);
    expect(sanitizeNextPath(undefined)).toBe(DEFAULT_AUTH_REDIRECT);
  });

  it("allows internal absolute paths", () => {
    expect(sanitizeNextPath("/dashboard")).toBe("/dashboard");
    expect(sanitizeNextPath("/dashboard?month=2026-04-01")).toBe("/dashboard?month=2026-04-01");
  });

  it("rejects protocol-relative and external values", () => {
    expect(sanitizeNextPath("//evil.site")).toBe(DEFAULT_AUTH_REDIRECT);
    expect(sanitizeNextPath("https://evil.site")).toBe(DEFAULT_AUTH_REDIRECT);
    expect(sanitizeNextPath("dashboard")).toBe(DEFAULT_AUTH_REDIRECT);
  });
});
