import { describe, expect, it, vi } from "vitest";
import {
  ensureDebtPaymentGroup,
  rollbackDebtPaymentGroup
} from "@/lib/big-book/debt-payment-group";

// Test doubles only implement the query surface used by the helper.

describe("debt payment group helper", () => {
  it("reuses an existing debt group_id", async () => {
    const supabase = { from: vi.fn() };
    const result = await ensureDebtPaymentGroup(
      supabase as never,
      { id: "debt-1", group_id: "group-9", explanation: "Debt A" },
      "user-1"
    );
    expect(result).toEqual({
      ok: true,
      groupId: "group-9",
      createdGroupId: null,
      attachedDebtId: null
    });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("creates a group and attaches a standalone debt", async () => {
    const groupDeleteEq = vi.fn().mockResolvedValue({ error: null });
    const attachSelect = vi.fn().mockResolvedValue({
      data: [{ id: "debt-1" }],
      error: null
    });
    const attachIs = vi.fn(() => ({ select: attachSelect }));
    const attachEq = vi.fn(() => ({ is: attachIs }));
    const update = vi.fn(() => ({ eq: attachEq }));
    const groupSingle = vi.fn().mockResolvedValue({ data: { id: "group-new" }, error: null });
    const groupInsert = vi.fn(() => ({
      select: vi.fn(() => ({ single: groupSingle }))
    }));

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "business_ledger_entry_groups") {
          return { insert: groupInsert, delete: vi.fn(() => ({ eq: groupDeleteEq })) };
        }
        return { update };
      })
    };

    const result = await ensureDebtPaymentGroup(
      supabase as never,
      { id: "debt-1", group_id: null, explanation: "Vendor invoice debt" },
      "user-1"
    );

    expect(result).toEqual({
      ok: true,
      groupId: "group-new",
      createdGroupId: "group-new",
      attachedDebtId: "debt-1"
    });
    expect(groupInsert).toHaveBeenCalledWith(
      expect.objectContaining({ label: "Vendor invoice debt", created_by: "user-1" })
    );
    expect(update).toHaveBeenCalledWith({ group_id: "group-new", updated_by: "user-1" });
  });

  it("rolls back by detaching the debt before deleting the group", async () => {
    const groupDeleteEq = vi.fn().mockResolvedValue({ error: null });
    const entryUpdateEq = vi.fn().mockResolvedValue({ error: null });
    const entryUpdate = vi.fn(() => ({ eq: entryUpdateEq }));
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "business_ledger_entry_groups") {
          return { delete: vi.fn(() => ({ eq: groupDeleteEq })) };
        }
        return { update: entryUpdate };
      })
    };

    await rollbackDebtPaymentGroup(supabase as never, "group-new", "debt-1", "user-1");
    expect(entryUpdate).toHaveBeenCalledWith({ group_id: null, updated_by: "user-1" });
    expect(entryUpdateEq).toHaveBeenCalledWith("id", "debt-1");
    expect(groupDeleteEq).toHaveBeenCalledWith("id", "group-new");
  });
});
