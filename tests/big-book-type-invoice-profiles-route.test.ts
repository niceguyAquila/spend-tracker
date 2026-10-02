import { beforeEach, describe, expect, it, vi } from "vitest";

const upsertMock = vi.fn();
const upsertSelectSingleMock = vi.fn();
const typeSelectMaybeSingleMock = vi.fn();
const profilesSelectMock = vi.fn();

const requireAdminApiMock = vi.fn();
const assertCsrfAndOriginMock = vi.fn();
const getProfilesMock = vi.fn();

vi.mock("@/lib/security/origin", () => ({
  assertCsrfAndOrigin: assertCsrfAndOriginMock,
  hasTrustedOrigin: vi.fn(() => true)
}));

vi.mock("@/lib/auth-api", () => ({
  requireAdminApi: requireAdminApiMock
}));

vi.mock("@/lib/db/queries", () => ({
  getBigBookLedgerTypeInvoiceProfiles: getProfilesMock
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: vi.fn((table: string) => {
      if (table === "business_ledger_type_invoice_profiles") {
        return {
          upsert: upsertMock,
          select: profilesSelectMock
        };
      }
      if (table === "business_ledger_types") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: typeSelectMaybeSingleMock
            }))
          }))
        };
      }
      return {};
    })
  }))
}));

const TYPE_ID = "44444444-4444-4444-8444-444444444444";

describe("big book type invoice profiles route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertCsrfAndOriginMock.mockResolvedValue(true);
    requireAdminApiMock.mockResolvedValue({ ok: true, user: { id: "auth-user-1" } });
    getProfilesMock.mockResolvedValue([
      {
        type_id: TYPE_ID,
        pic_name: "Alex",
        pic_passport: "P1",
        pic_address: "Addr",
        pic_phone: "+1",
        bill_to_company: "",
        background_color: "#AABBCC",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
        type_name: "IP Group",
        type_code: "IP",
        type_is_active: true
      }
    ]);
    typeSelectMaybeSingleMock.mockResolvedValue({ data: { id: TYPE_ID }, error: null });
    upsertMock.mockReturnValue({
      select: vi.fn(() => ({
        single: upsertSelectSingleMock
      }))
    });
    upsertSelectSingleMock.mockResolvedValue({ data: { type_id: TYPE_ID }, error: null });
  });

  it("lists profiles for admins", async () => {
    const { GET } = await import("@/app/api/big-book/type-invoice-profiles/route");
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.rows).toHaveLength(1);
    expect(data.rows[0].type_name).toBe("IP Group");
  });

  it("upserts a profile", async () => {
    const { PUT } = await import("@/app/api/big-book/type-invoice-profiles/route");
    const request = new Request("https://app.localhost/api/big-book/type-invoice-profiles", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type_id: TYPE_ID,
        pic_name: "Alex",
        pic_passport: "P1",
        pic_address: "Jakarta",
        pic_phone: "+62",
        bill_to_company: "IP Co",
        background_color: "#E8F4FF"
      })
    });

    const response = await PUT(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.type_id).toBe(TYPE_ID);
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type_id: TYPE_ID,
        pic_name: "Alex",
        background_color: "#E8F4FF"
      }),
      { onConflict: "type_id" }
    );
  });

  it("rejects invalid hex colors", async () => {
    const { PUT } = await import("@/app/api/big-book/type-invoice-profiles/route");
    const request = new Request("https://app.localhost/api/big-book/type-invoice-profiles", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type_id: TYPE_ID,
        background_color: "red"
      })
    });

    const response = await PUT(request);
    expect(response.status).toBe(400);
    expect(upsertMock).not.toHaveBeenCalled();
  });
});
