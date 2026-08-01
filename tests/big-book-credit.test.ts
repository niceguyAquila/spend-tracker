import { describe, expect, it } from "vitest";
import {
  aggregateVendorActorOutstanding,
  computeBigBookCreditStatus,
  computeSettlementAmountInCreditCurrency
} from "@/lib/big-book/credit";

describe("big book credit helpers", () => {
  it("derives status from credit_settled_at", () => {
    expect(computeBigBookCreditStatus(null)).toBe("open");
    expect(computeBigBookCreditStatus("")).toBe("open");
    expect(computeBigBookCreditStatus("2026-08-01T00:00:00Z")).toBe("settled");
  });

  it("rounds settlement amount in credit currency to 4dp", () => {
    expect(computeSettlementAmountInCreditCurrency(9000000, 0.000066)).toBe(594);
    expect(computeSettlementAmountInCreditCurrency(100, 1)).toBe(100);
  });
});

describe("aggregateVendorActorOutstanding", () => {
  it("splits by currency and buckets missing vendors", () => {
    const rows = aggregateVendorActorOutstanding([
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
    ]);

    // Currencies never merged; missing vendor buckets as "(No vendor)".
    expect(rows).toHaveLength(4);

    const kiloUsdt = rows.find(
      (row) => row.vendor_name === "Kilo" && row.currency === "USDT"
    );
    expect(kiloUsdt).toMatchObject({
      outstanding: 1000,
      open_credit_count: 1,
      actor_display_name: "Actor A"
    });

    const kiloIdr = rows.find(
      (row) => row.vendor_name === "Kilo" && row.currency === "IDR"
    );
    expect(kiloIdr?.outstanding).toBe(45000000);

    const noVendor = rows.find((row) => row.vendor_name === "(No vendor)");
    expect(noVendor).toMatchObject({
      outstanding: 100,
      vendor_type_name: "-",
      actor_display_name: "Actor B"
    });
  });

  it("aggregates multiple open credits for the same vendor-actor-currency", () => {
    const rows = aggregateVendorActorOutstanding([
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
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      outstanding: 150,
      open_credit_count: 2
    });
  });
});
