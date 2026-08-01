import { describe, expect, it } from "vitest";
import { expenseInputSchema } from "@/lib/validation/expense";

const validBase = {
  expense_date: "2026-08-01",
  category_id: "11111111-1111-4111-8111-111111111111",
  subcategory_id: "22222222-2222-4222-8222-222222222222",
  amount: 15000,
  note: "",
  reference: ""
};

describe("expenseInputSchema entry_direction", () => {
  it("defaults entry_direction to spending when omitted", () => {
    const parsed = expenseInputSchema.safeParse(validBase);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.entry_direction).toBe("spending");
  });

  it("accepts profit and spending", () => {
    expect(expenseInputSchema.safeParse({ ...validBase, entry_direction: "profit" }).success).toBe(
      true
    );
    expect(expenseInputSchema.safeParse({ ...validBase, entry_direction: "spending" }).success).toBe(
      true
    );
  });

  it("rejects invalid entry_direction values", () => {
    const parsed = expenseInputSchema.safeParse({ ...validBase, entry_direction: "transfer" });
    expect(parsed.success).toBe(false);
  });

  it("round-trips direction for PATCH-style payloads", () => {
    const parsed = expenseInputSchema.safeParse({
      ...validBase,
      entry_direction: "profit",
      note: "top-up",
      reference: "REF-1"
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data).toMatchObject({
      entry_direction: "profit",
      amount: 15000,
      note: "top-up",
      reference: "REF-1"
    });
  });
});
