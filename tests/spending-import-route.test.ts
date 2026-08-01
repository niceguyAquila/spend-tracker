import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireFinanceApiMock = vi.fn();
const assertCsrfAndOriginMock = vi.fn();
const upsertMock = vi.fn();
const categorySelectMock = vi.fn();
const subcategorySelectMock = vi.fn();

const CATEGORY_ID = "11111111-1111-4111-8111-111111111111";
const SUBCATEGORY_ID = "22222222-2222-4222-8222-222222222222";
const BRAND_ID = "33333333-3333-4333-8333-333333333333";

function createSelectChain(resolveValue: unknown) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = vi.fn(self);
  chain.eq = vi.fn(self);
  chain.in = vi.fn(self);
  chain.maybeSingle = vi.fn(async () => resolveValue);
  chain.single = vi.fn(async () => resolveValue);
  chain.then = (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
    Promise.resolve(resolveValue).then(onFulfilled, onRejected);
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: vi.fn((table: string) => {
      if (table === "expense_categories") {
        return {
          select: (...args: unknown[]) => {
            categorySelectMock(...args);
            return createSelectChain({
              data: [{ id: CATEGORY_ID, name: "Ads", is_active: true }],
              error: null
            });
          },
          insert: vi.fn(() => createSelectChain({ data: null, error: null }))
        };
      }
      if (table === "expense_subcategories") {
        return {
          select: (...args: unknown[]) => {
            subcategorySelectMock(...args);
            return createSelectChain({
              data: [{ id: SUBCATEGORY_ID, category_id: CATEGORY_ID, name: "Facebook", is_active: true }],
              error: null
            });
          },
          insert: vi.fn(() => createSelectChain({ data: null, error: null }))
        };
      }
      if (table === "expenses") {
        return {
          upsert: (...args: unknown[]) => {
            upsertMock(...args);
            return {
              select: vi.fn(async () => ({
                data: [{ id: "exp-1" }],
                error: null
              }))
            };
          }
        };
      }
      return createSelectChain({ data: null, error: null });
    })
  }))
}));

vi.mock("@/lib/auth-api", () => ({
  requireFinanceApi: requireFinanceApiMock
}));

vi.mock("@/lib/security/origin", () => ({
  assertCsrfAndOrigin: assertCsrfAndOriginMock,
  hasTrustedOrigin: vi.fn(() => true)
}));

beforeEach(() => {
  vi.clearAllMocks();
  assertCsrfAndOriginMock.mockResolvedValue(true);
  requireFinanceApiMock.mockResolvedValue({
    ok: true,
    activeBrandId: BRAND_ID,
    user: { id: "user-1" }
  });
});

afterEach(() => {
  vi.resetModules();
});

describe("POST /api/expenses/import", () => {
  it("imports valid rows resolved by category name", async () => {
    const { POST } = await import("@/app/api/expenses/import/route");
    const csv = [
      "expense_date,entry_direction,category_name,subcategory_name,amount,note,reference",
      "2026-04-25,spending,Ads,Facebook,150000,April boost,INV-001"
    ].join("\n");
    const formData = new FormData();
    formData.append("file", new File([csv], "spend.csv", { type: "text/csv" }));

    const response = await POST(
      new Request("https://app.localhost/api/expenses/import", { method: "POST", body: formData })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.processed).toBe(1);
    expect(data.skipped_duplicates).toBe(0);
    expect(upsertMock).toHaveBeenCalledTimes(1);
    const payload = upsertMock.mock.calls[0]?.[0] as Array<Record<string, unknown>>;
    expect(payload[0]).toMatchObject({
      brand_id: BRAND_ID,
      entry_direction: "spending",
      category_id: CATEGORY_ID,
      subcategory_id: SUBCATEGORY_ID,
      amount: 150000,
      source: "csv_import"
    });
    expect(upsertMock.mock.calls[0]?.[1]).toEqual({ ignoreDuplicates: true });
  });

  it("rejects CSRF failures", async () => {
    assertCsrfAndOriginMock.mockResolvedValueOnce(false);
    const { POST } = await import("@/app/api/expenses/import/route");
    const formData = new FormData();
    formData.append("file", new File(["x"], "spend.csv", { type: "text/csv" }));

    const response = await POST(
      new Request("https://app.localhost/api/expenses/import", { method: "POST", body: formData })
    );
    expect(response.status).toBe(403);
  });

  it("returns row errors for invalid CSV values without writing", async () => {
    const { POST } = await import("@/app/api/expenses/import/route");
    const csv = [
      "expense_date,entry_direction,category_name,subcategory_name,amount,note,reference",
      "2026-02-30,out,Ads,Facebook,0,,"
    ].join("\n");
    const formData = new FormData();
    formData.append("file", new File([csv], "bad.csv", { type: "text/csv" }));

    const response = await POST(
      new Request("https://app.localhost/api/expenses/import", { method: "POST", body: formData })
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(Array.isArray(data.errors)).toBe(true);
    expect(upsertMock).not.toHaveBeenCalled();
  });
});
