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
      "2026-04-25,spending,Ads,Facebook,150000,April boost,INV-001",
      "2026-04-26,profit,,,50000,,"
    ].join("\n");

    const result = parseSpendingCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      expense_date: "2026-04-25",
      entry_direction: "spending",
      category_name: "Ads",
      subcategory_name: "Facebook",
      amount: 150000,
      note: "April boost",
      reference: "INV-001"
    });
    expect(result.rows[1]).toMatchObject({
      expense_date: "2026-04-26",
      entry_direction: "profit",
      category_name: null,
      subcategory_name: null,
      amount: 50000,
      note: null,
      reference: null
    });
  });

  it("normalizes YYYY-MMM-DD dates and strips amount commas", () => {
    const csv = [SPENDING_CSV_HEADERS.join(","), "2026-Apr-01,spending,Ads,,1,500.50,,"].join("\n");
    // amount cell "1,500.50" needs quoting when it contains a comma
    const quoted = [
      SPENDING_CSV_HEADERS.join(","),
      '2026-Apr-01,spending,Ads,,"1,500.50",,'
    ].join("\n");

    const result = parseSpendingCsv(quoted);
    expect(result.errors).toEqual([]);
    expect(result.rows[0]?.expense_date).toBe("2026-04-01");
    expect(result.rows[0]?.amount).toBe(1500.5);
    expect(csv).toBeTruthy();
  });

  it("rejects missing required headers", () => {
    const result = parseSpendingCsv("expense_date,amount\n2026-04-01,100");
    expect(result.rows).toEqual([]);
    expect(result.errors.some((item) => item.includes("Missing required header"))).toBe(true);
  });

  it("rejects invalid direction, date, and amount", () => {
    const csv = [
      SPENDING_CSV_HEADERS.join(","),
      "2026-02-30,out,Ads,Facebook,0,,"
    ].join("\n");
    const result = parseSpendingCsv(csv);
    expect(result.rows).toEqual([]);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("accepts semicolon-delimited Excel exports and strips BOM", () => {
    const csv = `\uFEFF${SPENDING_CSV_HEADERS.join(";")}\r\n2026-04-25;spending;Ads;Facebook;150000;note;ref`;
    const result = parseSpendingCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.category_name).toBe("Ads");
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
  it("normalizes blank note/reference the same way as the expression index", () => {
    const a = spendingDedupeKey({
      entry_direction: "spending",
      expense_date: "2026-04-01",
      amount: 100,
      category_id: "c1",
      subcategory_id: "s1",
      note: "  ",
      reference: null
    });
    const b = spendingDedupeKey({
      entry_direction: "spending",
      expense_date: "2026-04-01",
      amount: 100,
      category_id: "c1",
      subcategory_id: "s1",
      note: "",
      reference: ""
    });
    expect(a).toBe(b);
  });
});
