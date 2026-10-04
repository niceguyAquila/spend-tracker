import { beforeEach, describe, expect, it, vi } from "vitest";

const insertMock = vi.fn();
const updateMock = vi.fn();
const deleteMaybeSingleMock = vi.fn();
const deleteSelectMock = vi.fn(() => ({ maybeSingle: deleteMaybeSingleMock }));
const deleteInMock = vi.fn().mockResolvedValue({ error: null });
const deleteEqIdMock = vi.fn(() => ({ select: deleteSelectMock }));
const updateEqIdMock = vi.fn();
const insertSelectSingleMock = vi.fn();
const groupInsertMock = vi.fn();
const groupInsertSingleMock = vi.fn();
const groupDeleteEqMock = vi.fn();
const requireAdminApiMock = vi.fn();
const assertCsrfAndOriginMock = vi.fn();
const getBigBookEntriesPagedMock = vi.fn();
const getBigBookLedgerRowsPagedMock = vi.fn();
const creditLookupMaybeSingleMock = vi.fn();
const creditLookupListResultMock = vi.fn();
const creditLookupEqMock = vi.fn(() => {
  return {
    maybeSingle: creditLookupMaybeSingleMock,
    then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
      // Only resolve the list shape when the query is awaited (settlements lookup).
      return Promise.resolve(creditLookupListResultMock()).then(onFulfilled, onRejected);
    }
  };
});
const creditLookupSelectMock = vi.fn(() => ({ eq: creditLookupEqMock }));
const kursTypesIlikeMock = vi.fn();
const kursTypesSelectMock = vi.fn(() => ({ ilike: kursTypesIlikeMock }));

let insertManyResponse: { data: Array<{ id: string }> | null; error: { message: string } | null } = {
  data: [{ id: "entry-1" }, { id: "entry-gas" }],
  error: null
};

