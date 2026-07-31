import { describe, expect, it } from "vitest";
import {
  aggregateVendorActorOutstanding,
  computeBigBookCreditStatus,
  computeOutstanding,
  computeSettlementAmountInCreditCurrency
} from "@/lib/big-book/credit";

describe("big book credit helpers", () => {
  it("computes outstanding and status", () => {
    expect(computeOutstanding(1000, 0)).toBe(1000);
    expect(computeOutstanding(1000, 400)).toBe(600);
    expect(computeOutstanding(1000, 1000)).toBe(0);
    expect(computeOutstanding(1000, 1200)).toBe(0);

    expect(computeBigBookCreditStatus(1000, 0)).toBe("open");
    expect(computeBigBookCreditStatus(1000, 0.00005)).toBe("open");
    expect(computeBigBookCreditStatus(1000, 400)).toBe("partial");
    expect(computeBigBookCreditStatus(1000, 999.99995)).toBe("settled");
    expect(computeBigBookCreditStatus(1000, 1000)).toBe("settled");
  });

  it("rounds settlement amount in credit currency to 4dp", () => {
    expect(computeSettlementAmountInCreditCurrency(9000000, 0.000066)).toBe(594);
    expect(computeSettlementAmountInCreditCurrency(100, 1)).toBe(100);
  });
});

describe("aggregateVendorActorOutstanding", () => {
  it("splits by currency and buckets missing vendors", () => {
    const settled = new Map<string, number>([
      ["c1", 200],
      ["c2", 0],
      ["c3", 50]
    ]);

    const rows = aggregateVendorActorOutstanding(
      [
        {
          id: "c1",
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
          id: "c2",
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
          id: "c3",
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
          id: "c4",
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
      ],
      settled
    );

    // c4 fully unsettled -> included; currencies never merged.
    expect(rows).toHaveLength(4);

    const kiloUsdt = rows.find(
      (row) => row.vendor_name === "Kilo" && row.currency === "USDT"
    );
    expect(kiloUsdt).toMatchObject({
      outstanding: 800,
      total_credited: 1000,
      total_settled: 200,
      open_credit_count: 1,
      actor_display_name: "Actor A"
    });

    const kiloIdr = rows.find(
      (row) => row.vendor_name === "Kilo" && row.currency === "IDR"
    );
    expect(kiloIdr?.outstanding).toBe(45000000);

    const noVendor = rows.find((row) => row.vendor_name === "(No vendor)");
    expect(noVendor).toMatchObject({
      outstanding: 50,
      vendor_type_name: "-",
      actor_display_name: "Actor B"
    });
  });

  it("omits fully settled credits and keeps outside-range settlements in the sum", () => {
    // Settlements dated outside a credit date filter still reduce outstanding —
    // the caller is responsible for not filtering the settlement map by date.
    const settled = new Map<string, number>([
      ["inside-range-credit", 1000]
    ]);

    const rows = aggregateVendorActorOutstanding(
      [
        {
          id: "inside-range-credit",
          responsible_actor_id: "actor-a",
          vendor_id: "vendor-1",
          vendor_type_id: "type-1",
          currency_code: "USDT",
          amount: 1000,
          vendor_name: "Rbee",
          vendor_type_name: "Merchant",
          actor_code: "A",
          actor_display_name: "Actor A"
        }
      ],
      settled
    );

    expect(rows).toEqual([]);
  });

  it("aggregates multiple open credits for the same vendor-actor-currency", () => {
    const rows = aggregateVendorActorOutstanding(
      [
        {
          id: "c1",
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
          id: "c2",
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
      ],
      new Map([
        ["c1", 20],
        ["c2", 10]
      ])
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      total_credited: 150,
      total_settled: 30,
      outstanding: 120,
      open_credit_count: 2
    });
  });
});
