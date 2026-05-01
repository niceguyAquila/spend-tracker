import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminApiMock = vi.fn();
const assertCsrfAndOriginMock = vi.fn();
const insertMock = vi.fn();
const insertSelectSingleMock = vi.fn();
const updateMock = vi.fn();
const updateEqMock = vi.fn();
const deleteEqMock = vi.fn();
const deleteSelectMock = vi.fn();
const deleteMaybeSingleMock = vi.fn();
const entryMaybeSingleMock = vi.fn();
const entrySelectEqMock = vi.fn(() => ({ maybeSingle: entryMaybeSingleMock }));
const entrySelectMock = vi.fn(() => ({ eq: entrySelectEqMock }));
const settlementSelectMaybeSingleMock = vi.fn();
const settlementSelectEqMock = vi.fn(() => ({ maybeSingle: settlementSelectMaybeSingleMock }));
const settlementSelectMock = vi.fn(() => ({ eq: settlementSelectEqMock }));
const getCreditBookSettlementsForEntryMock = vi.fn();

vi.mock("@/lib/auth-api", () => ({
  requireAdminApi: requireAdminApiMock
}));

vi.mock("@/lib/security/origin", () => ({
  assertCsrfAndOrigin: assertCsrfAndOriginMock,
  hasTrustedOrigin: vi.fn(() => true)
}));

vi.mock("@/lib/db/queries", () => ({
  getCreditBookSettlementsForEntry: getCreditBookSettlementsForEntryMock
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: vi.fn((table: string) => {
      if (table === "credit_ledger_settlements") {
        return {
          insert: insertMock,
          update: updateMock,
          delete: vi.fn(() => ({ eq: deleteEqMock })),
          select: settlementSelectMock
        };
      }
      if (table === "credit_ledger_entries") {
        return {
          select: entrySelectMock
        };
      }
      return {};
    })
  }))
}));

