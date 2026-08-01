import { beforeEach, describe, expect, it, vi } from "vitest";

const insertMock = vi.fn();
const updateMock = vi.fn();
const deleteMaybeSingleMock = vi.fn();
const deleteSelectMock = vi.fn(() => ({ maybeSingle: deleteMaybeSingleMock }));
const deleteEqIdMock = vi.fn(() => ({ select: deleteSelectMock }));
const updateEqIdMock = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }));
const insertSelectSingleMock = vi.fn();
const requireAdminApiMock = vi.fn();
const assertCsrfAndOriginMock = vi.fn();
const getBigBookEntriesPagedMock = vi.fn();
const getBigBookLedgerRowsPagedMock = vi.fn();
const creditLookupMaybeSingleMock = vi.fn();
const creditLookupEqMock = vi.fn(() => ({ maybeSingle: creditLookupMaybeSingleMock }));
const creditLookupSelectMock = vi.fn(() => ({ eq: creditLookupEqMock }));

vi.mock("@/lib/security/origin", () => ({
  assertCsrfAndOrigin: assertCsrfAndOriginMock,
  hasTrustedOrigin: vi.fn(() => true)
}));

vi.mock("@/lib/auth-api", () => ({
  requireAdminApi: requireAdminApiMock
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: vi.fn((table: string) => {
      if (table === "business_ledger_entries") {
        return {
          insert: insertMock,
          update: updateMock,
          delete: vi.fn(() => ({ eq: deleteEqIdMock })),
          select: (_columns?: string) => creditLookupSelectMock()
        };
      }
      return {};
    })
  }))
}));

vi.mock("@/lib/db/queries", () => ({
  getBigBookEntriesPaged: getBigBookEntriesPagedMock,
  getBigBookLedgerRowsPaged: getBigBookLedgerRowsPagedMock
}));

