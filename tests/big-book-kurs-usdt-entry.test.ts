import { describe, expect, it } from "vitest";
import {
  buildKursEntry,
  buildKursExplanation,
  calculateKursAmount,
  expandGroupPayloadsWithKursAndGasFees,
  findKursTypeId,
  KURS_TYPE_MISSING_ERROR,
  parseOptionalKursAmount,
  parseOptionalKursRate,
  resolveKursCompanionAmount,
  willCreateKursEntry
} from "@/lib/big-book/kurs-usdt-entry";

const main = {
  entry_date: "2026-09-03",
  entry_direction: "profit" as const,
  entry_type_id: "11111111-1111-4111-8111-111111111111",
  entry_sub_type_id: "44444444-4444-4444-8444-444444444444",
  vendor_type_id: "66666666-6666-4666-8666-666666666666",
  vendor_id: "77777777-7777-4777-8777-777777777777",
  pocket_id: null as string | null,
  action_by_id: "99999999-9999-4999-8999-999999999999",
  explanation: "Vendor payout",
  amount: 1000,
  currency_code: "USDT" as "IDR" | "MYR" | "USDT" | "TRX",
  remark: "keep on main only",
  responsible_actor_id: "22222222-2222-4222-8222-222222222222"
};

const KURS_TYPE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("calculateKursAmount", () => {
  it("computes A × (1 − r) rounded to 4 decimals", () => {
    expect(calculateKursAmount(1000, 0.999423)).toBe(0.577);
    expect(calculateKursAmount(250, 0.99)).toBe(2.5);
  });

  it("returns null for non-positive results or bad inputs", () => {
    expect(calculateKursAmount(1000, 1)).toBeNull();
    expect(calculateKursAmount(1000, 1.01)).toBeNull();
    expect(calculateKursAmount(0, 0.5)).toBeNull();
    expect(calculateKursAmount(1000, Number.NaN)).toBeNull();
  });
});

describe("parseOptionalKursRate / parseOptionalKursAmount", () => {
  it("parses formatted values and skips empties", () => {
    expect(parseOptionalKursRate("")).toBeNull();
    expect(parseOptionalKursRate("0.999423")).toBe(0.999423);
    expect(parseOptionalKursRate("1,234.5")).toBe(1234.5);
    expect(parseOptionalKursAmount("")).toBeNull();
    expect(parseOptionalKursAmount(0)).toBeNull();
    expect(parseOptionalKursAmount("1.25")).toBe(1.25);
  });
});

describe("resolveKursCompanionAmount / willCreateKursEntry", () => {
  it("only applies to USDT inflow", () => {
    expect(
      resolveKursCompanionAmount({
        currencyCode: "USDT",
        entryDirection: "spending",
        mainAmount: 1000,
        kursRate: 0.999423
      })
    ).toBeNull();
    expect(
      resolveKursCompanionAmount({
        currencyCode: "IDR",
        entryDirection: "profit",
        mainAmount: 1000,
        kursRate: 0.999423
      })
    ).toBeNull();
    expect(
      willCreateKursEntry({
        currencyCode: "USDT",
        entryDirection: "profit",
        mainAmount: 1000,
        kursRate: 0.999423
      })
    ).toBe(true);
  });

  it("prefers an explicit amount override over the rate formula", () => {
    expect(
      resolveKursCompanionAmount({
        currencyCode: "USDT",
        entryDirection: "profit",
        mainAmount: 1000,
        kursRate: 0.999423,
        kursAmount: 1.5
      })
    ).toBe(1.5);
  });
});

describe("buildKursEntry", () => {
  it("builds a USDT spending companion with the KURS type id", () => {
    expect(buildKursEntry(main, KURS_TYPE_ID, 0.577)).toEqual({
      entry_date: "2026-09-03",
      entry_direction: "spending",
      entry_type_id: KURS_TYPE_ID,
      entry_sub_type_id: main.entry_sub_type_id,
      vendor_type_id: main.vendor_type_id,
      vendor_id: main.vendor_id,
      pocket_id: null,
      action_by_id: main.action_by_id,
      explanation: "KURS — Vendor payout",
      amount: 0.577,
      currency_code: "USDT",
      remark: "",
      responsible_actor_id: main.responsible_actor_id
    });
  });

  it("truncates a long explanation", () => {
    expect(buildKursExplanation("x".repeat(600)).length).toBe(500);
  });
});

describe("findKursTypeId", () => {
  it("matches case-insensitively and prefers active", () => {
    expect(findKursTypeId([])).toBeNull();
    expect(
      findKursTypeId([
        { id: "inactive", name: "kurs", is_active: false },
        { id: "active", name: "KURS", is_active: true }
      ])
    ).toBe("active");
    expect(findKursTypeId([{ id: "only", name: "Kurs", is_active: false }])).toBe("only");
  });
});

describe("expandGroupPayloadsWithKursAndGasFees", () => {
  it("appends KURS then gas fee companions for a USDT inflow", () => {
    const expanded = expandGroupPayloadsWithKursAndGasFees(
      [{ entry: main, kursRate: 0.999423, gasFeeAmount: "1.33" }],
      KURS_TYPE_ID
    );
    expect(expanded).toHaveLength(3);
    expect(expanded.map((row) => row.currency_code)).toEqual(["USDT", "USDT", "TRX"]);
    expect(expanded[1]).toMatchObject({
      currency_code: "USDT",
      entry_direction: "spending",
      entry_type_id: KURS_TYPE_ID,
      amount: 0.577
    });
    expect(expanded[2]).toMatchObject({ currency_code: "TRX", amount: 1.33 });
  });

  it("throws a clear error when KURS type is missing but a companion is needed", () => {
    expect(() =>
      expandGroupPayloadsWithKursAndGasFees([{ entry: main, kursRate: 0.999423 }], null)
    ).toThrow(KURS_TYPE_MISSING_ERROR);
  });
});
