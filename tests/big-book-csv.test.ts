import { describe, expect, it } from "vitest";
import { buildBigBookImportTemplateCsv, parseBigBookCsv } from "@/lib/big-book/csv";

describe("parseBigBookCsv", () => {
  it("parses valid rows", () => {
    const csv = [
      "entry_date,entry_direction,type_name,explanation,amount,currency_code,remark,actor_name",
      "2026-04-25,spending,Office Supplies,Printer ink,350000,IDR,Restock,Actor A",
      "2026-04-26,profit,Sales Revenue,Daily settlement,1250.5,USDT,,Actor B"
    ].join("\n");

    const result = parseBigBookCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].currency_code).toBe("IDR");
    expect(result.rows[0].sub_type_name).toBeNull();
    expect(result.rows[0].vendor_type_name).toBeNull();
    expect(result.rows[0].vendor_name).toBeNull();
    expect(result.rows[0].pocket_name).toBeNull();
    expect(result.rows[0].group_label).toBeNull();
    expect(result.rows[0].group_remark).toBeNull();
    expect(result.rows[1].remark).toBeNull();
    expect(result.rows[1].sub_type_name).toBeNull();
  });

  it("parses optional sub_type_name when present", () => {
    const csv = [
      "entry_date,entry_direction,type_name,sub_type_name,explanation,amount,currency_code,remark,actor_name",
      "2026-04-25,spending,Office Supplies,Stationery,Printer ink,350000,IDR,Restock,Actor A",
      "2026-04-26,profit,Sales Revenue,,Daily settlement,1250.5,USDT,,Actor B"
    ].join("\n");

    const result = parseBigBookCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].sub_type_name).toBe("Stationery");
    expect(result.rows[1].sub_type_name).toBeNull();
  });

  it("parses optional vendor fields when present", () => {
    const csv = [
      "entry_date,entry_direction,type_name,sub_type_name,vendor_type_name,vendor_name,explanation,amount,currency_code,remark,actor_name",
      "2026-04-25,spending,Office Supplies,Stationery,Merchant,Rbee,Printer ink,350000,IDR,Restock,Actor A",
      "2026-04-26,profit,Sales Revenue,,Partner,,Daily settlement,1250.5,USDT,,Actor B"
    ].join("\n");

    const result = parseBigBookCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].vendor_type_name).toBe("Merchant");
    expect(result.rows[0].vendor_name).toBe("Rbee");
    expect(result.rows[1].vendor_type_name).toBe("Partner");
    expect(result.rows[1].vendor_name).toBeNull();
  });

  it("rejects vendor_name without vendor_type_name", () => {
    const csv = [
      "entry_date,entry_direction,type_name,vendor_name,explanation,amount,currency_code,remark,actor_name",
      "2026-04-25,spending,Office Supplies,Rbee,Printer ink,350000,IDR,Restock,Actor A"
    ].join("\n");

    const result = parseBigBookCsv(csv);
    expect(result.rows).toHaveLength(0);
    expect(result.errors.some((item) => item.includes("vendor_type_name is required"))).toBe(true);
  });

  it("rejects pocket_name on non-IDR rows", () => {
    const csv = [
      "entry_date,entry_direction,type_name,explanation,amount,currency_code,remark,actor_name,pocket_name",
      "2026-04-25,spending,Office Supplies,Printer ink,350000,MYR,Restock,Actor A,Petty Cash"
    ].join("\n");

    const result = parseBigBookCsv(csv);
    expect(result.rows).toHaveLength(0);
    expect(result.errors.some((item) => item.includes("pocket_name is only allowed on IDR rows"))).toBe(true);
  });

  it("parses pocket_name on IDR rows", () => {
    const csv = [
      "entry_date,entry_direction,type_name,explanation,amount,currency_code,remark,actor_name,pocket_name",
      "2026-04-25,spending,Office Supplies,Printer ink,350000,IDR,Restock,Actor A,Petty Cash"
    ].join("\n");

    const result = parseBigBookCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].pocket_name).toBe("Petty Cash");
  });

  it("parses dates in YYYY-MMM-DD format", () => {
    const csv = [
      "entry_date,entry_direction,type_name,explanation,amount,currency_code,remark,actor_name",
      "2024-Nov-01,spending,Operational,Register fee,104517,MYR,,JB"
    ].join("\n");

    const result = parseBigBookCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].entry_date).toBe("2024-11-01");
  });

  it("returns error for missing headers", () => {
    const csv = [
      "entry_date,entry_direction,explanation,amount,currency_code,remark,actor_name",
      "2026-04-25,spending,Printer ink,350000,IDR,Restock,Actor A"
    ].join("\n");

    const result = parseBigBookCsv(csv);
    expect(result.rows).toHaveLength(0);
    expect(result.errors.some((item) => item.includes("Missing required header: type_name"))).toBe(true);
  });

  it("returns row-level errors for invalid values", () => {
    const csv = [
      "entry_date,entry_direction,type_name,explanation,amount,currency_code,remark,actor_name",
      "2026-02-30,out,Office Supplies,Printer ink,0,IDN,,Actor A"
    ].join("\n");

    const result = parseBigBookCsv(csv);
    expect(result.rows).toHaveLength(0);
    expect(result.errors.some((item) => item.includes("entry_date"))).toBe(true);
  });
});

