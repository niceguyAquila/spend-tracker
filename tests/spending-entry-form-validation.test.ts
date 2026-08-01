import { describe, expect, it } from "vitest";
import {
  createEmptySpendingForm,
  describeMissingFields,
  missingSpendingFields
} from "@/lib/spending/entry-form-validation";

describe("missingSpendingFields", () => {
  it("reports all required fields on an empty form", () => {
    const form = createEmptySpendingForm();
    form.expense_date = "";
    form.category_id = "";
    form.amount = "";
    expect(missingSpendingFields(form)).toEqual([
      "expense_date",
      "category_id",
      "amount"
    ]);
  });

  it("accepts a complete form", () => {
    const form = createEmptySpendingForm({
      today: "2026-04-01",
      defaultCategoryId: "11111111-1111-4111-8111-111111111111"
    });
    form.amount = "1,500.25";
    expect(missingSpendingFields(form)).toEqual([]);
  });

  it("rejects zero and non-numeric amounts", () => {
    const form = createEmptySpendingForm({
      today: "2026-04-01",
      defaultCategoryId: "11111111-1111-4111-8111-111111111111"
    });
    form.amount = "0";
    expect(missingSpendingFields(form)).toContain("amount");
    form.amount = "abc";
    expect(missingSpendingFields(form)).toContain("amount");
  });
});

describe("describeMissingFields", () => {
  it("returns null when nothing is missing", () => {
    expect(describeMissingFields([])).toBeNull();
  });

  it("describes a single missing field", () => {
    expect(describeMissingFields(["amount"])).toBe("Add an amount to save.");
  });

  it("describes multiple missing fields", () => {
    expect(describeMissingFields(["expense_date", "category_id", "amount"])).toBe(
      "Add a date, a category and amount to save."
    );
  });
});