describe("big book entries route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      data: { id: "entry-1" },
      error: null
    });
    updateMock.mockReturnValue({
      eq: updateEqIdMock
    });
    deleteMaybeSingleMock.mockResolvedValue({ data: { id: "entry-1" }, error: null });
    creditLookupMaybeSingleMock.mockResolvedValue({ data: null, error: null });
    getBigBookEntriesPagedMock.mockResolvedValue({
      rows: [],
      totalCount: 0
    });
    getBigBookLedgerRowsPagedMock.mockResolvedValue({
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

  it("creates an entry for admin users", async () => {
    const { POST } = await import("@/app/api/big-book/entries/route");
    const request = new Request("https://app.localhost/api/big-book/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entry_date: "2026-04-23",
        entry_direction: "spending",
        entry_type_id: "11111111-1111-4111-8111-111111111111",
        explanation: "Operational cloud cost",
        amount: 1240.5,
        currency_code: "USDT",
        remark: "Monthly run rate",
        responsible_actor_id: "22222222-2222-4222-8222-222222222222"
      })
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.id).toBe("entry-1");
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock.mock.calls[0][0]).toMatchObject({
      entry_sub_type_id: null,
      vendor_type_id: null,
      vendor_id: null,
      pocket_id: null,
      action_by_id: null
    });
  });

  it("persists entry_sub_type_id on create when provided", async () => {
    const { POST } = await import("@/app/api/big-book/entries/route");
    const request = new Request("https://app.localhost/api/big-book/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entry_date: "2026-04-23",
        entry_direction: "spending",
        entry_type_id: "11111111-1111-4111-8111-111111111111",
        entry_sub_type_id: "44444444-4444-4444-8444-444444444444",
        explanation: "Operational cloud cost",
        amount: 1240.5,
        currency_code: "USDT",
        remark: "",
        responsible_actor_id: "22222222-2222-4222-8222-222222222222"
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(insertMock.mock.calls[0][0]).toMatchObject({
      entry_sub_type_id: "44444444-4444-4444-8444-444444444444"
    });
  });

  it("persists vendor fields on create when provided", async () => {
    const { POST } = await import("@/app/api/big-book/entries/route");
    const request = new Request("https://app.localhost/api/big-book/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entry_date: "2026-04-23",
        entry_direction: "spending",
        entry_type_id: "11111111-1111-4111-8111-111111111111",
        vendor_type_id: "66666666-6666-4666-8666-666666666666",
        vendor_id: "77777777-7777-4777-8777-777777777777",
        explanation: "Operational cloud cost",
        amount: 1240.5,
        currency_code: "USDT",
        remark: "",
        responsible_actor_id: "22222222-2222-4222-8222-222222222222"
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(insertMock.mock.calls[0][0]).toMatchObject({
      vendor_type_id: "66666666-6666-4666-8666-666666666666",
      vendor_id: "77777777-7777-4777-8777-777777777777"
    });
  });

  it("persists pocket_id on create when provided", async () => {
    const { POST } = await import("@/app/api/big-book/entries/route");
    const request = new Request("https://app.localhost/api/big-book/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entry_date: "2026-04-23",
        entry_direction: "spending",
        entry_type_id: "11111111-1111-4111-8111-111111111111",
        pocket_id: "88888888-8888-4888-8888-888888888888",
        explanation: "Petty cash spend",
        amount: 50000,
        currency_code: "IDR",
        remark: "",
        responsible_actor_id: "22222222-2222-4222-8222-222222222222"
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(insertMock.mock.calls[0][0]).toMatchObject({
      pocket_id: "88888888-8888-4888-8888-888888888888"
    });
  });

  it("persists action_by_id on create when provided", async () => {
    const { POST } = await import("@/app/api/big-book/entries/route");
    const request = new Request("https://app.localhost/api/big-book/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entry_date: "2026-04-23",
        entry_direction: "spending",
        entry_type_id: "11111111-1111-4111-8111-111111111111",
        action_by_id: "99999999-9999-4999-8999-999999999999",
        explanation: "Actioned by John",
        amount: 50000,
        currency_code: "IDR",
        remark: "",
        responsible_actor_id: "22222222-2222-4222-8222-222222222222"
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(insertMock.mock.calls[0][0]).toMatchObject({
      action_by_id: "99999999-9999-4999-8999-999999999999"
    });
  });

  it("persists entry_sub_type_id on patch when provided", async () => {
    const { PATCH } = await import("@/app/api/big-book/entries/route");
    const request = new Request("https://app.localhost/api/big-book/entries", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "55555555-5555-4555-8555-555555555555",
        entry_date: "2026-04-23",
        entry_direction: "spending",
        entry_type_id: "11111111-1111-4111-8111-111111111111",
        entry_sub_type_id: "44444444-4444-4444-8444-444444444444",
        explanation: "Operational cloud cost",
        amount: 1240.5,
        currency_code: "USDT",
        remark: "",
        responsible_actor_id: "22222222-2222-4222-8222-222222222222"
      })
    });

    const response = await PATCH(request);
    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock.mock.calls[0][0]).toMatchObject({
      entry_sub_type_id: "44444444-4444-4444-8444-444444444444"
    });
  });

  it("persists vendor fields on patch when provided", async () => {
    const { PATCH } = await import("@/app/api/big-book/entries/route");
    const request = new Request("https://app.localhost/api/big-book/entries", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "55555555-5555-4555-8555-555555555555",
        entry_date: "2026-04-23",
        entry_direction: "spending",
        entry_type_id: "11111111-1111-4111-8111-111111111111",
        vendor_type_id: "66666666-6666-4666-8666-666666666666",
        vendor_id: "77777777-7777-4777-8777-777777777777",
        explanation: "Operational cloud cost",
        amount: 1240.5,
        currency_code: "USDT",
        remark: "",
        responsible_actor_id: "22222222-2222-4222-8222-222222222222"
      })
    });

    const response = await PATCH(request);
    expect(response.status).toBe(200);
    expect(updateMock.mock.calls[0][0]).toMatchObject({
      vendor_type_id: "66666666-6666-4666-8666-666666666666",
      vendor_id: "77777777-7777-4777-8777-777777777777"
    });
  });

  it("persists pocket_id on patch when provided", async () => {
    const { PATCH } = await import("@/app/api/big-book/entries/route");
    const request = new Request("https://app.localhost/api/big-book/entries", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "55555555-5555-4555-8555-555555555555",
        entry_date: "2026-04-23",
        entry_direction: "spending",
        entry_type_id: "11111111-1111-4111-8111-111111111111",
        pocket_id: "88888888-8888-4888-8888-888888888888",
        explanation: "Petty cash spend",
        amount: 50000,
        currency_code: "IDR",
        remark: "",
        responsible_actor_id: "22222222-2222-4222-8222-222222222222"
      })
    });

    const response = await PATCH(request);
    expect(response.status).toBe(200);
    expect(updateMock.mock.calls[0][0]).toMatchObject({
      pocket_id: "88888888-8888-4888-8888-888888888888"
    });
  });

  it("persists action_by_id on patch when provided", async () => {
    const { PATCH } = await import("@/app/api/big-book/entries/route");
    const request = new Request("https://app.localhost/api/big-book/entries", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "55555555-5555-4555-8555-555555555555",
        entry_date: "2026-04-23",
        entry_direction: "spending",
        entry_type_id: "11111111-1111-4111-8111-111111111111",
        action_by_id: "99999999-9999-4999-8999-999999999999",
        explanation: "Actioned by John",
        amount: 50000,
        currency_code: "IDR",
        remark: "",
        responsible_actor_id: "22222222-2222-4222-8222-222222222222"
      })
    });

    const response = await PATCH(request);
    expect(response.status).toBe(200);
    expect(updateMock.mock.calls[0][0]).toMatchObject({
      action_by_id: "99999999-9999-4999-8999-999999999999"
    });
  });

  it("returns 403 when non-admin tries to create entry", async () => {
    requireAdminApiMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      message: "Admin access required"
    });
    const { POST } = await import("@/app/api/big-book/entries/route");
    const request = new Request("https://app.localhost/api/big-book/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
  });

  it("parses repeated categorical query params for GET list", async () => {
    const { GET } = await import("@/app/api/big-book/entries/route");
    const request = new Request(
      "https://app.localhost/api/big-book/entries?page=1&pageSize=25&typeId=11111111-1111-4111-8111-111111111111&typeId=22222222-2222-4222-8222-222222222222&currencyCode=USDT&currencyCode=IDR&actorId=33333333-3333-4333-8333-333333333333&direction=profit&direction=spending&vendorTypeId=66666666-6666-4666-8666-666666666666&vendorId=77777777-7777-4777-8777-777777777777&pocketId=88888888-8888-4888-8888-888888888888&query=test"
    );

    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(getBigBookEntriesPagedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        pageSize: 25,
        typeId: ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"],
        currencyCode: ["USDT", "IDR"],
        actorId: ["33333333-3333-4333-8333-333333333333"],
        direction: ["profit", "spending"],
        vendorTypeId: ["66666666-6666-4666-8666-666666666666"],
        vendorId: ["77777777-7777-4777-8777-777777777777"],
        pocketId: ["88888888-8888-4888-8888-888888888888"],
        query: "test"
      })
    );
  });

  it("returns 400 when GET has invalid categorical values", async () => {
    const { GET } = await import("@/app/api/big-book/entries/route");
    const request = new Request("https://app.localhost/api/big-book/entries?direction=invalid");

    const response = await GET(request);
    expect(response.status).toBe(400);
    expect(getBigBookEntriesPagedMock).not.toHaveBeenCalled();
  });

  it("defaults sortBy/sortDir for GET list", async () => {
    const { GET } = await import("@/app/api/big-book/entries/route");
    const request = new Request("https://app.localhost/api/big-book/entries?view=rows");

    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(getBigBookLedgerRowsPagedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sortBy: "entry_date",
        sortDir: "desc"
      })
    );
  });

  it("forwards sortBy/sortDir for GET rows view", async () => {
    const { GET } = await import("@/app/api/big-book/entries/route");
    const request = new Request(
      "https://app.localhost/api/big-book/entries?view=rows&sortBy=amount&sortDir=asc"
    );

    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(getBigBookLedgerRowsPagedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sortBy: "amount",
        sortDir: "asc"
      })
    );
  });

  it("returns 400 when GET has an unknown sort key", async () => {
    const { GET } = await import("@/app/api/big-book/entries/route");
    const request = new Request("https://app.localhost/api/big-book/entries?view=rows&sortBy=not_a_column");

    const response = await GET(request);
    expect(response.status).toBe(400);
    expect(getBigBookLedgerRowsPagedMock).not.toHaveBeenCalled();
  });

  it("creates a credit entry when is_credit is true", async () => {
    const { POST } = await import("@/app/api/big-book/entries/route");
    const request = new Request("https://app.localhost/api/big-book/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entry_date: "2026-04-23",
        entry_direction: "spending",
        entry_type_id: "11111111-1111-4111-8111-111111111111",
        explanation: "Vendor owes us",
        amount: 1000,
        currency_code: "USDT",
        remark: "",
        responsible_actor_id: "22222222-2222-4222-8222-222222222222",
        is_credit: true
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(insertMock.mock.calls[0][0]).toMatchObject({
      is_credit: true,
      settles_entry_id: null,
      settlement_conversion_rate: null,
      settlement_amount_in_credit_currency: null
    });
  });

  it("creates a same-currency settlement and forces conversion rate to 1", async () => {
    creditLookupMaybeSingleMock.mockResolvedValueOnce({
      data: {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        is_credit: true,
        settles_entry_id: null,
        currency_code: "USDT"
      },
      error: null
    });

    const { POST } = await import("@/app/api/big-book/entries/route");
    const request = new Request("https://app.localhost/api/big-book/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entry_date: "2026-05-01",
        entry_direction: "profit",
        entry_type_id: "11111111-1111-4111-8111-111111111111",
        explanation: "Settlement payment",
        amount: 400,
        currency_code: "USDT",
        remark: "",
        responsible_actor_id: "22222222-2222-4222-8222-222222222222",
        settles_entry_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        settlement_conversion_rate: 9,
        settlement_note: "Partial payment"
      })
    });

    const response = await POST(request);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.settlement_conversion_rate).toBe(1);
    expect(data.settlement_amount_in_credit_currency).toBe(400);
    expect(insertMock.mock.calls[0][0]).toMatchObject({
      is_credit: false,
      settles_entry_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      settlement_conversion_rate: 1,
      settlement_amount_in_credit_currency: 400,
      settlement_note: "Partial payment"
    });
  });

  it("creates a cross-currency settlement using the provided rate", async () => {
    creditLookupMaybeSingleMock.mockResolvedValueOnce({
      data: {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        is_credit: true,
        settles_entry_id: null,
        currency_code: "USDT"
      },
      error: null
    });

    const { POST } = await import("@/app/api/big-book/entries/route");
    const request = new Request("https://app.localhost/api/big-book/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entry_date: "2026-05-01",
        entry_direction: "profit",
        entry_type_id: "11111111-1111-4111-8111-111111111111",
        explanation: "Settlement in IDR",
        amount: 9000000,
        currency_code: "IDR",
        remark: "",
        responsible_actor_id: "22222222-2222-4222-8222-222222222222",
        settles_entry_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        settlement_conversion_rate: 0.000066,
        settlement_note: ""
      })
    });

    const response = await POST(request);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.settlement_conversion_rate).toBe(0.000066);
    expect(data.settlement_amount_in_credit_currency).toBe(594);
    expect(insertMock.mock.calls[0][0]).toMatchObject({
      settlement_conversion_rate: 0.000066,
      settlement_amount_in_credit_currency: 594
    });
  });

  it("rejects settling a non-credit entry", async () => {
    creditLookupMaybeSingleMock.mockResolvedValueOnce({
      data: {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        is_credit: false,
        settles_entry_id: null,
        currency_code: "USDT"
      },
      error: null
    });

    const { POST } = await import("@/app/api/big-book/entries/route");
    const request = new Request("https://app.localhost/api/big-book/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entry_date: "2026-05-01",
        entry_direction: "profit",
        entry_type_id: "11111111-1111-4111-8111-111111111111",
        explanation: "Bad settlement",
        amount: 100,
        currency_code: "USDT",
        remark: "",
        responsible_actor_id: "22222222-2222-4222-8222-222222222222",
        settles_entry_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        settlement_conversion_rate: 1
      })
    });

    const response = await POST(request);
    const data = await response.json();
    expect(response.status).toBe(400);
    expect(data.error).toMatch(/not marked as credit/i);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("rejects settlement chains", async () => {
    creditLookupMaybeSingleMock.mockResolvedValueOnce({
      data: {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        is_credit: true,
        settles_entry_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        currency_code: "USDT"
      },
      error: null
    });

    const { POST } = await import("@/app/api/big-book/entries/route");
    const request = new Request("https://app.localhost/api/big-book/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entry_date: "2026-05-01",
        entry_direction: "profit",
        entry_type_id: "11111111-1111-4111-8111-111111111111",
        explanation: "Chained settlement",
        amount: 100,
        currency_code: "USDT",
        remark: "",
        responsible_actor_id: "22222222-2222-4222-8222-222222222222",
        settles_entry_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        settlement_conversion_rate: 1
      })
    });

    const response = await POST(request);
    const data = await response.json();
    expect(response.status).toBe(400);
    expect(data.error).toMatch(/chains are not allowed/i);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("rejects is_credit combined with settles_entry_id", async () => {
    const { POST } = await import("@/app/api/big-book/entries/route");
    const request = new Request("https://app.localhost/api/big-book/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entry_date: "2026-05-01",
        entry_direction: "profit",
        entry_type_id: "11111111-1111-4111-8111-111111111111",
        explanation: "Invalid combo",
        amount: 100,
        currency_code: "USDT",
        remark: "",
        responsible_actor_id: "22222222-2222-4222-8222-222222222222",
        is_credit: true,
        settles_entry_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        settlement_conversion_rate: 1
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("maps FK restrict delete errors to a readable message", async () => {
    deleteMaybeSingleMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'update or delete on table "business_ledger_entries" violates foreign key constraint' }
    });

    const { DELETE } = await import("@/app/api/big-book/entries/route");
    const request = new Request("https://app.localhost/api/big-book/entries?id=entry-1", {
      method: "DELETE"
    });

    const response = await DELETE(request);
    const data = await response.json();
    expect(response.status).toBe(400);
    expect(data.error).toBe("This credit has settlements. Delete them first.");
  });

  it("deletes entry and returns 200", async () => {
    const { DELETE } = await import("@/app/api/big-book/entries/route");
    const request = new Request("https://app.localhost/api/big-book/entries?id=entry-1", {
      method: "DELETE"
    });

    const response = await DELETE(request);
    expect(response.status).toBe(200);
    expect(deleteEqIdMock).toHaveBeenCalledWith("id", "entry-1");
    expect(deleteSelectMock).toHaveBeenCalled();
  });
});
