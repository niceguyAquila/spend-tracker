import { describe, expect, it } from "vitest";
import {
  aggregateVendorActorOutstanding,
  computeBigBookCreditStatus,
  computeSettlementAmountFromCredit,
  computeSettlementAmountInCreditCurrency
} from "@/lib/big-book/credit";

describe("big book credit helpers", () => {
  it("derives status from credit_settled_at", () => {
    expect(computeBigBookCreditStatus(null)).toBe("open");
    expect(computeBigBookCreditStatus("")).toBe("open");
    expect(computeBigBookCreditStatus("2026-08-01T00:00:00Z")).toBe("settled");
  });

  it("rounds settlement amount in credit currency to 4dp", () => {
    // credit_equiv = settlement_amount * rate
    expect(computeSettlementAmountInCreditCurrency(9000000, 0.000066)).toBe(594);
    expect(computeSettlementAmountInCreditCurrency(100, 1)).toBe(100);
    expect(computeSettlementAmountInCreditCurrency(150, 4.2)).toBe(630);
  });

  it("computes USDT settlement amount as credit_amount / rate", () => {
    // 630 MYR at 1 USDT = 4.2 MYR → 150 USDT
    expect(computeSettlementAmountFromCredit(630, 4.2)).toBe(150);
    expect(computeSettlementAmountFromCredit(100, 1)).toBe(100);
    expect(computeSettlementAmountFromCredit(100, 0)).toBe(0);
  });
});

describe("aggregateVendorActorOutstanding", () => {
  it("splits by currency and buckets missing vendor types", () => {
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

    expect(rows).toHaveLength(4);

    const partnerUsdt = rows.find(
      (row) => row.vendor_type_name === "Partner" && row.currency === "USDT"
    );
    expect(partnerUsdt).toMatchObject({
      outstanding: 1000,
      open_credit_count: 1,
      open_future_credit_count: 0,
      actor_display_name: "Actor A",
      row_key: "vendor_type:type-partner:actor-a:USDT"
    });

    const partnerIdr = rows.find(
      (row) => row.vendor_type_name === "Partner" && row.currency === "IDR"
    );
    expect(partnerIdr?.outstanding).toBe(45000000);

    const noVendorType = rows.find((row) => row.vendor_type_name === "-");
    expect(noVendorType).toMatchObject({
      outstanding: 100,
      actor_display_name: "Actor B"
    });
  });

  it("aggregates actualized Credit outstanding by Vendor Type + Actor + Currency", () => {
    const rows = aggregateVendorActorOutstanding([
      {
        id: "c1",
        responsible_actor_id: "actor-a",
        vendor_id: "vendor-rbee",
        vendor_type_id: "type-merchant",
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
        vendor_id: "vendor-other",
        vendor_type_id: "type-merchant",
        currency_code: "MYR",
        amount: 50,
        vendor_name: "Other Shop",
        vendor_type_name: "Merchant",
        actor_code: "A",
        actor_display_name: "Actor A"
      }
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      vendor_type_name: "Merchant",
      outstanding: 150,
      open_credit_count: 2,
      open_future_credit_count: 0
    });
  });

  it("aggregates multiple open credits for the same vendor-type-actor-currency", () => {
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
      open_credit_count: 2,
      open_future_credit_count: 0
    });
  });

  it("excludes Future Credit from actualized Credit outstanding", () => {
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
        actor_display_name: "Actor A",
        is_future_credit: true
      },
      {
        id: "c2",
        responsible_actor_id: "actor-a",
        vendor_id: "vendor-1",
        vendor_type_id: "type-1",
        currency_code: "MYR",
        amount: 40,
        vendor_name: "Rbee",
        vendor_type_name: "Merchant",
        actor_code: "A",
        actor_display_name: "Actor A",
        is_future_credit: false
      }
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      outstanding: 40,
      open_credit_count: 1,
      open_future_credit_count: 0
    });
  });

  it("aggregates Future Credit outstanding by Type + Actor + Currency", () => {
    const rows = aggregateVendorActorOutstanding(
      [
        {
          id: "c1",
          responsible_actor_id: "actor-a",
          vendor_id: null,
          vendor_type_id: "vt-client",
          entry_type_id: "type-selatan",
          type_name: "SELATAN",
          currency_code: "MYR",
          amount: 100,
          vendor_name: null,
          vendor_type_name: "CLIENT",
          actor_code: "A",
          actor_display_name: "Actor A",
          is_future_credit: true
        },
        {
          id: "c2",
          responsible_actor_id: "actor-a",
          vendor_id: null,
          vendor_type_id: "vt-client",
          entry_type_id: "type-hcm",
          type_name: "HCM",
          currency_code: "MYR",
          amount: 40,
          vendor_name: null,
          vendor_type_name: "CLIENT",
          actor_code: "A",
          actor_display_name: "Actor A",
          is_future_credit: true
        },
        {
          id: "c3",
          responsible_actor_id: "actor-a",
          vendor_id: null,
          vendor_type_id: "vt-client",
          entry_type_id: "type-selatan",
          type_name: "SELATAN",
          currency_code: "MYR",
          amount: 10,
          vendor_name: null,
          vendor_type_name: "CLIENT",
          actor_code: "A",
          actor_display_name: "Actor A",
          is_future_credit: true
        }
      ],
      { futureOnly: true }
    );

    expect(rows).toHaveLength(2);
    const selatan = rows.find((row) => row.type_name === "SELATAN");
    const hcm = rows.find((row) => row.type_name === "HCM");
    expect(selatan).toMatchObject({
      row_key: "type:type-selatan:actor-a:MYR",
      entry_type_id: "type-selatan",
      outstanding: 110,
      open_credit_count: 2,
      open_future_credit_count: 2,
      vendor_name: "-"
    });
    expect(hcm).toMatchObject({
      row_key: "type:type-hcm:actor-a:MYR",
      entry_type_id: "type-hcm",
      outstanding: 40,
      open_credit_count: 1,
      open_future_credit_count: 1
    });
  });
});
