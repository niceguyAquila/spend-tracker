import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ABSOLUTE_MS,
  ABSOLUTE_RM_MS,
  IDLE_MS,
  decode,
  evaluate,
  issue,
  rolled
} from "@/lib/security/session-meta";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-04-30T10:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("session-meta cookie", () => {
  it("issues a verifiable signed cookie containing iat=la=now and the user id", async () => {
    const before = Date.now();
    const minted = await issue("user-1", false);
    const after = Date.now();

    const decoded = await decode(minted.value);
    expect(decoded).not.toBeNull();
    expect(decoded?.uid).toBe("user-1");
    expect(decoded?.rm).toBe(false);
    expect(decoded?.iat).toBeGreaterThanOrEqual(before);
    expect(decoded?.iat).toBeLessThanOrEqual(after);
    expect(decoded?.iat).toBe(decoded?.la);
    expect(decoded?.sid.length).toBeGreaterThan(0);
    expect(minted.maxAge).toBe(Math.floor(ABSOLUTE_MS / 1000));
  });

  it("uses the longer remember-me cap when rm=true", async () => {
    const minted = await issue("user-1", true);
    expect(minted.meta.rm).toBe(true);
    expect(minted.maxAge).toBe(Math.floor(ABSOLUTE_RM_MS / 1000));
  });

  it("rejects a tampered cookie", async () => {
    const minted = await issue("user-1", false);
    const tampered = `${minted.value.slice(0, -1)}X`;
    expect(await decode(tampered)).toBeNull();
  });

  it("rejects a cookie issued for a different user", async () => {
    const minted = await issue("user-1", false);
    const status = await evaluate(minted.value, "user-2");
    expect(status.kind).toBe("invalid");
  });

  it("returns missing when cookie is absent", async () => {
    expect((await evaluate(undefined, "user-1")).kind).toBe("missing");
    expect((await evaluate("", "user-1")).kind).toBe("missing");
  });

  it("returns invalid when cookie is malformed", async () => {
    expect((await evaluate("not-a-cookie", "user-1")).kind).toBe("invalid");
    expect((await evaluate("foo.bar", "user-1")).kind).toBe("invalid");
  });

  it("returns idle-expired when last-activity is older than IDLE_MS", async () => {
    const minted = await issue("user-1", false);
    const status = await evaluate(minted.value, "user-1", Date.now() + IDLE_MS + 1000);
    expect(status.kind).toBe("idle-expired");
  });

  it("returns absolute-expired when iat exceeds the cap even if last activity is fresh", async () => {
    let current = await issue("user-1", false);
    const stepCount = 30;
    const stepMs = (ABSOLUTE_MS + 60_000) / stepCount;
    for (let i = 0; i < stepCount; i += 1) {
      vi.setSystemTime(new Date(Date.now() + stepMs));
      current = await rolled(current.meta);
    }

    const status = await evaluate(current.value, "user-1");
    expect(status.kind).toBe("absolute-expired");
  });

  it("respects the longer absolute cap when remember-me is set", async () => {
    const minted = await issue("user-1", true);
    vi.setSystemTime(new Date(Date.now() + ABSOLUTE_MS + 60_000));
    const refreshed = await rolled(minted.meta);
    const status = await evaluate(refreshed.value, "user-1");
    expect(status.kind).toBe("ok");
  });

  it("rolled() advances la but never iat", async () => {
    const minted = await issue("user-1", false);
    vi.setSystemTime(new Date(Date.now() + 5 * 60_000));
    const advanced = await rolled(minted.meta);
    expect(advanced.meta.iat).toBe(minted.meta.iat);
    expect(advanced.meta.la).toBeGreaterThan(minted.meta.la);
  });
});