let kursTypesResponse: {
  data: Array<{ id: string; name: string; is_active: boolean }> | null;
  error: { message: string } | null;
} = {
  data: [{ id: "kurs-type-1", name: "KURS", is_active: true }],
  error: null
};

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
          delete: vi.fn(() => ({ eq: deleteEqIdMock, in: deleteInMock })),
          select: (_columns?: string) => creditLookupSelectMock()
        };
      }
      if (table === "business_ledger_entry_groups") {
        return {
          insert: groupInsertMock,
          delete: vi.fn(() => ({ eq: groupDeleteEqMock }))
        };
      }
      if (table === "business_ledger_types") {
        return {
          select: kursTypesSelectMock
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

    insertManyResponse = {
      data: [{ id: "entry-1" }, { id: "entry-gas" }],
      error: null
    };
    kursTypesResponse = {
      data: [{ id: "kurs-type-1", name: "KURS", is_active: true }],
      error: null
    };
    insertMock.mockImplementation((rows: unknown) => ({
      select: vi.fn(() => {
        if (Array.isArray(rows)) {
          return Promise.resolve(insertManyResponse);
        }
        return { single: insertSelectSingleMock };
      })
    }));
    insertSelectSingleMock.mockResolvedValue({
      data: { id: "entry-1" },
      error: null
    });
    groupInsertMock.mockReturnValue({
      select: vi.fn(() => ({
        single: groupInsertSingleMock
      }))
    });
    groupInsertSingleMock.mockResolvedValue({ data: { id: "group-1" }, error: null });
    groupDeleteEqMock.mockResolvedValue({ error: null });
    kursTypesIlikeMock.mockImplementation(() => Promise.resolve(kursTypesResponse));
    updateEqIdMock.mockImplementation(() => ({
      error: null,
      is: vi.fn(() => ({
        select: vi.fn().mockResolvedValue({ data: [{ id: "attached-1" }], error: null })
      })),
      then(
        onFulfilled: (value: unknown) => unknown,
        onRejected?: (reason: unknown) => unknown
      ) {
        return Promise.resolve({ error: null }).then(onFulfilled, onRejected);
      }
    }));
    updateMock.mockReturnValue({
      eq: updateEqIdMock
    });
    deleteMaybeSingleMock.mockResolvedValue({ data: { id: "entry-1" }, error: null });
    deleteInMock.mockResolvedValue({ error: null });
    creditLookupMaybeSingleMock.mockResolvedValue({ data: null, error: null });
    creditLookupListResultMock.mockReturnValue({ data: [], error: null });
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
    expect(groupInsertMock).not.toHaveBeenCalled();
  });

  it("creates a grouped TRX gas-fee companion for a USDT entry", async () => {
    const { POST } = await import("@/app/api/big-book/entries/route");
    const request = new Request("https://app.localhost/api/big-book/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entry_date: "2026-04-23",
        entry_direction: "profit",
        entry_type_id: "11111111-1111-4111-8111-111111111111",
        entry_sub_type_id: "44444444-4444-4444-8444-444444444444",
        vendor_type_id: "66666666-6666-4666-8666-666666666666",
        vendor_id: "77777777-7777-4777-8777-777777777777",
        action_by_id: "99999999-9999-4999-8999-999999999999",
        explanation: "Vendor payout",
        amount: 250,
        currency_code: "USDT",
        gas_fee_amount: 1.33,
        remark: "Monthly run rate",
        responsible_actor_id: "22222222-2222-4222-8222-222222222222"
      })
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.id).toBe("entry-1");
    expect(groupInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "Vendor payout",
        remark: null,
        created_by: "auth-user-1"
      })
    );
    expect(insertMock).toHaveBeenCalledTimes(1);
    const inserted = insertMock.mock.calls[0][0] as unknown[];
    expect(inserted).toHaveLength(2);
    expect(inserted[0]).toMatchObject({
      group_id: "group-1",
      currency_code: "USDT",
      amount: 250,
      entry_direction: "profit",
      explanation: "Vendor payout"
    });
    expect(inserted[1]).toMatchObject({
      group_id: "group-1",
      currency_code: "TRX",
      amount: 1.33,
      entry_direction: "spending",
      pocket_id: null,
      is_credit: false,
      explanation: "Gas fee — Vendor payout",
      entry_sub_type_id: "44444444-4444-4444-8444-444444444444",
      vendor_id: "77777777-7777-4777-8777-777777777777",
      action_by_id: "99999999-9999-4999-8999-999999999999"
    });
    expect(groupDeleteEqMock).not.toHaveBeenCalled();
  });

  it("rolls back the gas-fee group when entry insert fails", async () => {
    insertManyResponse = { data: null, error: { message: "insert failed" } };
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
        gas_fee_amount: 1.33,
        remark: "",
        responsible_actor_id: "22222222-2222-4222-8222-222222222222"
      })
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("insert failed");
    expect(groupInsertMock).toHaveBeenCalled();
    expect(groupDeleteEqMock).toHaveBeenCalledWith("id", "group-1");
  });

  it("creates a grouped USDT KURS companion for a USDT inflow", async () => {
    insertManyResponse = {
      data: [{ id: "entry-1" }, { id: "entry-kurs" }],
      error: null
    };
    const { POST } = await import("@/app/api/big-book/entries/route");
    const request = new Request("https://app.localhost/api/big-book/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entry_date: "2026-04-23",
        entry_direction: "profit",
        entry_type_id: "11111111-1111-4111-8111-111111111111",
        entry_sub_type_id: "44444444-4444-4444-8444-444444444444",
        vendor_type_id: "66666666-6666-4666-8666-666666666666",
        vendor_id: "77777777-7777-4777-8777-777777777777",
        action_by_id: "99999999-9999-4999-8999-999999999999",
        explanation: "Vendor payout",
        amount: 1000,
        currency_code: "USDT",
        kurs_rate: 0.999423,
        remark: "Monthly run rate",
        responsible_actor_id: "22222222-2222-4222-8222-222222222222"
      })
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.id).toBe("entry-1");
    expect(kursTypesSelectMock).toHaveBeenCalled();
    expect(kursTypesIlikeMock).toHaveBeenCalledWith("name", "KURS");
    expect(groupInsertMock).toHaveBeenCalled();
    const inserted = insertMock.mock.calls[0][0] as unknown[];
    expect(inserted).toHaveLength(2);
    expect(inserted[0]).toMatchObject({
      group_id: "group-1",
      currency_code: "USDT",
      amount: 1000,
      entry_direction: "profit",
      explanation: "Vendor payout"
    });
    expect(inserted[1]).toMatchObject({
      group_id: "group-1",
      currency_code: "USDT",
      amount: 0.577,
      entry_direction: "spending",
      entry_type_id: "kurs-type-1",
      pocket_id: null,
      is_credit: false,
      explanation: "KURS — Vendor payout"
    });
  });

  it("fails create with a clear error when the KURS type is missing", async () => {
    kursTypesResponse = { data: [], error: null };
    const { POST } = await import("@/app/api/big-book/entries/route");
    const request = new Request("https://app.localhost/api/big-book/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entry_date: "2026-04-23",
        entry_direction: "profit",
        entry_type_id: "11111111-1111-4111-8111-111111111111",
        explanation: "Vendor payout",
        amount: 1000,
        currency_code: "USDT",
        kurs_rate: 0.999423,
        remark: "",
        responsible_actor_id: "22222222-2222-4222-8222-222222222222"
      })
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("KURS ledger type not found");
    expect(groupInsertMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("creates KURS and gas-fee companions together for a USDT inflow", async () => {
    insertManyResponse = {
      data: [{ id: "entry-1" }, { id: "entry-kurs" }, { id: "entry-gas" }],
      error: null
    };
    const { POST } = await import("@/app/api/big-book/entries/route");
    const request = new Request("https://app.localhost/api/big-book/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entry_date: "2026-04-23",
        entry_direction: "profit",
        entry_type_id: "11111111-1111-4111-8111-111111111111",
        explanation: "Vendor payout",
        amount: 1000,
        currency_code: "USDT",
        kurs_rate: 0.999423,
        gas_fee_amount: 1.33,
        remark: "",
        responsible_actor_id: "22222222-2222-4222-8222-222222222222"
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const inserted = insertMock.mock.calls[0][0] as unknown[];
    expect(inserted).toHaveLength(3);
    expect(inserted[1]).toMatchObject({
      currency_code: "USDT",
      entry_type_id: "kurs-type-1",
      amount: 0.577
    });
    expect(inserted[2]).toMatchObject({
      currency_code: "TRX",
      amount: 1.33
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

  it("forwards entryId for GET rows view", async () => {
    const { GET } = await import("@/app/api/big-book/entries/route");
    const request = new Request(
      "https://app.localhost/api/big-book/entries?view=rows&entryId=11111111-1111-4111-8111-111111111111"
    );

    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(getBigBookLedgerRowsPagedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        entryId: "11111111-1111-4111-8111-111111111111"
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
      is_debt: false,
      settles_entry_id: null,
      settlement_conversion_rate: null,
      settlement_amount_in_credit_currency: null
    });
  });

  it("creates a debt entry when is_debt is true", async () => {
    const { POST } = await import("@/app/api/big-book/entries/route");
    const request = new Request("https://app.localhost/api/big-book/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entry_date: "2026-04-23",
        entry_direction: "spending",
        entry_type_id: "11111111-1111-4111-8111-111111111111",
        explanation: "We owe vendor",
        amount: 1000,
        currency_code: "USDT",
        remark: "",
        responsible_actor_id: "22222222-2222-4222-8222-222222222222",
        is_debt: true
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(insertMock.mock.calls[0][0]).toMatchObject({
      is_credit: false,
      is_debt: true,
      settles_entry_id: null
    });
  });

  it("rejects is_credit and is_debt together on create", async () => {
    const { POST } = await import("@/app/api/big-book/entries/route");
    const request = new Request("https://app.localhost/api/big-book/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entry_date: "2026-04-23",
        entry_direction: "spending",
        entry_type_id: "11111111-1111-4111-8111-111111111111",
        explanation: "Both flags",
        amount: 1000,
        currency_code: "USDT",
        remark: "",
        responsible_actor_id: "22222222-2222-4222-8222-222222222222",
        is_credit: true,
        is_debt: true
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(insertMock).not.toHaveBeenCalled();
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

  it("creates a cross-currency IDR settlement without credit-currency amount", async () => {
    creditLookupMaybeSingleMock.mockResolvedValueOnce({
      data: {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        is_credit: true,
        settles_entry_id: null,
        currency_code: "MYR"
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
        amount: 100000,
        currency_code: "IDR",
        remark: "",
        responsible_actor_id: "22222222-2222-4222-8222-222222222222",
        settles_entry_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        settlement_conversion_rate: null
      })
    });

    const response = await POST(request);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.settlement_conversion_rate).toBeNull();
    expect(data.settlement_amount_in_credit_currency).toBeNull();
    expect(insertMock.mock.calls[0][0]).toMatchObject({
      currency_code: "IDR",
      amount: 100000,
      settles_entry_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      settlement_conversion_rate: null,
      settlement_amount_in_credit_currency: null,
      is_credit: false
    });
  });

  it("creates a USDT settlement against a MYR credit without a conversion rate", async () => {
    creditLookupMaybeSingleMock.mockResolvedValueOnce({
      data: {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        is_credit: true,
        settles_entry_id: null,
        currency_code: "MYR"
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
        explanation: "Settlement in USDT",
        amount: 100,
        currency_code: "USDT",
        remark: "",
        responsible_actor_id: "22222222-2222-4222-8222-222222222222",
        settles_entry_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        settlement_conversion_rate: null
      })
    });

    const response = await POST(request);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.settlement_conversion_rate).toBeNull();
    expect(data.settlement_amount_in_credit_currency).toBeNull();
    expect(insertMock.mock.calls[0][0]).toMatchObject({
      currency_code: "USDT",
      amount: 100,
      settles_entry_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      settlement_conversion_rate: null,
      settlement_amount_in_credit_currency: null,
      is_credit: false
    });
  });

  it("creates a USDT settlement with KURS companion against a MYR credit", async () => {
    creditLookupMaybeSingleMock.mockResolvedValueOnce({
      data: {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        is_credit: true,
        settles_entry_id: null,
        currency_code: "MYR"
      },
      error: null
    });
    insertManyResponse = {
      data: [{ id: "settle-1" }, { id: "kurs-1" }],
      error: null
    };

    const { POST } = await import("@/app/api/big-book/entries/route");
    const request = new Request("https://app.localhost/api/big-book/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entry_date: "2026-05-01",
        entry_direction: "profit",
        entry_type_id: "11111111-1111-4111-8111-111111111111",
        explanation: "Settlement for: Vendor invoice",
        amount: 100,
        currency_code: "USDT",
        remark: "",
        responsible_actor_id: "22222222-2222-4222-8222-222222222222",
        settles_entry_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        settlement_conversion_rate: 4.2,
        settlement_note: "",
        kurs_rate: 0.999423
      })
    });

    const response = await POST(request);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.id).toBe("settle-1");
    expect(data.settlement_conversion_rate).toBe(4.2);
    expect(data.settlement_amount_in_credit_currency).toBe(420);
    expect(groupInsertMock).toHaveBeenCalled();
    const inserted = insertMock.mock.calls[0][0] as unknown[];
    expect(inserted).toHaveLength(2);
    expect(inserted[0]).toMatchObject({
      group_id: "group-1",
      currency_code: "USDT",
      amount: 100,
      entry_direction: "profit",
      settles_entry_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      settlement_conversion_rate: 4.2,
      is_credit: false
    });
    expect(inserted[1]).toMatchObject({
      group_id: "group-1",
      currency_code: "USDT",
      amount: 0.0577,
      entry_direction: "spending",
      entry_type_id: "kurs-type-1",
      explanation: "KURS — Settlement for: Vendor invoice",
      is_credit: false
    });
  });

  it("rejects settling a non-credit non-debt entry", async () => {
    creditLookupMaybeSingleMock.mockResolvedValueOnce({
      data: {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        is_credit: false,
        is_debt: false,
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
    expect(data.error).toMatch(/not marked as credit or debt/i);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("creates an Out debt payment, groups it with the debt, and closes the debt", async () => {
    creditLookupMaybeSingleMock.mockResolvedValueOnce({
      data: {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        is_credit: false,
        is_debt: true,
        settles_entry_id: null,
        currency_code: "USDT",
        group_id: null,
        explanation: "Vendor invoice"
      },
      error: null
    });
    updateEqIdMock.mockImplementation(() => ({
      error: null,
      is: vi.fn(() => ({
        select: vi.fn().mockResolvedValue({
          data: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }],
          error: null
        })
      })),
      then(
        onFulfilled: (value: unknown) => unknown,
        onRejected?: (reason: unknown) => unknown
      ) {
        return Promise.resolve({ error: null }).then(onFulfilled, onRejected);
      }
    }));

    const { POST } = await import("@/app/api/big-book/entries/route");
    const request = new Request("https://app.localhost/api/big-book/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entry_date: "2026-05-01",
        entry_direction: "spending",
        entry_type_id: "11111111-1111-4111-8111-111111111111",
        explanation: "Debt payment for: Vendor invoice",
        amount: 100,
        currency_code: "USDT",
        remark: "",
        responsible_actor_id: "22222222-2222-4222-8222-222222222222",
        settles_entry_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        settlement_conversion_rate: 1,
        close_debt: true,
        debt_settlement_note: "Paid in full"
      })
    });

    const response = await POST(request);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.debt_closed).toBe(true);
    expect(groupInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ label: "Vendor invoice" })
    );
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ group_id: "group-1", updated_by: "auth-user-1" })
    );
    expect(insertMock).toHaveBeenCalled();
    const inserted = insertMock.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(inserted).toMatchObject({
      group_id: "group-1",
      entry_direction: "spending",
      is_credit: false,
      is_debt: false,
      settles_entry_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    });
  });

  it("reuses an existing debt group_id for debt payments", async () => {
    creditLookupMaybeSingleMock.mockResolvedValueOnce({
      data: {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        is_credit: false,
        is_debt: true,
        settles_entry_id: null,
        currency_code: "USDT",
        group_id: "existing-group",
        explanation: "Vendor invoice"
      },
      error: null
    });

    const { POST } = await import("@/app/api/big-book/entries/route");
    const request = new Request("https://app.localhost/api/big-book/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entry_date: "2026-05-01",
        entry_direction: "spending",
        entry_type_id: "11111111-1111-4111-8111-111111111111",
        explanation: "Debt payment for: Vendor invoice",
        amount: 40,
        currency_code: "USDT",
        remark: "",
        responsible_actor_id: "22222222-2222-4222-8222-222222222222",
        settles_entry_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        settlement_conversion_rate: 1
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(groupInsertMock).not.toHaveBeenCalled();
    const inserted = insertMock.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(inserted).toMatchObject({
      group_id: "existing-group",
      settles_entry_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    });
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

  it("accepts a settlement larger than the credit amount", async () => {
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
        explanation: "Overpayment settlement",
        amount: 1500,
        currency_code: "USDT",
        remark: "",
        responsible_actor_id: "22222222-2222-4222-8222-222222222222",
        settles_entry_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        settlement_conversion_rate: 1
      })
    });

    const response = await POST(request);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.settlement_amount_in_credit_currency).toBe(1500);
    expect(data.credit_closed).toBe(false);
    expect(insertMock.mock.calls[0][0]).toMatchObject({
      settlement_amount_in_credit_currency: 1500
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("stamps the parent credit when close_credit is true", async () => {
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
        explanation: "Final settlement",
        amount: 800,
        currency_code: "USDT",
        remark: "",
        responsible_actor_id: "22222222-2222-4222-8222-222222222222",
        settles_entry_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        settlement_conversion_rate: 1,
        close_credit: true,
        credit_settlement_note: "Short payment approved"
      })
    });

    const response = await POST(request);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.credit_closed).toBe(true);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        credit_settled_by: "auth-user-1",
        credit_settlement_note: "Short payment approved",
        updated_by: "auth-user-1"
      })
    );
    expect(updateEqIdMock).toHaveBeenCalledWith("id", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    const closePayload = updateMock.mock.calls[0][0];
    expect(typeof closePayload.credit_settled_at).toBe("string");
  });

  it("rejects deleting a credit/debt with settlements unless cascadeLinked is set", async () => {
    creditLookupMaybeSingleMock.mockResolvedValueOnce({
      data: {
        id: "entry-1",
        is_credit: true,
        is_debt: false,
        settles_entry_id: null
      },
      error: null
    });
    creditLookupListResultMock.mockReturnValueOnce({
      data: [{ id: "settle-1" }, { id: "settle-2" }],
      error: null
    });

    const { DELETE } = await import("@/app/api/big-book/entries/route");
    const request = new Request("https://app.localhost/api/big-book/entries?id=entry-1", {
      method: "DELETE"
    });

    const response = await DELETE(request);
    const data = await response.json();
    expect(response.status).toBe(400);
    expect(data.error).toMatch(/linked settlements/i);
    expect(deleteInMock).not.toHaveBeenCalled();
  });

  it("cascade-deletes an obligation and all linked settlements", async () => {
    creditLookupMaybeSingleMock.mockResolvedValueOnce({
      data: {
        id: "debt-1",
        is_credit: false,
        is_debt: true,
        settles_entry_id: null
      },
      error: null
    });
    creditLookupListResultMock.mockReturnValueOnce({
      data: [{ id: "pay-1" }, { id: "pay-2" }],
      error: null
    });
    deleteMaybeSingleMock.mockResolvedValueOnce({ data: { id: "debt-1" }, error: null });

    const { DELETE } = await import("@/app/api/big-book/entries/route");
    const request = new Request(
      "https://app.localhost/api/big-book/entries?id=debt-1&cascadeLinked=1",
      { method: "DELETE" }
    );

    const response = await DELETE(request);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.cascaded).toBe(true);
    expect(data.deleted_ids).toEqual(["pay-1", "pay-2", "debt-1"]);
    expect(deleteInMock).toHaveBeenCalledWith("id", ["pay-1", "pay-2"]);
    expect(deleteEqIdMock).toHaveBeenCalledWith("id", "debt-1");
  });

  it("cascade-deletes from a settlement row up through the parent obligation", async () => {
    creditLookupMaybeSingleMock.mockResolvedValueOnce({
      data: {
        id: "pay-1",
        is_credit: false,
        is_debt: false,
        settles_entry_id: "credit-1"
      },
      error: null
    });
    creditLookupListResultMock.mockReturnValueOnce({
      data: [{ id: "pay-1" }, { id: "pay-2" }],
      error: null
    });
    deleteMaybeSingleMock.mockResolvedValueOnce({ data: { id: "credit-1" }, error: null });

    const { DELETE } = await import("@/app/api/big-book/entries/route");
    const request = new Request(
      "https://app.localhost/api/big-book/entries?id=pay-1&cascadeLinked=1",
      { method: "DELETE" }
    );

    const response = await DELETE(request);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.cascaded).toBe(true);
    expect(data.deleted_ids).toEqual(["pay-1", "pay-2", "credit-1"]);
  });

  it("deletes entry and returns 200", async () => {
    creditLookupMaybeSingleMock.mockResolvedValueOnce({
      data: {
        id: "entry-1",
        is_credit: false,
        is_debt: false,
        settles_entry_id: null
      },
      error: null
    });

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
