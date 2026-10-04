import { describe, expect, it } from "vitest";
import {
  OPTIMISTIC_CONFLICT_MESSAGE,
  parseExpectedUpdatedAt,
  resolveOptimisticMiss
} from "@/lib/db/optimistic-lock";

describe("optimistic lock helpers", () => {
  it("parses a valid timestamp", () => {
    const parsed = parseExpectedUpdatedAt("2026-04-23T10:00:00.000Z");
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value).toBe("2026-04-23T10:00:00.000Z");
  });

  it("rejects a missing timestamp", async () => {
    const parsed = parseExpectedUpdatedAt(null);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.response.status).toBe(400);
    }
  });

  it("returns 409 when the row still exists", async () => {
    const response = await resolveOptimisticMiss({
      existing: { id: "entry-1", updated_at: "2026-04-24T00:00:00.000Z" }
    });
    const data = await response.json();
    expect(response.status).toBe(409);
    expect(data.error).toBe(OPTIMISTIC_CONFLICT_MESSAGE);
    expect(data.code).toBe("optimistic_conflict");
  });

  it("returns 404 when the row is gone", async () => {
    const response = await resolveOptimisticMiss({ existing: null });
    expect(response.status).toBe(404);
  });
});
