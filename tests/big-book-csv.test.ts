import { describe, expect, it } from "vitest";
import { parseBigBookCsv } from "@/lib/big-book/csv";

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
    expect(result.rows[1].remark).toBeNull();
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