describe("credit big book settlements route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertCsrfAndOriginMock.mockResolvedValue(true);
    requireAdminApiMock.mockResolvedValue({
      ok: true,
      activeBrandId: "brand-1",
      user: { id: "auth-user-1" }
    });

    entryMaybeSingleMock.mockResolvedValue({
      data: { id: "11111111-1111-4111-8111-111111111111", currency_code: "MYR" },
      error: null
    });
    insertMock.mockReturnValue({
      select: vi.fn(() => ({
        single: insertSelectSingleMock
      }))
    });
    insertSelectSingleMock.mockResolvedValue({
      data: { id: "settlement-1" },
      error: null
    });
    updateMock.mockReturnValue({
      eq: updateEqMock
    });
    updateEqMock.mockResolvedValue({ error: null });
    deleteEqMock.mockReturnValue({
      select: deleteSelectMock
    });
    deleteSelectMock.mockReturnValue({
      maybeSingle: deleteMaybeSingleMock
    });
    deleteMaybeSingleMock.mockResolvedValue({ data: { id: "settlement-1" }, error: null });
    settlementSelectMaybeSingleMock.mockResolvedValue({
      data: {
        id: "44444444-4444-4444-8444-444444444444",
        entry_id: "11111111-1111-4111-8111-111111111111",
        amount: 100,
        settlement_currency_code: "MYR",
        conversion_rate: 1,
        credit_ledger_entries: { currency_code: "MYR" }
      },
      error: null
    });
    getCreditBookSettlementsForEntryMock.mockResolvedValue([]);
  });

  it("creates a same-currency settlement and forces conversion_rate to 1", async () => {
    const { POST } = await import("@/app/api/credit-big-book/settlements/route");
    const request = new Request("https://app.localhost/api/credit-big-book/settlements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entry_id: "11111111-1111-4111-8111-111111111111",
        settlement_date: "2026-05-01",
        amount: 250.5,
        settlement_currency_code: "MYR",
        conversion_rate: 5,
        note: "First installment"
      })
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.id).toBe("settlement-1");
    expect(data.conversion_rate).toBe(1);
    expect(data.amount_in_entry_currency).toBe(250.5);
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock.mock.calls[0][0]).toMatchObject({
      entry_id: "11111111-1111-4111-8111-111111111111",
      settlement_date: "2026-05-01",
      amount: 250.5,
      settlement_currency_code: "MYR",
      conversion_rate: 1,
      amount_in_entry_currency: 250.5,
      note: "First installment"
    });
  });

  it("creates a cross-currency settlement and computes amount_in_entry_currency", async () => {
    const { POST } = await import("@/app/api/credit-big-book/settlements/route");
    const request = new Request("https://app.localhost/api/credit-big-book/settlements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entry_id: "11111111-1111-4111-8111-111111111111",
        settlement_date: "2026-05-01",
        amount: 1000,
        settlement_currency_code: "USDT",
        conversion_rate: 4.7,
        note: ""
      })
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.conversion_rate).toBe(4.7);
    expect(data.settlement_currency_code).toBe("USDT");
    expect(data.amount_in_entry_currency).toBe(4700);
    expect(insertMock.mock.calls[0][0]).toMatchObject({
      settlement_currency_code: "USDT",
      conversion_rate: 4.7,
      amount_in_entry_currency: 4700
    });
  });

  it("returns 400 when conversion_rate is missing", async () => {
    const { POST } = await import("@/app/api/credit-big-book/settlements/route");
    const request = new Request("https://app.localhost/api/credit-big-book/settlements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entry_id: "11111111-1111-4111-8111-111111111111",
        settlement_date: "2026-05-01",
        amount: 100,
        settlement_currency_code: "USDT"
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("returns 400 when conversion_rate is not positive", async () => {
    const { POST } = await import("@/app/api/credit-big-book/settlements/route");
    const request = new Request("https://app.localhost/api/credit-big-book/settlements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entry_id: "11111111-1111-4111-8111-111111111111",
        settlement_date: "2026-05-01",
        amount: 100,
        settlement_currency_code: "USDT",
        conversion_rate: 0
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("returns 400 when payload is invalid (missing amount)", async () => {
    const { POST } = await import("@/app/api/credit-big-book/settlements/route");
    const request = new Request("https://app.localhost/api/credit-big-book/settlements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entry_id: "11111111-1111-4111-8111-111111111111",
        settlement_date: "2026-05-01",
        settlement_currency_code: "MYR",
        conversion_rate: 1
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("returns 403 for non-admin users on POST", async () => {
    requireAdminApiMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      message: "Admin access required"
    });
    const { POST } = await import("@/app/api/credit-big-book/settlements/route");
    const request = new Request("https://app.localhost/api/credit-big-book/settlements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entry_id: "11111111-1111-4111-8111-111111111111",
        settlement_date: "2026-05-01",
        amount: 100,
        settlement_currency_code: "MYR",
        conversion_rate: 1
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the parent entry does not exist", async () => {
    entryMaybeSingleMock.mockResolvedValueOnce({ data: null, error: null });
    const { POST } = await import("@/app/api/credit-big-book/settlements/route");
    const request = new Request("https://app.localhost/api/credit-big-book/settlements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entry_id: "11111111-1111-4111-8111-111111111111",
        settlement_date: "2026-05-01",
        amount: 100,
        settlement_currency_code: "MYR",
        conversion_rate: 1
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(404);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("surfaces trigger errors when settlement amount exceeds outstanding", async () => {
    insertSelectSingleMock.mockResolvedValueOnce({
      data: null,
      error: { message: "settlement amount 100 exceeds outstanding balance" }
    });
    const { POST } = await import("@/app/api/credit-big-book/settlements/route");
    const request = new Request("https://app.localhost/api/credit-big-book/settlements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entry_id: "11111111-1111-4111-8111-111111111111",
        settlement_date: "2026-05-01",
        amount: 100,
        settlement_currency_code: "MYR",
        conversion_rate: 1
      })
    });

    const response = await POST(request);
    const data = await response.json();
    expect(response.status).toBe(400);
    expect(data.error).toContain("exceeds outstanding");
  });

  it("updates a settlement on PATCH and recomputes amount_in_entry_currency", async () => {
    const { PATCH } = await import("@/app/api/credit-big-book/settlements/route");
    const request = new Request("https://app.localhost/api/credit-big-book/settlements", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "44444444-4444-4444-8444-444444444444",
        amount: 75,
        note: "Adjusted"
      })
    });

    const response = await PATCH(request);
    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock.mock.calls[0][0]).toMatchObject({
      amount: 75,
      note: "Adjusted",
      conversion_rate: 1,
      settlement_currency_code: "MYR",
      amount_in_entry_currency: 75
    });
  });

  it("forces conversion_rate to 1 on PATCH when settlement currency equals entry currency", async () => {
    const { PATCH } = await import("@/app/api/credit-big-book/settlements/route");
    const request = new Request("https://app.localhost/api/credit-big-book/settlements", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "44444444-4444-4444-8444-444444444444",
        amount: 100,
        settlement_currency_code: "MYR",
        conversion_rate: 4.7
      })
    });

    const response = await PATCH(request);
    expect(response.status).toBe(200);
    expect(updateMock.mock.calls[0][0]).toMatchObject({
      amount: 100,
      settlement_currency_code: "MYR",
      conversion_rate: 1,
      amount_in_entry_currency: 100
    });
  });

  it("computes amount_in_entry_currency on PATCH for cross-currency change", async () => {
    const { PATCH } = await import("@/app/api/credit-big-book/settlements/route");
    const request = new Request("https://app.localhost/api/credit-big-book/settlements", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "44444444-4444-4444-8444-444444444444",
        amount: 50,
        settlement_currency_code: "USDT",
        conversion_rate: 4.5
      })
    });

    const response = await PATCH(request);
    expect(response.status).toBe(200);
    expect(updateMock.mock.calls[0][0]).toMatchObject({
      amount: 50,
      settlement_currency_code: "USDT",
      conversion_rate: 4.5,
      amount_in_entry_currency: 225
    });
  });

  it("deletes a settlement on DELETE", async () => {
    const { DELETE } = await import("@/app/api/credit-big-book/settlements/route");
    const request = new Request(
      "https://app.localhost/api/credit-big-book/settlements?id=44444444-4444-4444-8444-444444444444",
      { method: "DELETE" }
    );

    const response = await DELETE(request);
    expect(response.status).toBe(200);
    expect(deleteEqMock).toHaveBeenCalledWith("id", "44444444-4444-4444-8444-444444444444");
  });

  it("returns 400 on DELETE without id param", async () => {
    const { DELETE } = await import("@/app/api/credit-big-book/settlements/route");
    const request = new Request("https://app.localhost/api/credit-big-book/settlements", {
      method: "DELETE"
    });

    const response = await DELETE(request);
    expect(response.status).toBe(400);
    expect(deleteEqMock).not.toHaveBeenCalled();
  });

  it("lists settlements for entry on GET", async () => {
    getCreditBookSettlementsForEntryMock.mockResolvedValueOnce([
      {
        id: "settlement-1",
        entry_id: "11111111-1111-4111-8111-111111111111",
        settlement_date: "2026-05-01",
        amount: 100,
        settlement_currency_code: "MYR",
        conversion_rate: 1,
        amount_in_entry_currency: 100,
        note: null,
        created_by: null,
        updated_by: null,
        created_at: "2026-05-01T00:00:00Z",
        updated_at: "2026-05-01T00:00:00Z",
        creator_display_name: "-",
        updater_display_name: "-",
        attachments: []
      }
    ]);

    const { GET } = await import("@/app/api/credit-big-book/settlements/route");
    const request = new Request(
      "https://app.localhost/api/credit-big-book/settlements?entryId=11111111-1111-4111-8111-111111111111"
    );

    const response = await GET(request);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(getCreditBookSettlementsForEntryMock).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111"
    );
    expect(Array.isArray(data.settlements)).toBe(true);
    expect(data.settlements).toHaveLength(1);
  });

  it("returns 400 when GET has invalid entryId", async () => {
    const { GET } = await import("@/app/api/credit-big-book/settlements/route");
    const request = new Request(
      "https://app.localhost/api/credit-big-book/settlements?entryId=not-a-uuid"
    );

    const response = await GET(request);
    expect(response.status).toBe(400);
    expect(getCreditBookSettlementsForEntryMock).not.toHaveBeenCalled();
  });
});
