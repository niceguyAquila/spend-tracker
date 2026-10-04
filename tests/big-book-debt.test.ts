import { describe, expect, it } from "vitest";
import {
  aggregateVendorActorOutstandingDebt,
  computeBigBookDebtStatus,
  sumOutstandingByCurrency
} from "@/lib/big-book/debt";
import { bigBookEntryInputSchema, bigBookGroupCreateSchema } from "@/lib/validation/big-book";

const TYPE_ID = "11111111-1111-1111-1111-111111111111";
const ACTOR_ID = "22222222-2222-2222-2222-222222222222";
const CREDIT_ID = "33333333-3333-3333-3333-333333333333";

const basePayload = {
  entry_date: "2026-08-01",
  entry_direction: "spending" as const,
  entry_type_id: TYPE_ID,
  vendor_type_id: null,
  vendor_id: null,
  pocket_id: null,
  action_by_id: null,
  explanation: "We owe vendor",
  amount: 1000,
  currency_code: "IDR" as const,
  remark: "",
  responsible_actor_id: ACTOR_ID,
  is_credit: false,
  is_debt: false,
  settles_entry_id: null,
  settlement_conversion_rate: null,
  settlement_note: "",
  close_credit: false,
  credit_settlement_note: null
};

describe("big book debt helpers", () => {
  it("derives status from debt_settled_at", () => {
    expect(computeBigBookDebtStatus(null)).toBe("open");
    expect(computeBigBookDebtStatus("")).toBe("open");
    expect(computeBigBookDebtStatus("2026-08-01T00:00:00Z")).toBe("settled");
  });
});

describe("aggregateVendorActorOutstandingDebt", () => {
  it("aggregates by group + actor + currency and keeps standalone debts separate", () => {
    const rows = aggregateVendorActorOutstandingDebt([
      {
        id: "d1",
        group_id: "group-office",
        group_label: "October office setup",
        explanation: "Rent arrears",
        responsible_actor_id: "actor-a",
        vendor_type_id: "type-partner",
        currency_code: "USDT",
        amount: 1000,
        vendor_type_name: "Partner",
        actor_code: "A",
        actor_display_name: "Actor A"
      },
      {
        id: "d2",
        group_id: "group-office",
        group_label: "October office setup",
        explanation: "Utilities",
        responsible_actor_id: "actor-a",
        vendor_type_id: "type-partner",
        currency_code: "USDT",
        amount: 250,
        vendor_type_name: "Partner",
        actor_code: "A",
        actor_display_name: "Actor A"
      },
      {
        id: "d3",
        group_id: "group-office",
        group_label: "October office setup",
        explanation: "Local tax",
        responsible_actor_id: "actor-a",
        vendor_type_id: "type-partner",
        currency_code: "IDR",
        amount: 45000000,
        vendor_type_name: "Partner",
        actor_code: "A",
        actor_display_name: "Actor A"
      },
      {
        id: "d4",
        group_id: null,
        group_label: null,
        explanation: "Standalone float debt",
        responsible_actor_id: "actor-b",
        vendor_type_id: null,
        currency_code: "USDT",
        amount: 100,
        vendor_type_name: null,
        actor_code: "B",
        actor_display_name: "Actor B"
      }
    ]);

    expect(rows).toHaveLength(3);

    const officeUsdt = rows.find(
      (row) => row.group_label === "October office setup" && row.currency === "USDT"
    );
    expect(officeUsdt).toMatchObject({
      group_id: "group-office",
      entry_id: null,
      outstanding: 1250,
      open_debt_count: 2,
      actor_display_name: "Actor A"
    });

    const officeIdr = rows.find(
      (row) => row.group_label === "October office setup" && row.currency === "IDR"
    );
    expect(officeIdr?.outstanding).toBe(45000000);

    const standalone = rows.find((row) => row.group_label === "Standalone float debt");
    expect(standalone).toMatchObject({
      group_id: null,
      entry_id: "d4",
      outstanding: 100,
      vendor_type_name: "-",
      actor_display_name: "Actor B"
    });
  });

  it("does not merge open debts from different groups", () => {
    const rows = aggregateVendorActorOutstandingDebt([
      {
        id: "d1",
        group_id: "group-a",
        group_label: "Group A",
        explanation: "A",
        responsible_actor_id: "actor-a",
        vendor_type_id: "type-1",
        currency_code: "MYR",
        amount: 100,
        vendor_type_name: "Merchant",
        actor_code: "A",
        actor_display_name: "Actor A"
      },
      {
        id: "d2",
        group_id: "group-b",
        group_label: "Group B",
        explanation: "B",
        responsible_actor_id: "actor-a",
        vendor_type_id: "type-1",
        currency_code: "MYR",
        amount: 50,
        vendor_type_name: "Merchant",
        actor_code: "A",
        actor_display_name: "Actor A"
      }
    ]);

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.group_label).sort()).toEqual(["Group A", "Group B"]);
  });
});

