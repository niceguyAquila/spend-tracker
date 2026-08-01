import type { SpendingCurrencyCode } from "@/lib/types";

export type SpendingEntryForm = {
  expense_date: string;
  entry_direction: "spending" | "profit";
  type_id: string;
  category_id: string;
  description: string;
  staff_id: string;
  currency_code: SpendingCurrencyCode;
  amount: string;
  remarks: string;
};

export type MissingSpendingField = "expense_date" | "category_id" | "currency_code" | "amount";

/** Returns which required spending fields are empty or invalid. */
export function missingSpendingFields(form: SpendingEntryForm): MissingSpendingField[] {
  const missing: MissingSpendingField[] = [];
  if (!form.expense_date.trim()) missing.push("expense_date");
  if (!form.category_id.trim()) missing.push("category_id");
  if (!form.currency_code) missing.push("currency_code");
  const amountRaw = form.amount.replace(/,/g, "").trim();
  const amountValue = Number(amountRaw);
  if (!amountRaw || !Number.isFinite(amountValue) || amountValue <= 0) {
    missing.push("amount");
  }
  return missing;
}

const FIELD_LABELS: Record<MissingSpendingField, string> = {
  expense_date: "date",
  category_id: "category",
  currency_code: "currency",
  amount: "amount"
};

function withArticle(label: string) {
  return /^[aeiou]/i.test(label) ? `an ${label}` : `a ${label}`;
}

/** Human-readable hint for what's blocking Save. */
export function describeMissingFields(missing: MissingSpendingField[]): string | null {
  if (missing.length === 0) return null;
  if (missing.length === 1) {
    return `Add ${withArticle(FIELD_LABELS[missing[0]])} to save.`;
  }
  const labels = missing.map((field) => FIELD_LABELS[field]);
  const last = labels.pop();
  return `Add ${labels.map(withArticle).join(", ")} and ${last} to save.`;
}

export function createEmptySpendingForm(options?: {
  today?: string;
  defaultCategoryId?: string;
}): SpendingEntryForm {
  return {
    expense_date: options?.today ?? new Date().toISOString().slice(0, 10),
    entry_direction: "spending",
    type_id: "",
    category_id: options?.defaultCategoryId ?? "",
    description: "",
    staff_id: "",
    currency_code: "IDR",
    amount: "",
    remarks: ""
  };
}
