import { describe, expect, it } from "vitest";
import { parseCreditBigBookCsv } from "@/lib/credit-big-book/csv";

describe("parseCreditBigBookCsv", () => {
  it("parses valid rows", () => {
    const csv = [
      "entry_date,entry_direction,type_name,explanation,amount,currency_code,remark,actor_name",
      "2026-04-25,debt,Payable,Vendor invoice,350000,IDR,Restock,Actor A",
      "2026-04-26,credit,Receivable,Customer payment,1250.5,USDT,,Actor B"
    ].join("\n");

    const result = parseCreditBigBookCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].currency_code).toBe("IDR");
    expect(result.rows[0].entry_direction).toBe("debt");
    expect(result.rows[0].sub_type_name).toBeNull();
    expect(result.rows[1].entry_direction).toBe("credit");
    expect(result.rows[1].remark).toBeNull();
    expect(result.rows[1].sub_type_name).toBeNull();
  });

  it("parses optional sub_type_name when present", () => {
    const csv = [
      "entry_date,entry_direction,type_name,sub_type_name,explanation,amount,currency_code,remark,actor_name",
      "2026-04-25,debt,Payable,Invoice,Vendor invoice,350000,IDR,Restock,Actor A",
      "2026-04-26,credit,Receivable,,Customer payment,1250.5,USDT,,Actor B"
    ].join("\n");

    const result = parseCreditBigBookCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].sub_type_name).toBe("Invoice");
    expect(result.rows[1].sub_type_name).toBeNull();
  });

  it("parses dates in YYYY-MMM-DD format", () => {
    const csv = [
      "entry_date,entry_direction,type_name,explanation,amount,currency_code,remark,actor_name",
      "2024-Nov-01,debt,Payable,Register fee,104517,MYR,,Actor A"
    ].join("\n");

    const result = parseCreditBigBookCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].entry_date).toBe("2024-11-01");
  });

  it("returns error for missing headers", () => {
    const csv = [
      "entry_date,entry_direction,explanation,amount,currency_code,remark,actor_name",
      "2026-04-25,debt,Vendor invoice,350000,IDR,Restock,Actor A"
    ].join("\n");

    const result = parseCreditBigBookCsv(csv);
    expect(result.rows).toHaveLength(0);
    expect(result.errors.some((item) => item.includes("Missing required header: type_name"))).toBe(true);
  });

  it("returns row-level errors for invalid values", () => {
    const csv = [
      "entry_date,entry_direction,type_name,explanation,amount,currency_code,remark,actor_name",
      "2026-02-30,out,Payable,Vendor invoice,0,IDN,,Actor A"
    ].join("\n");

    const result = parseCreditBigBookCsv(csv);
    expect(result.rows).toHaveLength(0);
    expect(result.errors.some((item) => item.includes("entry_date"))).toBe(true);
  });

  it("rejects spending/profit values that belong to Transaction Big Book", () => {
    const csv = [
      "entry_date,entry_direction,type_name,explanation,amount,currency_code,remark,actor_name",
      "2026-04-25,spending,Payable,Vendor invoice,350000,IDR,,Actor A",
      "2026-04-26,profit,Receivable,Customer payment,1250.5,USDT,,Actor B"
    ].join("\n");

    const result = parseCreditBigBookCsv(csv);
    expect(result.rows).toHaveLength(0);
    expect(result.errors.some((item) => item.includes("entry_direction"))).toBe(true);
  });
});
