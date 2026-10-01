import { beforeEach, describe, expect, it, vi } from "vitest";

const insertMock = vi.fn();
const insertSelectSingleMock = vi.fn();
const updateMock = vi.fn();
const updateEqMock = vi.fn();
const deleteMock = vi.fn();
const deleteEqMock = vi.fn();
const selectListMock = vi.fn();
const maybeSingleMocks: Array<ReturnType<typeof vi.fn>> = [];

const requireAdminApiMock = vi.fn();
const assertCsrfAndOriginMock = vi.fn();

vi.mock("@/lib/security/origin", () => ({
  assertCsrfAndOrigin: assertCsrfAndOriginMock,
  hasTrustedOrigin: vi.fn(() => true)
}));

vi.mock("@/lib/auth-api", () => ({
  requireAdminApi: requireAdminApiMock
}));

function chainSelect() {
  const maybeSingle = vi.fn();
  maybeSingleMocks.push(maybeSingle);
  const eq = vi.fn(() => ({
    maybeSingle,
    neq: vi.fn(() => ({ maybeSingle })),
    eq: vi.fn(() => ({ maybeSingle }))
  }));
  return {
    select: vi.fn(() => ({
      eq,
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
      maybeSingle
    })),
    insert: insertMock,
    update: updateMock,
    delete: deleteMock
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: vi.fn((table: string) => {
      if (
        table === "business_ledger_type_vendor_type_maps" ||
        table === "business_ledger_types" ||
        table === "business_ledger_vendor_types"
      ) {
        return chainSelect();
      }
      return {};
    })
  }))
}));

describe("big book type-vendor-type-maps route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    maybeSingleMocks.length = 0;
    assertCsrfAndOriginMock.mockResolvedValue(true);
    requireAdminApiMock.mockResolvedValue({
      ok: true,
      activeBrandId: "brand-1",
      user: { id: "auth-user-1" }
    });

    insertMock.mockReturnValue({
      select: vi.fn(() => ({
        single: insertSelectSingleMock
      }))
    });
    insertSelectSingleMock.mockResolvedValue({
      data: { id: "map-1" },
      error: null
    });

    updateMock.mockReturnValue({ eq: updateEqMock });
    updateEqMock.mockResolvedValue({ error: null });
    deleteMock.mockReturnValue({ eq: deleteEqMock });
    deleteEqMock.mockResolvedValue({ error: null });
  });

  it("creates a type → vendor type mapping", async () => {
    // type exists, vendor type exists, no conflict
    const typeExists = vi.fn().mockResolvedValue({ data: { id: "type-1" }, error: null });
    const vendorExists = vi.fn().mockResolvedValue({ data: { id: "vt-1" }, error: null });
    const noConflict = vi.fn().mockResolvedValue({ data: null, error: null });

    let call = 0;
    const { createClient } = await import("@/lib/supabase/server");
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "business_ledger_types") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({ maybeSingle: typeExists }))
            }))
          };
        }
        if (table === "business_ledger_vendor_types") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({ maybeSingle: vendorExists }))
            }))
          };
        }
        if (table === "business_ledger_type_vendor_type_maps") {
          call += 1;
          if (call === 1) {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({ maybeSingle: noConflict }))
              })),
              insert: insertMock
            };
          }
          return { insert: insertMock };
        }
        return {};
      })
    } as never);

    const { POST } = await import("@/app/api/big-book/type-vendor-type-maps/route");
    const request = new Request("https://app.localhost/api/big-book/type-vendor-type-maps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entry_type_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        vendor_type_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
      })
    });

    const response = await POST(request);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.id).toBe("map-1");
  });
});