describe("sumOutstandingByCurrency", () => {
  it("sums open counts and amounts in currency order", () => {
    const totals = sumOutstandingByCurrency([
      { currency: "USDT", outstanding: 10, openCount: 1 },
      { currency: "IDR", outstanding: 100, openCount: 2 },
      { currency: "USDT", outstanding: 5, openCount: 1 }
    ]);
    expect(totals).toEqual([
      { currency: "IDR", outstanding: 100, openCount: 2 },
      { currency: "USDT", outstanding: 15, openCount: 2 }
    ]);
  });
});

describe("debt / credit mutual exclusivity", () => {
  it("accepts a debt create payload", () => {
    const parsed = bigBookEntryInputSchema.safeParse({ ...basePayload, is_debt: true });
    expect(parsed.success).toBe(true);
  });

  it("rejects is_credit and is_debt together", () => {
    const parsed = bigBookEntryInputSchema.safeParse({
      ...basePayload,
      is_credit: true,
      is_debt: true
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects is_debt combined with settles_entry_id", () => {
    const parsed = bigBookEntryInputSchema.safeParse({
      ...basePayload,
      is_debt: true,
      settles_entry_id: CREDIT_ID,
      settlement_conversion_rate: 1
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects debt with Cash Flow In", () => {
    const parsed = bigBookEntryInputSchema.safeParse({
      ...basePayload,
      is_debt: true,
      entry_direction: "profit"
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) => issue.path.includes("entry_direction"))).toBe(
        true
      );
    }
  });
});

describe("grouped entry settlement type", () => {
  const groupEntry = {
    entry_date: "2026-08-01",
    entry_direction: "spending" as const,
    entry_type_id: TYPE_ID,
    vendor_type_id: null,
    vendor_id: null,
    pocket_id: null,
    action_by_id: null,
    explanation: "Grouped debt line",
    amount: 500,
    currency_code: "IDR" as const,
    remark: "",
    responsible_actor_id: ACTOR_ID
  };

  it("accepts is_debt on grouped create entries", () => {
    const parsed = bigBookGroupCreateSchema.safeParse({
      label: "Office arrears",
      remark: "",
      entries: [
        { ...groupEntry, is_debt: true },
        { ...groupEntry, explanation: "Companion spend", is_debt: false }
      ]
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.entries[0].is_debt).toBe(true);
      expect(parsed.data.entries[1].is_debt).toBe(false);
    }
  });

  it("rejects debt + credit on the same grouped entry", () => {
    const parsed = bigBookGroupCreateSchema.safeParse({
      label: "Office arrears",
      remark: "",
      entries: [
        { ...groupEntry, is_debt: true, is_credit: true },
        { ...groupEntry, explanation: "Companion spend" }
      ]
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects grouped debt with Cash Flow In", () => {
    const parsed = bigBookGroupCreateSchema.safeParse({
      label: "Office arrears",
      remark: "",
      entries: [
        { ...groupEntry, is_debt: true, entry_direction: "profit" },
        { ...groupEntry, explanation: "Companion spend" }
      ]
    });
    expect(parsed.success).toBe(false);
  });
});
