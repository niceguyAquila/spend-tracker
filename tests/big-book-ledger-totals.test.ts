import { beforeEach, describe, expect, it, vi } from "vitest";
import { MissingDatabaseFunctionError } from "@/lib/db/required-rpc";

const rpcMock = vi.fn();
const fromMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    rpc: rpcMock,
    from: fromMock
  }))
}));

const ledgerTotals = {
  pageTotals: [{ currency: "IDR", spending: 10, profit: 0, net: -10 }],
  pageEntryCount: 1,
  grandTotals: [{ currency: "IDR", spending: 10, profit: 0, net: -10 }],
  grandEntryCount: 1,
  pagePocketExcludedCount: 0,
  grandPocketExcludedCount: 0
};

describe("getBigBookLedgerRowsPaged", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromMock.mockImplementation(() => {
      throw new Error("ledger page must not scan business_ledger_entries when the page RPC is missing");
    });
  });

  it("returns the totals from get_big_book_ledger_page", async () => {
    rpcMock.mockResolvedValue({
      data: {
        totalCount: 1,
        pageKeys: [],
        totals: ledgerTotals
      },
      error: null
    });

    const { getBigBookLedgerRowsPaged } = await import("@/lib/db/queries");
    const result = await getBigBookLedgerRowsPaged({ page: 0, pageSize: 25 });
    expect(result.totals).toEqual(ledgerTotals);
    expect(result.totalCount).toBe(1);
    expect(rpcMock).toHaveBeenCalledWith(
      "get_big_book_ledger_page",
      expect.objectContaining({ p_page: 0, p_page_size: 25 })
    );
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("throws when get_big_book_ledger_page is missing and does not scan entries", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        code: "PGRST202",
        message: "Could not find the function public.get_big_book_ledger_page(integer) in the schema cache"
      }
    });

    const { getBigBookLedgerRowsPaged } = await import("@/lib/db/queries");
    await expect(getBigBookLedgerRowsPaged({ page: 0, pageSize: 25 })).rejects.toBeInstanceOf(
      MissingDatabaseFunctionError
    );
    expect(fromMock).not.toHaveBeenCalled();
  });
});
