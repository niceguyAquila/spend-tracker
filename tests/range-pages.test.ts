import { describe, expect, it, vi } from "vitest";
import { collectRangePages, POSTGREST_MAX_ROWS } from "@/lib/db/range-pages";

describe("collectRangePages", () => {
  it("fetches multiple pages until a short page", async () => {
    const all = Array.from({ length: 2500 }, (_, i) => i + 1);
    const fetchPage = vi.fn(async (from: number, to: number) => all.slice(from, to + 1));

    const rows = await collectRangePages(fetchPage, { maxRows: 100_000 });

    expect(rows).toHaveLength(2500);
    expect(rows[0]).toBe(1);
    expect(rows[2499]).toBe(2500);
    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(fetchPage).toHaveBeenNthCalledWith(1, 0, POSTGREST_MAX_ROWS - 1);
    expect(fetchPage).toHaveBeenNthCalledWith(2, 1000, 1999);
    expect(fetchPage).toHaveBeenNthCalledWith(3, 2000, 2999);
  });

  it("stops at maxRows even when more pages exist", async () => {
    const all = Array.from({ length: 5000 }, (_, i) => i + 1);
    const fetchPage = vi.fn(async (from: number, to: number) => all.slice(from, to + 1));

    const rows = await collectRangePages(fetchPage, { maxRows: 1500 });

    expect(rows).toHaveLength(1500);
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(fetchPage).toHaveBeenNthCalledWith(1, 0, POSTGREST_MAX_ROWS - 1);
    expect(fetchPage).toHaveBeenNthCalledWith(2, 1000, 1499);
  });

  it("does not silently stop after one full PostgREST page when more remain", async () => {
    const all = Array.from({ length: 1001 }, (_, i) => `row-${i}`);
    const fetchPage = vi.fn(async (from: number, to: number) => all.slice(from, to + 1));

    const rows = await collectRangePages(fetchPage, { maxRows: 100_000 });

    expect(rows).toHaveLength(1001);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });
});
