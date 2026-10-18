import { describe, expect, it } from "vitest";
import { computeBigBookDebtStatus, sumOutstandingByCurrency } from "@/lib/big-book/debt";
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
  settles: null,
  settlement_conversion_rate: null,
  settlement_note: "",
  close: false,
  close_note: null
};

describe("big book debt helpers", () => {
  it("derives status from debt_settled_at", () => {
    expect(computeBigBookDebtStatus(null)).toBe("open");
    expect(computeBigBookDebtStatus("")).toBe("open");
    expect(computeBigBookDebtStatus("2026-08-01T00:00:00Z")).toBe("settled");
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

  it("rejects is_debt combined with a settlement target", () => {
    const parsed = bigBookEntryInputSchema.safeParse({
      ...basePayload,
      is_debt: true,
      settles: CREDIT_ID,
      client_request_id: "55555555-5555-4555-8555-555555555555",
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
