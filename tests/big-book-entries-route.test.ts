import { beforeEach, describe, expect, it, vi } from "vitest";

const insertMock = vi.fn();
const updateMock = vi.fn();
const EXPECTED_UPDATED_AT = "2026-04-23T10:00:00.000Z";
const deleteMaybeSingleMock = vi.fn();
const deleteSelectMock = vi.fn(() => ({ maybeSingle: deleteMaybeSingleMock }));
const deleteInMock = vi.fn().mockResolvedValue({ error: null });
const deleteEqUpdatedAtMock = vi.fn(() => ({ select: deleteSelectMock }));
const deleteEqIdMock = vi.fn(() => ({
  eq: deleteEqUpdatedAtMock,
  select: deleteSelectMock
}));
const updateMaybeSingleMock = vi.fn();
const updateSelectMock = vi.fn(() => ({ maybeSingle: updateMaybeSingleMock }));
const updateEqUpdatedAtMock = vi.fn(() => ({ select: updateSelectMock }));
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
const rpcMock = vi.fn();

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
    rpc: rpcMock,
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
    updateMaybeSingleMock.mockResolvedValue({
      data: { id: "55555555-5555-4555-8555-555555555555", updated_at: EXPECTED_UPDATED_AT },
      error: null
    });
    updateEqIdMock.mockImplementation(() => ({
      eq: updateEqUpdatedAtMock,
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
    rpcMock.mockResolvedValue({
      data: { deleted_ids: ["entry-1"], cascaded: false },
      error: null
    });
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


  it("persists vendor fields on patch when provided", async () => {
    const { PATCH } = await import("@/app/api/big-book/entries/route");
    const request = new Request("https://app.localhost/api/big-book/entries", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "55555555-5555-4555-8555-555555555555",
        expected_updated_at: EXPECTED_UPDATED_AT,
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
        expected_updated_at: EXPECTED_UPDATED_AT,
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
        expected_updated_at: EXPECTED_UPDATED_AT,
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
      is_debt: false
    });
    expect(rpcMock).not.toHaveBeenCalled();
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
      is_debt: true
    });
    expect(rpcMock).not.toHaveBeenCalled();
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

  const OBLIGATION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const REQUEST_ID = "99999999-9999-4999-8999-999999999999";

  function settlementBody(overrides: Record<string, unknown> = {}) {
    return {
      entry_date: "2026-05-01",
      entry_direction: "profit",
      entry_type_id: "11111111-1111-4111-8111-111111111111",
      explanation: "Settlement payment",
      amount: 400,
      currency_code: "USDT",
      remark: "",
      responsible_actor_id: "22222222-2222-4222-8222-222222222222",
      settles: OBLIGATION_ID,
      client_request_id: REQUEST_ID,
      settlement_conversion_rate: 1,
      ...overrides
    };
  }

  it("records one settlement for the selected obligation and amount", async () => {
    rpcMock.mockResolvedValueOnce({
      data: {
        status: "created",
        group_id: null,
        payments: [
          {
            payment_id: "settle-1",
            amount: 400,
            currency_code: "USDT",
            allocations: [{ obligation_id: OBLIGATION_ID, applied_amount: 400 }]
          }
        ],
        companion_ids: [],
        closed_obligation_ids: [],
        unallocated_obligation_ids: []
      },
      error: null
    });

    const { POST } = await import("@/app/api/big-book/entries/route");
    const request = new Request("https://app.localhost/api/big-book/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settlementBody({ settlement_conversion_rate: 9 }))
    });

    const response = await POST(request);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.id).toBe("settle-1");
    expect(data.payments[0].allocations[0]).toMatchObject({
      obligation_id: OBLIGATION_ID,
      applied_amount: 400
    });
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith(
      "big_book_record_settlement",
      expect.objectContaining({
        p_request_id: REQUEST_ID,
        p_mode: "single",
        p_obligation_ids: [OBLIGATION_ID],
        p_amount: 400,
        p_currency_code: "USDT",
        p_conversion_rate: 9
      })
    );
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("passes a null conversion rate through on a cross-currency settlement", async () => {
    rpcMock.mockResolvedValueOnce({
      data: {
        status: "created",
        group_id: null,
        payments: [
          {
            payment_id: "settle-1",
            amount: 100000,
            currency_code: "IDR",
            allocations: [{ obligation_id: OBLIGATION_ID, applied_amount: 100 }]
          }
        ],
        companion_ids: [],
        closed_obligation_ids: [],
        unallocated_obligation_ids: []
      },
      error: null
    });

    const { POST } = await import("@/app/api/big-book/entries/route");
    const request = new Request("https://app.localhost/api/big-book/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        settlementBody({
          amount: 100000,
          currency_code: "IDR",
          settlement_conversion_rate: null
        })
      )
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith(
      "big_book_record_settlement",
      expect.objectContaining({
        p_obligation_ids: [OBLIGATION_ID],
        p_amount: 100000,
        p_currency_code: "IDR",
        p_conversion_rate: null
      })
    );
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("forwards close and a kurs companion on the settlement call", async () => {
    rpcMock.mockResolvedValueOnce({
      data: {
        status: "created",
        group_id: "group-1",
        payments: [
          {
            payment_id: "settle-1",
            amount: 100,
            currency_code: "USDT",
            allocations: [{ obligation_id: OBLIGATION_ID, applied_amount: 420 }]
          }
        ],
        companion_ids: ["kurs-1"],
        closed_obligation_ids: [OBLIGATION_ID],
        unallocated_obligation_ids: []
      },
      error: null
    });

    const { POST } = await import("@/app/api/big-book/entries/route");
    const request = new Request("https://app.localhost/api/big-book/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        settlementBody({
          amount: 100,
          settlement_conversion_rate: 4.2,
          close: true,
          close_note: "Short payment approved",
          kurs_rate: 0.999423
        })
      )
    });

    const response = await POST(request);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.closed_obligation_ids).toEqual([OBLIGATION_ID]);
    expect(data.companion_ids).toEqual(["kurs-1"]);
    expect(rpcMock).toHaveBeenCalledWith(
      "big_book_record_settlement",
      expect.objectContaining({
        p_obligation_ids: [OBLIGATION_ID],
        p_amount: 100,
        p_conversion_rate: 4.2,
        p_close: true,
        p_close_note: "Short payment approved",
        p_companions: [{ role: "kurs", amount: 0.0577 }]
      })
    );
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("rejects is_credit combined with a settlement target", async () => {
    const { POST } = await import("@/app/api/big-book/entries/route");
    const request = new Request("https://app.localhost/api/big-book/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settlementBody({ is_credit: true }))
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("requires client_request_id to record a settlement", async () => {
    const { POST } = await import("@/app/api/big-book/entries/route");
    const body = settlementBody();
    delete (body as { client_request_id?: string }).client_request_id;
    const request = new Request("https://app.localhost/api/big-book/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("asks for confirmation before deleting a linked set", async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: {
        code: "PT409",
        message: "linked_set_requires_confirmation",
        hint: JSON.stringify({ member_ids: ["entry-1", "settle-1"] })
      }
    });

    const { DELETE } = await import("@/app/api/big-book/entries/route");
    const request = new Request(
      `https://app.localhost/api/big-book/entries?id=entry-1&expected_updated_at=${encodeURIComponent(EXPECTED_UPDATED_AT)}`,
      { method: "DELETE" }
    );

    const response = await DELETE(request);
    const data = await response.json();
    expect(response.status).toBe(409);
    expect(data.code).toBe("linked_set_requires_confirmation");
    expect(data.error).toMatch(/linked settlements/i);
    expect(data.member_ids).toEqual(["entry-1", "settle-1"]);
    expect(rpcMock).toHaveBeenCalledWith(
      "big_book_delete_entry",
      expect.objectContaining({
        p_entry_id: "entry-1",
        p_cascade_linked: false,
        p_expected_member_ids: null
      })
    );
  });

  it("deletes the linked set the caller confirmed", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { deleted_ids: ["debt-1", "pay-1", "pay-2"], cascaded: true },
      error: null
    });

    const { DELETE } = await import("@/app/api/big-book/entries/route");
    const linkedSet = ["debt-1", "pay-1", "pay-2"].join(",");
    const request = new Request(
      `https://app.localhost/api/big-book/entries?id=debt-1&cascadeLinked=1&linkedSet=${encodeURIComponent(linkedSet)}&expected_updated_at=${encodeURIComponent(EXPECTED_UPDATED_AT)}`,
      { method: "DELETE" }
    );

    const response = await DELETE(request);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.cascaded).toBe(true);
    expect(data.deleted_ids).toEqual(["debt-1", "pay-1", "pay-2"]);
    expect(rpcMock).toHaveBeenCalledWith(
      "big_book_delete_entry",
      expect.objectContaining({
        p_entry_id: "debt-1",
        p_cascade_linked: true,
        p_expected_member_ids: ["debt-1", "pay-1", "pay-2"]
      })
    );
  });

  it("deletes a standalone entry", async () => {
    const { DELETE } = await import("@/app/api/big-book/entries/route");
    const request = new Request(
      `https://app.localhost/api/big-book/entries?id=entry-1&expected_updated_at=${encodeURIComponent(EXPECTED_UPDATED_AT)}`,
      { method: "DELETE" }
    );

    const response = await DELETE(request);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.cascaded).toBe(false);
    expect(rpcMock).toHaveBeenCalledWith(
      "big_book_delete_entry",
      expect.objectContaining({
        p_entry_id: "entry-1",
        p_cascade_linked: false
      })
    );
  });


  it("returns 409 when patch loses an optimistic lock", async () => {
    updateMaybeSingleMock.mockResolvedValueOnce({ data: null, error: null });
    creditLookupMaybeSingleMock.mockResolvedValueOnce({
      data: {
        id: "55555555-5555-4555-8555-555555555555",
        updated_at: "2026-04-24T00:00:00.000Z"
      },
      error: null
    });

    const { PATCH } = await import("@/app/api/big-book/entries/route");
    const request = new Request("https://app.localhost/api/big-book/entries", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "55555555-5555-4555-8555-555555555555",
        expected_updated_at: EXPECTED_UPDATED_AT,
        entry_date: "2026-04-23",
        entry_direction: "spending",
        entry_type_id: "11111111-1111-4111-8111-111111111111",
        explanation: "Stale edit",
        amount: 10,
        currency_code: "IDR",
        remark: "",
        responsible_actor_id: "22222222-2222-4222-8222-222222222222"
      })
    });

    const response = await PATCH(request);
    const data = await response.json();
    expect(response.status).toBe(409);
    expect(data.code).toBe("optimistic_conflict");
    expect(data.current_updated_at).toBe("2026-04-24T00:00:00.000Z");
  });

  it("returns 400 when delete is missing expected_updated_at", async () => {
    const { DELETE } = await import("@/app/api/big-book/entries/route");
    const request = new Request("https://app.localhost/api/big-book/entries?id=entry-1", {
      method: "DELETE"
    });
    const response = await DELETE(request);
    expect(response.status).toBe(400);
  });
});
