import { describe, expect, it } from "vitest";
import {
  aggregateVendorActorOutstandingDebt,
  computeBigBookDebtStatus,
  sumOutstandingByCurrency
} from "@/lib/big-book/debt";
import { bigBookEntryInputSchema } from "@/lib/validation/big-book";

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
  it("splits by currency and buckets missing vendors", () => {
    const rows = aggregateVendorActorOutstandingDebt([
      {
        id: "d1",
        responsible_actor_id: "actor-a",
        vendor_id: "vendor-kilo",
        vendor_type_id: "type-partner",
        currency_code: "USDT",
        amount: 1000,
        vendor_name: "Kilo",
        vendor_type_name: "Partner",
        actor_code: "A",
        actor_display_name: "Actor A"
      },
      {
        id: "d2",
        responsible_actor_id: "actor-a",
        vendor_id: "vendor-kilo",
        vendor_type_id: "type-partner",
        currency_code: "IDR",
        amount: 45000000,
        vendor_name: "Kilo",
        vendor_type_name: "Partner",
        actor_code: "A",
        actor_display_name: "Actor A"
      },
      {
        id: "d3",
        responsible_actor_id: "actor-b",
        vendor_id: null,
        vendor_type_id: null,
        currency_code: "USDT",
        amount: 100,
        vendor_name: null,
        vendor_type_name: null,
        actor_code: "B",
        actor_display_name: "Actor B"
      },
      {
        id: "d4",
        responsible_actor_id: "actor-a",
        vendor_id: "vendor-hcm",
        vendor_type_id: "type-client",
        currency_code: "USDT",
        amount: 500,
        vendor_name: "HCM",
        vendor_type_name: "Client",
        actor_code: "A",
        actor_display_name: "Actor A"
      }
    ]);

    expect(rows).toHaveLength(4);

    const kiloUsdt = rows.find((row) => row.vendor_name === "Kilo" && row.currency === "USDT");
    expect(kiloUsdt).toMatchObject({
      outstanding: 1000,
      open_debt_count: 1,
      actor_display_name: "Actor A"
    });

    const kiloIdr = rows.find((row) => row.vendor_name === "Kilo" && row.currency === "IDR");
    expect(kiloIdr?.outstanding).toBe(45000000);

    const noVendor = rows.find((row) => row.vendor_name === "(No vendor)");
    expect(noVendor).toMatchObject({
      outstanding: 100,
      vendor_type_name: "-",
      actor_display_name: "Actor B"
    });
  });

  it("aggregates multiple open debts for the same vendor-actor-currency", () => {
    const rows = aggregateVendorActorOutstandingDebt([
      {
        id: "d1",
        responsible_actor_id: "actor-a",
        vendor_id: "vendor-1",
        vendor_type_id: "type-1",
        currency_code: "MYR",
        amount: 100,
        vendor_name: "Rbee",
        vendor_type_name: "Merchant",
        actor_code: "A",
        actor_display_name: "Actor A"
      },
      {
        id: "d2",
        responsible_actor_id: "actor-a",
        vendor_id: "vendor-1",
        vendor_type_id: "type-1",
        currency_code: "MYR",
        amount: 50,
        vendor_name: "Rbee",
        vendor_type_name: "Merchant",
        actor_code: "A",
        actor_display_name: "Actor A"
      }
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      outstanding: 150,
      open_debt_count: 2
    });
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
