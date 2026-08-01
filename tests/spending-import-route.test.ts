import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireFinanceApiMock = vi.fn();
const assertCsrfAndOriginMock = vi.fn();
const upsertMock = vi.fn();
const categorySelectMock = vi.fn();
const typeSelectMock = vi.fn();
const staffSelectMock = vi.fn();

const CATEGORY_ID = "11111111-1111-4111-8111-111111111111";
const TYPE_ID = "22222222-2222-4222-8222-222222222222";
const STAFF_ID = "44444444-4444-4444-8444-444444444444";
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
              data: [{ id: CATEGORY_ID, name: "Facebook", is_active: true }],
              error: null
            });
          },
          insert: vi.fn(() => createSelectChain({ data: null, error: null }))
        };
      }
      if (table === "expense_types") {
        return {
          select: (...args: unknown[]) => {
            typeSelectMock(...args);
            return createSelectChain({
              data: [{ id: TYPE_ID, name: "Ads", is_active: true }],
              error: null
            });
          }
        };
      }
      if (table === "expense_staff") {
        return {
          select: (...args: unknown[]) => {
            staffSelectMock(...args);
            return createSelectChain({
              data: [{ id: STAFF_ID, name: "John", is_active: true }],
              error: null
            });
          }
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
  it("imports valid rows resolved by type/category/staff name", async () => {
    const { POST } = await import("@/app/api/expenses/import/route");
    const csv = [
      "date,type,category,description,staff,currency,amount,cash_flow,remarks",
      "2026-04-25,Ads,Facebook,April boost,John,IDR,150000,spending,INV-001"
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
      currency_code: "IDR",
      category_id: CATEGORY_ID,
      type_id: TYPE_ID,
      staff_id: STAFF_ID,
      amount: 150000,
      description: "April boost",
      remarks: "INV-001",
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
      "date,type,category,description,staff,currency,amount,cash_flow,remarks",
      "2026-02-30,,,,,,0,out,"
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
