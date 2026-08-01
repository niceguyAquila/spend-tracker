"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ExpenseCategory, ExpenseStaff, ExpenseType, SpendingCurrencyCode } from "@/lib/types";
import { handleUnauthorizedResponse, secureFetch } from "@/lib/client/auth-fetch";
import { BlockingOverlay } from "@/components/ui/blocking-overlay";
import { formatAmountInput, parseAmountInput } from "@/components/big-book-entry-fields";

type Props = {
  categories: ExpenseCategory[];
  types: ExpenseType[];
  staff: ExpenseStaff[];
  defaultCategoryId?: string;
  submitLabel?: string;
};

type FormState = {
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

const today = new Date().toISOString().slice(0, 10);

const CURRENCY_OPTIONS: SpendingCurrencyCode[] = ["IDR", "MYR", "USDT", "TRX"];

function extractApiError(error: unknown, fallback: string) {
  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }
  if (error && typeof error === "object") {
    const maybeZod = error as { formErrors?: unknown; fieldErrors?: Record<string, unknown> };
    if (Array.isArray(maybeZod.formErrors)) {
      const formError = maybeZod.formErrors.find((item) => typeof item === "string" && item.trim().length > 0);
      if (typeof formError === "string") {
        return formError;
      }
    }
    if (maybeZod.fieldErrors && typeof maybeZod.fieldErrors === "object") {
      for (const value of Object.values(maybeZod.fieldErrors)) {
        if (Array.isArray(value)) {
          const fieldError = value.find((item) => typeof item === "string" && item.trim().length > 0);
          if (typeof fieldError === "string") {
            return fieldError;
          }
        }
      }
    }
  }
  return fallback;
}

export function TransactionForm({
  categories,
  types,
  staff,
  defaultCategoryId,
  submitLabel = "Save"
}: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({
    expense_date: today,
    entry_direction: "spending",
    type_id: "",
    category_id: defaultCategoryId ?? categories[0]?.id ?? "",
    description: "",
    staff_id: "",
    currency_code: "IDR",
    amount: "",
    remarks: ""
  });

  async function handleSave(addAnother: boolean) {
    if (!form.expense_date) {
      setError("Date is required.");
      return;
    }
    if (!form.category_id) {
      setError("Category is required.");
      return;
    }
    const amountValue = Number(parseAmountInput(form.amount));
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      setError("Amount must be greater than 0.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await secureFetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expense_date: form.expense_date,
          entry_direction: form.entry_direction,
          currency_code: form.currency_code,
          category_id: form.category_id,
          type_id: form.type_id || null,
          staff_id: form.staff_id || null,
          amount: amountValue,
          description: form.description,
          remarks: form.remarks
        })
      });
      if (handleUnauthorizedResponse(response)) {
        return;
      }
      const data = await response.json();

      if (!response.ok) {
        setError(extractApiError(data.error, "Failed to save transaction."));
        return;
      }

      setSuccess("Transaction saved.");
      if (addAnother) {
        setForm((prev) => ({ ...prev, amount: "", description: "", remarks: "" }));
      } else {
        setForm((prev) => ({ ...prev, amount: "" }));
      }
      router.refresh();
    } catch {
      setError("Failed to save transaction due to a network error.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card relative" aria-busy={saving}>
      <BlockingOverlay active={saving} label="Saving transaction..." />
      <h2 className="mb-3 text-lg font-semibold">Quick Add Transaction</h2>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
        <label className="text-sm">
          Date *
          <input
            className="field mt-1"
            type="date"
            required
            disabled={saving}
            value={form.expense_date}
            onChange={(event) => setForm((prev) => ({ ...prev, expense_date: event.target.value }))}
          />
        </label>
        <label className="text-sm">
          Cash flow *
          <select
            className="field mt-1"
            required
            disabled={saving}
            value={form.entry_direction}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                entry_direction: event.target.value as "spending" | "profit"
              }))
            }
          >
            <option value="spending">Out</option>
            <option value="profit">In</option>
          </select>
        </label>
        <label className="text-sm">
          Type
          <select
            className="field mt-1"
            disabled={saving}
            value={form.type_id}
            onChange={(event) => setForm((prev) => ({ ...prev, type_id: event.target.value }))}
          >
            <option value="">Select type (optional)</option>
            {types.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Category *
          <select
            className="field mt-1"
            required
            disabled={saving}
            value={form.category_id}
            onChange={(event) => setForm((prev) => ({ ...prev, category_id: event.target.value }))}
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm lg:col-span-2 xl:col-span-1">
          Description
          <input
            className="field mt-1"
            placeholder="Optional description"
            disabled={saving}
            value={form.description}
            onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
          />
        </label>
        <label className="text-sm">
          Staff
          <select
            className="field mt-1"
            disabled={saving}
            value={form.staff_id}
            onChange={(event) => setForm((prev) => ({ ...prev, staff_id: event.target.value }))}
          >
            <option value="">Select staff (optional)</option>
            {staff.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Currency *
          <select
            className="field mt-1"
            required
            disabled={saving}
            value={form.currency_code}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                currency_code: event.target.value as SpendingCurrencyCode
              }))
            }
          >
            {CURRENCY_OPTIONS.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Amount *
          <div className="mt-1 flex items-center rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
            <span className="px-3 text-sm text-[rgb(var(--text-muted))]">{form.currency_code}</span>
            <input
              className="w-full rounded-r-md bg-transparent py-2 pr-3 text-sm text-[rgb(var(--text))] outline-none"
              inputMode="decimal"
              required
              disabled={saving}
              placeholder="0"
              value={form.amount}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, amount: formatAmountInput(event.target.value) }))
              }
            />
          </div>
        </label>
        <label className="text-sm lg:col-span-2 xl:col-span-1">
          Remarks
          <input
            className="field mt-1"
            placeholder="Invoice / transfer ref"
            disabled={saving}
            value={form.remarks}
            onChange={(event) => setForm((prev) => ({ ...prev, remarks: event.target.value }))}
          />
        </label>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button className="btn" disabled={saving} onClick={() => handleSave(false)}>
          {saving ? "Saving..." : submitLabel}
        </button>
        <button className="btn-secondary" disabled={saving} onClick={() => handleSave(true)}>
          Save + Add Another
        </button>
      </div>

      {error ? <p className="mt-3 text-sm text-[rgb(var(--danger))]">{error}</p> : null}
      {success ? <p className="mt-3 text-sm text-[rgb(var(--success))]">{success}</p> : null}
    </section>
  );
}
