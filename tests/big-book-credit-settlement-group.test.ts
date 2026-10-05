import { describe, expect, it, vi } from "vitest";
import {
  ensureBulkCreditSettlementGroup,
  ensureCreditSettlementGroup,
  rollbackCreditSettlementGroup
} from "@/lib/big-book/credit-settlement-group";

describe("credit settlement group helper", () => {
  it("reuses an existing credit group_id", async () => {
    const supabase = { from: vi.fn() };
    const result = await ensureCreditSettlementGroup(
      supabase as never,
      { id: "credit-1", group_id: "group-9", explanation: "Credit A" },
      "user-1"
    );
    expect(result).toEqual({
      ok: true,
      groupId: "group-9",
      createdGroupId: null,
      attachedCreditId: null
    });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("creates a group and attaches a standalone credit", async () => {
    const groupDeleteEq = vi.fn().mockResolvedValue({ error: null });
    const attachSelect = vi.fn().mockResolvedValue({
      data: [{ id: "credit-1" }],
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

    const result = await ensureCreditSettlementGroup(
      supabase as never,
      { id: "credit-1", group_id: null, explanation: "Vendor credit" },
      "user-1"
    );

    expect(result).toEqual({
      ok: true,
      groupId: "group-new",
      createdGroupId: "group-new",
      attachedCreditId: "credit-1"
    });
    expect(groupInsert).toHaveBeenCalledWith(
      expect.objectContaining({ label: "Vendor credit", created_by: "user-1" })
    );
    expect(update).toHaveBeenCalledWith({ group_id: "group-new", updated_by: "user-1" });
  });

  it("reuses a shared group for bulk settle when all credits match", async () => {
    const supabase = { from: vi.fn() };
    const result = await ensureBulkCreditSettlementGroup(
      supabase as never,
      [
        { id: "c1", group_id: "g1", explanation: "A" },
        { id: "c2", group_id: "g1", explanation: "B" }
      ],
      "Bulk settlement",
      "user-1"
    );
    expect(result).toEqual({
      ok: true,
      groupId: "g1",
      createdGroupId: null,
      attachedCreditIds: []
    });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("creates a group and attaches all credits for bulk settle", async () => {
    const groupDeleteEq = vi.fn().mockResolvedValue({ error: null });
    const attachSelect = vi.fn().mockResolvedValue({
      data: [{ id: "c1" }, { id: "c2" }],
      error: null
    });
    const attachIn = vi.fn(() => ({ select: attachSelect }));
    const update = vi.fn(() => ({ in: attachIn }));
    const groupSingle = vi.fn().mockResolvedValue({ data: { id: "group-bulk" }, error: null });
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

    const result = await ensureBulkCreditSettlementGroup(
      supabase as never,
      [
        { id: "c1", group_id: null, explanation: "A" },
        { id: "c2", group_id: null, explanation: "B" }
      ],
      "Bulk settlement for 2 open credits",
      "user-1"
    );

    expect(result).toEqual({
      ok: true,
      groupId: "group-bulk",
      createdGroupId: "group-bulk",
      attachedCreditIds: ["c1", "c2"]
    });
    expect(update).toHaveBeenCalledWith({ group_id: "group-bulk", updated_by: "user-1" });
    expect(attachIn).toHaveBeenCalledWith("id", ["c1", "c2"]);
  });

  it("rolls back by detaching credits before deleting the group", async () => {
    const groupDeleteEq = vi.fn().mockResolvedValue({ error: null });
    const entryUpdateIn = vi.fn().mockResolvedValue({ error: null });
    const entryUpdate = vi.fn(() => ({ in: entryUpdateIn }));
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "business_ledger_entry_groups") {
          return { delete: vi.fn(() => ({ eq: groupDeleteEq })) };
        }
        return { update: entryUpdate };
      })
    };

    await rollbackCreditSettlementGroup(supabase as never, "group-new", ["credit-1"], "user-1");
    expect(entryUpdate).toHaveBeenCalledWith({ group_id: null, updated_by: "user-1" });
    expect(entryUpdateIn).toHaveBeenCalledWith("id", ["credit-1"]);
    expect(groupDeleteEq).toHaveBeenCalledWith("id", "group-new");
  });
});
