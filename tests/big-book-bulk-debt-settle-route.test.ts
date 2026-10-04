import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminApiMock = vi.fn();
const assertCsrfAndOriginMock = vi.fn();
const insertMock = vi.fn();
const updateMock = vi.fn();
const selectInMock = vi.fn();
const groupInsertMock = vi.fn();
const groupInsertSingleMock = vi.fn();
const groupDeleteEqMock = vi.fn();

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
          select: vi.fn(() => ({
            in: selectInMock
          })),
          insert: insertMock,
          update: updateMock
        };
      }
      if (table === "business_ledger_entry_groups") {
        return {
          insert: groupInsertMock,
          delete: vi.fn(() => ({ eq: groupDeleteEqMock }))
        };
      }
      return {};
    })
  }))
}));

const DEBT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DEBT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function mockDebts(rows: Array<Record<string, unknown>>) {
  selectInMock.mockResolvedValue({ data: rows, error: null });
}

function mockInsertReturning(rows: Array<{ id: string; settles_entry_id?: string | null }>) {
  insertMock.mockReturnValue({
    select: vi.fn().mockResolvedValue({ data: rows, error: null })
  });
}

describe("big book bulk debt settle route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertCsrfAndOriginMock.mockResolvedValue(true);
    requireAdminApiMock.mockResolvedValue({
      ok: true,
      activeBrandId: "brand-1",
      user: { id: "auth-user-1" }
    });

    mockDebts([
      {
        id: DEBT_A,
        group_id: null,
        entry_date: "2026-09-01",
        entry_direction: "spending",
        entry_type_id: "type-1",
        entry_sub_type_id: null,
        vendor_type_id: "vt-1",
        vendor_id: "v-1",
        action_by_id: null,
        explanation: "Debt A",
        amount: 100,
        currency_code: "USDT",
        responsible_actor_id: "actor-1",
        is_debt: true,
        settles_entry_id: null,
        debt_settled_at: null
      },
      {
        id: DEBT_B,
        group_id: null,
        entry_date: "2026-09-02",
        entry_direction: "spending",
        entry_type_id: "type-1",
        entry_sub_type_id: null,
        vendor_type_id: "vt-1",
        vendor_id: "v-1",
        action_by_id: null,
        explanation: "Debt B",
        amount: 50,
        currency_code: "USDT",
        responsible_actor_id: "actor-1",
        is_debt: true,
        settles_entry_id: null,
        debt_settled_at: null
      }
    ]);

    mockInsertReturning([{ id: "pay-1", settles_entry_id: DEBT_A }]);

    groupInsertMock.mockReturnValue({
      select: vi.fn(() => ({
        single: groupInsertSingleMock
      }))
    });
    groupInsertSingleMock.mockResolvedValue({ data: { id: "group-1" }, error: null });
    groupDeleteEqMock.mockResolvedValue({ error: null });

    const closeSelect = vi.fn().mockResolvedValue({
      data: [{ id: DEBT_A }, { id: DEBT_B }],
      error: null
    });
    const closeIs = vi.fn(() => ({ select: closeSelect }));
    const closeEq = vi.fn(() => ({ is: closeIs }));
    const closeIn = vi.fn(() => ({ eq: closeEq }));

    // First update calls attach debt to group: .eq().is().select()
    // Later update closes debts: .in().eq().is().select()
    updateMock.mockImplementation((payload: Record<string, unknown>) => {
      if ("group_id" in payload) {
        return {
          eq: vi.fn(() => ({
            is: vi.fn(() => ({
              select: vi.fn().mockResolvedValue({
                data: [{ id: DEBT_A }],
                error: null
              })
            }))
          }))
        };
      }
      return { in: closeIn };
    });
  });

  it("creates an Out payment grouped with the primary debt and closes selected debts", async () => {
    const { POST } = await import("@/app/api/big-book/entries/bulk-debt-settle/route");
    const request = new Request("https://app.localhost/api/big-book/entries/bulk-debt-settle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        debt_entry_ids: [DEBT_A, DEBT_B],
        mode: "single",
        entry_date: "2026-10-01",
        close_debts: true,
        currency_code: "USDT",
        amount: 150
      })
    });

    const response = await POST(request);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.settlement_ids).toEqual(["pay-1"]);
    expect(data.closed_debt_ids).toEqual([DEBT_A, DEBT_B]);
    expect(data.group_ids[DEBT_A]).toBe("group-1");

    expect(groupInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ label: "Debt A" })
    );
    expect(insertMock).toHaveBeenCalled();
    const inserted = insertMock.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      group_id: "group-1",
      entry_direction: "spending",
      is_credit: false,
      is_debt: false,
      settles_entry_id: DEBT_A,
      amount: 150,
      currency_code: "USDT"
    });

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        debt_settled_by: "auth-user-1",
        updated_by: "auth-user-1"
      })
    );
  });

  it("reuses an existing debt group for single-mode payments", async () => {
    mockDebts([
      {
        id: DEBT_A,
        group_id: "existing-group",
        entry_date: "2026-09-01",
        entry_direction: "spending",
        entry_type_id: "type-1",
        entry_sub_type_id: null,
        vendor_type_id: "vt-1",
        vendor_id: "v-1",
        action_by_id: null,
        explanation: "Debt A",
        amount: 100,
        currency_code: "USDT",
        responsible_actor_id: "actor-1",
        is_debt: true,
        settles_entry_id: null,
        debt_settled_at: null
      }
    ]);

    const { POST } = await import("@/app/api/big-book/entries/bulk-debt-settle/route");
    const request = new Request("https://app.localhost/api/big-book/entries/bulk-debt-settle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        debt_entry_ids: [DEBT_A],
        mode: "single",
        entry_date: "2026-10-01",
        close_debts: false
      })
    });

    const response = await POST(request);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(groupInsertMock).not.toHaveBeenCalled();
    expect(data.group_ids[DEBT_A]).toBe("existing-group");
    const inserted = insertMock.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(inserted[0]).toMatchObject({ group_id: "existing-group" });
  });

  it("rejects non-debt targets", async () => {
    mockDebts([
      {
        id: DEBT_A,
        group_id: null,
        entry_date: "2026-09-01",
        entry_direction: "spending",
        entry_type_id: "type-1",
        entry_sub_type_id: null,
        vendor_type_id: null,
        vendor_id: null,
        action_by_id: null,
        explanation: "Not debt",
        amount: 100,
        currency_code: "USDT",
        responsible_actor_id: "actor-1",
        is_debt: false,
        settles_entry_id: null,
        debt_settled_at: null
      }
    ]);

    const { POST } = await import("@/app/api/big-book/entries/bulk-debt-settle/route");
    const request = new Request("https://app.localhost/api/big-book/entries/bulk-debt-settle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        debt_entry_ids: [DEBT_A],
        mode: "single",
        entry_date: "2026-10-01"
      })
    });

    const response = await POST(request);
    const data = await response.json();
    expect(response.status).toBe(400);
    expect(data.error).toMatch(/open debts/i);
    expect(insertMock).not.toHaveBeenCalled();
  });
});