describe("buildBigBookImportTemplateCsv", () => {
  it("produces a CSV that parseBigBookCsv accepts", () => {
    const csv = buildBigBookImportTemplateCsv();
    const result = parseBigBookCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(3);
    expect(result.rows[0]).toMatchObject({
      entry_date: "2026-04-25",
      entry_direction: "spending",
      type_name: "Office Supplies",
      sub_type_name: "Stationery",
      vendor_type_name: "Merchant",
      vendor_name: "Rbee",
      explanation: "Printer ink",
      amount: 350000,
      currency_code: "IDR",
      remark: "Restock",
      actor_name: "Actor A",
      pocket_name: "Petty Cash",
      group_label: null,
      group_remark: null
    });
    expect(result.rows[1]).toMatchObject({
      group_label: "Hardware purchase",
      group_remark: "Grouped multi-currency buy",
      currency_code: "IDR"
    });
    expect(result.rows[2]).toMatchObject({
      group_label: "Hardware purchase",
      group_remark: "Grouped multi-currency buy",
      currency_code: "USDT"
    });
  });
});

describe("parseBigBookCsv group columns", () => {
  it("parses optional group_label and group_remark", () => {
    const csv = [
      "entry_date,entry_direction,type_name,explanation,amount,currency_code,remark,actor_name,group_label,group_remark",
      "2026-04-25,spending,Office Supplies,Leg A,100,IDR,,Actor A,Hardware buy,Note",
      "2026-04-26,spending,Office Supplies,Leg B,50,USDT,,Actor A,Hardware buy,Note"
    ].join("\n");

    const result = parseBigBookCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].group_label).toBe("Hardware buy");
    expect(result.rows[0].group_remark).toBe("Note");
  });

  it("rejects group_remark without group_label", () => {
    const csv = [
      "entry_date,entry_direction,type_name,explanation,amount,currency_code,remark,actor_name,group_remark",
      "2026-04-25,spending,Office Supplies,Leg A,100,IDR,,Actor A,Note"
    ].join("\n");

    const result = parseBigBookCsv(csv);
    expect(result.rows).toHaveLength(0);
    expect(result.errors.some((item) => item.includes("group_label is required"))).toBe(true);
  });
});

describe("parseBigBookCsv Excel compatibility", () => {
  it("parses CSV with UTF-8 BOM", () => {
    const csv =
      "\uFEFF" +
      [
        "entry_date,entry_direction,type_name,explanation,amount,currency_code,remark,actor_name",
        "2026-04-25,spending,Office Supplies,Printer ink,350000,IDR,Restock,Actor A"
      ].join("\n");

    const result = parseBigBookCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].type_name).toBe("Office Supplies");
  });

  it("parses semicolon-delimited CSV from Excel locales", () => {
    const csv = [
      "entry_date;entry_direction;type_name;sub_type_name;explanation;amount;currency_code;remark;actor_name",
      "2026-04-25;spending;Office Supplies;Stationery;Printer ink;350000;IDR;Restock;Actor A"
    ].join("\n");

    const result = parseBigBookCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].sub_type_name).toBe("Stationery");
  });

  it("keeps multi-line quoted fields on a single row", () => {
    const csv = [
      "entry_date;entry_direction;type_name;explanation;amount;currency_code;remark;actor_name;group_label;group_remark",
      '2026-02-24;spending;Operational;Leg A;8144;USDT;;Actor A;Tagihan Feb;"kilo = u398,300',
      "X = u144,200",
      '(total = u542,500)"',
      '2026-02-24;spending;Operational;Leg B;1.33;TRX;;Actor A;Tagihan Feb;"kilo = u398,300',
      "X = u144,200",
      '(total = u542,500)"'
    ].join("\n");

    const result = parseBigBookCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].group_remark).toBe("kilo = u398,300\nX = u144,200\n(total = u542,500)");
    expect(result.rows[1].explanation).toBe("Leg B");
  });

  it("parses Excel single-column quoted CSV lines", () => {
    const csv = [
      '"entry_date,entry_direction,type_name,explanation,amount,currency_code,remark,actor_name"',
      '"2026-04-25,spending,Office Supplies,Printer ink,350000,IDR,Restock,Actor A"'
    ].join("\n");

    const result = parseBigBookCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].actor_name).toBe("Actor A");
  });
});
