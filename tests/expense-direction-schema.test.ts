import { describe, expect, it } from "vitest";
import { expenseInputSchema } from "@/lib/validation/expense";

const validBase = {
  expense_date: "2026-04-01",
  category_id: "11111111-1111-4111-8111-111111111111",
  amount: 100,
  description: "",
  remarks: ""
};

describe("expenseInputSchema entry_direction and currency", () => {
  it("defaults entry_direction to spending and currency to IDR", () => {
    const parsed = expenseInputSchema.parse(validBase);
    expect(parsed.entry_direction).toBe("spending");
    expect(parsed.currency_code).toBe("IDR");
  });

  it("accepts spending and profit", () => {
    expect(expenseInputSchema.parse({ ...validBase, entry_direction: "spending" }).entry_direction).toBe(
      "spending"
    );
    expect(expenseInputSchema.parse({ ...validBase, entry_direction: "profit" }).entry_direction).toBe(
      "profit"
    );
  });

  it("rejects unknown directions", () => {
    expect(expenseInputSchema.safeParse({ ...validBase, entry_direction: "transfer" }).success).toBe(false);
  });

  it("accepts optional type_id and staff_id as null", () => {
    const parsed = expenseInputSchema.parse({
      ...validBase,
      type_id: null,
      staff_id: null,
      currency_code: "USDT",
      description: "top-up",
      remarks: "REF-1"
    });
    expect(parsed).toMatchObject({
      currency_code: "USDT",
      type_id: null,
      staff_id: null,
      description: "top-up",
      remarks: "REF-1"
    });
  });
});
