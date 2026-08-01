import { describe, expect, it } from "vitest";
import {
  buildSpendingImportTemplateCsv,
  parseSpendingCsv,
  spendingDedupeKey,
  SPENDING_CSV_EXPORT_HEADERS,
  SPENDING_CSV_HEADERS
} from "@/lib/spending/csv";

describe("parseSpendingCsv", () => {
  it("parses a valid row with optional blanks", () => {
    const csv = [
      SPENDING_CSV_HEADERS.join(","),
      "2026-04-25,Ads,Facebook,April boost,John,IDR,150000,spending,INV-001",
      "2026-04-26,,,Rebate,,USDT,50,profit,"
    ].join("\n");

    const result = parseSpendingCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      expense_date: "2026-04-25",
      entry_direction: "spending",
      currency_code: "IDR",
      type_name: "Ads",
      category_name: "Facebook",
      staff_name: "John",
      amount: 150000,
      description: "April boost",
      remarks: "INV-001"
    });
    expect(result.rows[1]).toMatchObject({
      expense_date: "2026-04-26",
      entry_direction: "profit",
      currency_code: "USDT",
      type_name: null,
      category_name: null,
      staff_name: null,
      amount: 50,
      description: "Rebate",
      remarks: null
    });
  });

  it("normalizes YYYY-MMM-DD dates and strips amount commas", () => {
    const quoted = [
      SPENDING_CSV_HEADERS.join(","),
      '2026-Apr-01,,,,"",IDR,"1,500.50",spending,'
    ].join("\n");

    const result = parseSpendingCsv(quoted);
    expect(result.errors).toEqual([]);
    expect(result.rows[0]?.expense_date).toBe("2026-04-01");
    expect(result.rows[0]?.amount).toBe(1500.5);
  });

  it("rejects missing required headers", () => {
    const result = parseSpendingCsv("date,amount\n2026-04-01,100");
    expect(result.rows).toEqual([]);
    expect(result.errors.some((item) => item.includes("Missing required header"))).toBe(true);
  });

  it("rejects invalid cash_flow, date, and amount", () => {
    const csv = [SPENDING_CSV_HEADERS.join(","), "2026-02-30,,,,,,0,out,"].join("\n");
    const result = parseSpendingCsv(csv);
    expect(result.rows).toEqual([]);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("accepts semicolon-delimited Excel exports and strips BOM", () => {
    const csv = `\uFEFF${SPENDING_CSV_HEADERS.join(";")}\r\n2026-04-25;Ads;Facebook;note;John;IDR;150000;spending;ref`;
    const result = parseSpendingCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.category_name).toBe("Facebook");
  });
});

describe("buildSpendingImportTemplateCsv", () => {
  it("round-trips through the parser", () => {
    const template = buildSpendingImportTemplateCsv();
    const result = parseSpendingCsv(template);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(3);
    expect(result.rows[0]?.entry_direction).toBe("spending");
    expect(result.rows[1]?.entry_direction).toBe("profit");
    expect(result.rows[2]?.category_name).toBeNull();
  });

  it("export headers are a superset of import headers", () => {
    for (const header of SPENDING_CSV_HEADERS) {
      expect(SPENDING_CSV_EXPORT_HEADERS).toContain(header);
    }
    expect(SPENDING_CSV_EXPORT_HEADERS).toContain("source");
    expect(SPENDING_CSV_EXPORT_HEADERS).toContain("created_by_name");
  });
});

describe("spendingDedupeKey", () => {
  it("normalizes blank description/remarks and null FKs like the expression index", () => {
    const a = spendingDedupeKey({
      entry_direction: "spending",
      expense_date: "2026-04-01",
      currency_code: "IDR",
      amount: 100,
      category_id: "c1",
      type_id: null,
      staff_id: null,
      description: "  ",
      remarks: null
    });
    const b = spendingDedupeKey({
      entry_direction: "spending",
      expense_date: "2026-04-01",
      currency_code: "IDR",
      amount: 100,
      category_id: "c1",
      type_id: null,
      staff_id: null,
      description: "",
      remarks: ""
    });
    expect(a).toBe(b);
  });
});
