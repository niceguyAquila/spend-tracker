"use client";

import type { ExpenseCategory, ExpenseStaff, ExpenseType, SpendingCurrencyCode } from "@/lib/types";
import { formatAmountInput } from "@/components/big-book-entry-fields";
import type { SpendingEntryForm } from "@/lib/spending/entry-form-validation";

const CURRENCY_OPTIONS: SpendingCurrencyCode[] = ["IDR", "MYR", "USDT", "TRX"];

type Props = {
  value: SpendingEntryForm;
  onChange: (next: SpendingEntryForm) => void;
  categories: ExpenseCategory[];
  types: ExpenseType[];
  staff: ExpenseStaff[];
  disabled?: boolean;
};

export function SpendingEntryFields({
  value,
  onChange,
  categories,
  types,
  staff,
  disabled = false
}: Props) {
  function patch(partial: Partial<SpendingEntryForm>) {
    onChange({ ...value, ...partial });
  }

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
      <label className="text-sm">
        Date *
        <input
          className="field mt-1"
          type="date"
          required
          disabled={disabled}
          value={value.expense_date}
          onChange={(event) => patch({ expense_date: event.target.value })}
        />
      </label>
      <label className="text-sm">
        Cash flow *
        <select
          className="field mt-1"
          required
          disabled={disabled}
          value={value.entry_direction}
          onChange={(event) =>
            patch({ entry_direction: event.target.value as "spending" | "profit" })
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
          disabled={disabled}
          value={value.type_id}
          onChange={(event) => patch({ type_id: event.target.value })}
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
          disabled={disabled}
          value={value.category_id}
          onChange={(event) => patch({ category_id: event.target.value })}
        >
          <option value="">Select category</option>
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
          disabled={disabled}
          value={value.description}
          onChange={(event) => patch({ description: event.target.value })}
        />
      </label>
      <label className="text-sm">
        Staff
        <select
          className="field mt-1"
          disabled={disabled}
          value={value.staff_id}
          onChange={(event) => patch({ staff_id: event.target.value })}
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
          disabled={disabled}
          value={value.currency_code}
          onChange={(event) =>
            patch({ currency_code: event.target.value as SpendingCurrencyCode })
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
          <span className="px-3 text-sm text-[rgb(var(--text-muted))]">{value.currency_code}</span>
          <input
            className="w-full rounded-r-md bg-transparent py-2 pr-3 text-sm text-[rgb(var(--text))] outline-none"
            inputMode="decimal"
            required
            disabled={disabled}
            placeholder="0"
            value={value.amount}
            onChange={(event) => patch({ amount: formatAmountInput(event.target.value) })}
          />
        </div>
      </label>
      <label className="text-sm lg:col-span-2 xl:col-span-1">
        Remarks
        <input
          className="field mt-1"
          placeholder="Invoice / transfer ref"
          disabled={disabled}
          value={value.remarks}
          onChange={(event) => patch({ remarks: event.target.value })}
        />
      </label>
    </div>
  );
}
