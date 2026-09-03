import { beforeEach, describe, expect, it, vi } from "vitest";

const ENTRY_ID = "11111111-1111-4111-8111-111111111111";

const maybeSingleMock = vi.fn();
const eqMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }));
const selectMock = vi.fn(() => ({ eq: eqMock, in: vi.fn(), order: vi.fn() }));
const fromMock = vi.fn(() => ({ select: selectMock }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: fromMock
  }))
}));

describe("getBigBookLedgerRowsPaged entryId focus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
  });

  it("returns an empty page when the focused entry does not exist", async () => {
    const { getBigBookLedgerRowsPaged } = await import("@/lib/db/queries");
    const result = await getBigBookLedgerRowsPaged({
      page: 0,
      pageSize: 20,
      entryId: ENTRY_ID
    });

    expect(selectMock).toHaveBeenCalledWith("id, group_id, entry_date");
    expect(eqMock).toHaveBeenCalledWith("id", ENTRY_ID);
    expect(result).toEqual({
      rows: [],
      totalCount: 0,
      totals: {
        pageTotals: [],
        pageEntryCount: 0,
        grandTotals: [],
        grandEntryCount: 0,
        pagePocketExcludedCount: 0,
        grandPocketExcludedCount: 0
      }
    });
  });
});
