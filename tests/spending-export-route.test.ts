import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireFinanceApiMock = vi.fn();
const getExpensesMock = vi.fn();

vi.mock("@/lib/auth-api", () => ({
  requireFinanceApi: requireFinanceApiMock
}));

vi.mock("@/lib/db/queries", () => ({
  getExpenses: getExpensesMock
}));

beforeEach(() => {
  vi.clearAllMocks();
  requireFinanceApiMock.mockResolvedValue({
    ok: true,
    activeBrandId: "brand-1",
    user: { id: "user-1" }
  });
  getExpensesMock.mockResolvedValue([
    {
      id: "e1",
      brand_id: "brand-1",
      expense_date: "2026-04-25",
      month_key: "2026-04-01",
      entry_direction: "spending",
      amount: 150000,
      category_id: "c1",
      subcategory_id: "s1",
      note: "April boost",
      reference: "INV-001",
      source: "manual",
      created_by: "u1",
      updated_by: "u1",
      created_at: "2026-04-25T00:00:00Z",
      updated_at: "2026-04-25T00:00:00Z",
      category_name: "Ads",
      subcategory_name: "Facebook",
      creator_display_name: "Admin",
      updater_display_name: "Admin"
    },
    {
      id: "e2",
      brand_id: "brand-1",
      expense_date: "2026-04-26",
      month_key: "2026-04-01",
      entry_direction: "profit",
      amount: 50000,
      category_id: "c1",
      subcategory_id: "s1",
      note: "Rebate",
      reference: null,
      source: "csv_import",
      created_by: "u1",
      updated_by: "u1",
      created_at: "2026-04-26T00:00:00Z",
      updated_at: "2026-04-26T00:00:00Z",
      category_name: "Ads",
      subcategory_name: "Facebook",
      creator_display_name: "Admin",
      updater_display_name: "Admin"
    }
  ]);
});

afterEach(() => {
  vi.resetModules();
});

describe("GET /api/expenses/export", () => {
  it("returns a CSV attachment with import headers plus source and created_by_name", async () => {
    const { GET } = await import("@/app/api/expenses/export/route");
    const response = await GET(new Request("https://app.localhost/api/expenses/export?month=2026-04"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toMatch(/text\/csv/);
    expect(response.headers.get("Content-Disposition")).toMatch(/spending-export-/);

    const body = await response.text();
    const lines = body.split("\r\n");
    expect(lines[0]).toBe(
      "expense_date,entry_direction,category_name,subcategory_name,amount,note,reference,source,created_by_name"
    );
    expect(lines[1]).toContain("2026-04-25");
    expect(lines[1]).toContain("spending");
    expect(lines[1]).toContain("150000");
    expect(lines[1]).toContain("manual");
    expect(getExpensesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: "brand-1",
        month: "2026-04",
        limit: 50_000
      })
    );
  });

  it("applies the free-text query filter after the database fetch", async () => {
    const { GET } = await import("@/app/api/expenses/export/route");
    const response = await GET(
      new Request("https://app.localhost/api/expenses/export?query=Rebate")
    );
    const body = await response.text();
    const lines = body.split("\r\n").filter(Boolean);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("Rebate");
    expect(lines[1]).not.toContain("April boost");
  });

  it("rejects unauthenticated callers", async () => {
    requireFinanceApiMock.mockResolvedValueOnce({ ok: false, status: 401, message: "Unauthorized" });
    const { GET } = await import("@/app/api/expenses/export/route");
    const response = await GET(new Request("https://app.localhost/api/expenses/export"));
    expect(response.status).toBe(401);
  });
});
