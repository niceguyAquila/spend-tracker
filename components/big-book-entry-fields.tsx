"use client";

import { useEffect, useRef } from "react";
import type {
  BigBookActionBy,
  BigBookActor,
  BigBookActorPocket,
  BigBookLedgerType,
  BigBookSettlementTargetRef,
  BigBookTypeVendorTypeMap,
  BigBookVendor,
  BigBookVendorType
} from "@/lib/types";
import { formatAmount } from "@/lib/display-format";
import { FieldHintTooltip } from "@/components/ui/field-hint-tooltip";
import { FormSection } from "@/components/ui/form-section";
import {
  computeSettlementAmountFromCredit,
  computeSettlementAmountInCreditCurrency
} from "@/lib/big-book/credit";
import { mappedVendorTypeIdForType } from "@/lib/big-book/type-vendor-type-map";
import { sortByDisplayLabel } from "@/lib/ui/sort-by-display-label";

export { mappedVendorTypeIdForType } from "@/lib/big-book/type-vendor-type-map";

export type EntryFormState = {
  entry_date: string;
  entry_direction: "spending" | "profit";
  entry_type_id: string;
  vendor_type_id: string;
  vendor_id: string;
  pocket_id: string;
  action_by_id: string;
  explanation: string;
  amount: string;
  currency_code: "IDR" | "MYR" | "USDT" | "TRX";
  gas_fee_amount: string;
  /** Create-only USDT inflow companion rate (e.g. 0.999423). */
  kurs_rate: string;
  /** Create-only companion USDT amount = A × (1 − r), editable override. */
  kurs_amount: string;
  remark: string;
  responsible_actor_id: string;
  is_credit: boolean;
  is_debt: boolean;
  settles_entry_id: string;
  settlement_conversion_rate: string;
  settlement_note: string;
  close_credit: boolean;
  credit_settlement_note: string;
  close_debt: boolean;
  debt_settlement_note: string;
};

const amountFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 4
});

export function parseAmountInput(value: string) {
  return value.replace(/,/g, "");
}

export function formatAmountInput(value: string) {
  const cleaned = value.replace(/[^\d.]/g, "");
  if (!cleaned) return "";
  const [integerPartRaw, ...decimalParts] = cleaned.split(".");
  const integerPart = integerPartRaw.replace(/^0+(?=\d)/, "") || "0";
  const decimalPart = decimalParts.join("").slice(0, 4);
  const formattedInteger = amountFormatter.format(Number(integerPart));
  if (cleaned.endsWith(".") && decimalPart.length === 0) {
    return `${formattedInteger}.`;
  }
  return decimalPart.length > 0 ? `${formattedInteger}.${decimalPart}` : formattedInteger;
}

export function formatRateInput(value: string) {
  const cleaned = value.replace(/[^\d.]/g, "");
  if (!cleaned) return "";
  const [integerPart, ...decimalParts] = cleaned.split(".");
  const decimalPart = decimalParts.join("").slice(0, 8);
  if (cleaned.includes(".")) {
    return `${integerPart}.${decimalPart}`;
  }
  return integerPart;
}

export function createEmptyEntryForm(options: {
  today: string;
  defaultTypeId: string;
  defaultActorId: string;
  typeVendorTypeMaps?: BigBookTypeVendorTypeMap[];
}): EntryFormState {
  const mappedVendorTypeId = mappedVendorTypeIdForType(
    options.defaultTypeId,
    options.typeVendorTypeMaps
  );
  return {
    entry_date: options.today,
    entry_direction: "spending",
    entry_type_id: options.defaultTypeId,
    vendor_type_id: mappedVendorTypeId,
    vendor_id: "",
    pocket_id: "",
    action_by_id: "",
    explanation: "",
    amount: "",
    currency_code: "IDR",
    gas_fee_amount: "",
    kurs_rate: "",
    kurs_amount: "",
    remark: "",
    responsible_actor_id: options.defaultActorId,
    is_credit: false,
    is_debt: false,
    settles_entry_id: "",
    settlement_conversion_rate: "",
    settlement_note: "",
    close_credit: false,
    credit_settlement_note: "",
    close_debt: false,
    debt_settlement_note: ""
  };
}

type Props = {
  value: EntryFormState;
  onChange: (next: EntryFormState) => void;
  types: BigBookLedgerType[];
  vendorTypes: BigBookVendorType[];
  vendors: BigBookVendor[];
  actionByOptions: BigBookActionBy[];
  pockets: BigBookActorPocket[];
  actors: BigBookActor[];
  typeVendorTypeMaps?: BigBookTypeVendorTypeMap[];
  currencies?: Array<"IDR" | "MYR" | "USDT" | "TRX">;
  showAttachments?: boolean;
  attachmentFiles?: File[];
  onAttachmentFilesChange?: (files: File[]) => void;
  onRemoveAttachmentAt?: (index: number) => void;
  explanationPlaceholder?: string;
  settlesEntry?: BigBookSettlementTargetRef | null;
  onFetchConversionRate?: () => void;
  fetchingConversionRate?: boolean;
  hideCreditToggle?: boolean;
  /** Create-only: show optional TRX gas-fee / KURS companions when applicable. */
  showGasFee?: boolean;
  /**
   * `full` shows labeled sections with a 1/2/3-column grid.
   * `nested` drops section headers and uses a 2-column grid (for grouped cards).
   */
  layout?: "full" | "nested";
};

export function BigBookEntryFields({
  value,
  onChange,
  types,
  vendorTypes,
  actionByOptions,
  pockets,
  actors,
  typeVendorTypeMaps = [],
  currencies = ["IDR", "MYR", "USDT", "TRX"],
  showAttachments = false,
  attachmentFiles = [],
  onAttachmentFilesChange,
  onRemoveAttachmentAt,
  explanationPlaceholder = "What was this spending/profit for?",
  settlesEntry = null,
  onFetchConversionRate,
  fetchingConversionRate = false,
  hideCreditToggle = false,
  showGasFee = false,
  layout = "full"
}: Props) {
  const activeTypes = sortByDisplayLabel(
    types.filter((row) => row.is_active),
    (row) => row.name
  );
  const activeVendorTypes = vendorTypes.filter((row) => row.is_active);
  const mappedVendorTypeId = mappedVendorTypeIdForType(value.entry_type_id, typeVendorTypeMaps);
  const mappedVendorType =
    mappedVendorTypeId
      ? vendorTypes.find((row) => row.id === mappedVendorTypeId) ?? null
      : null;
  // Ensure the mapped (or currently selected) vendor type appears even if inactive.
  const vendorTypesForSelect = (() => {
    const byId = new Map(activeVendorTypes.map((row) => [row.id, row]));
    if (mappedVendorType && !byId.has(mappedVendorType.id)) {
      byId.set(mappedVendorType.id, mappedVendorType);
    }
    if (value.vendor_type_id && !byId.has(value.vendor_type_id)) {
      const selected = vendorTypes.find((row) => row.id === value.vendor_type_id);
      if (selected) byId.set(selected.id, selected);
    }
    return sortByDisplayLabel([...byId.values()], (row) => row.name);
  })();
  const activeActionBy = sortByDisplayLabel(
    actionByOptions.filter((row) => row.is_active),
    (row) => row.name
  );
  const sortedActors = sortByDisplayLabel(actors, (row) => row.display_name);
  const sortedCurrencies = sortByDisplayLabel(currencies, (row) => row);
  // Pocket UI removed from create/edit; pocket_id stays in state/API (optional/empty).
  void pockets;
  const isSettlementMode = Boolean(settlesEntry || value.settles_entry_id);
  const settlementKind: "none" | "credit" | "debt" = value.is_credit
    ? "credit"
    : value.is_debt
      ? "debt"
      : "none";
  const showSettlementType = !hideCreditToggle && !isSettlementMode;

  function applySettlementKind(next: "none" | "credit" | "debt") {
    patch({
      is_credit: next === "credit",
      is_debt: next === "debt",
      entry_direction: next === "debt" ? "spending" : value.entry_direction,
      settles_entry_id: "",
      settlement_conversion_rate: "",
      settlement_note: "",
      close_credit: false,
      credit_settlement_note: "",
      close_debt: false,
      debt_settlement_note: "",
      ...(next === "debt" ? { kurs_rate: "", kurs_amount: "" } : {})
    });
  }
  const cashFlowLockedOut =
    settlementKind === "debt" || Boolean(settlesEntry?.is_debt);
  // Cross-currency settlement: admin enters company rate under Amount.
  // Convention: rate = credit_currency units per 1 settlement_currency unit;
  // settlement_amount = credit_amount / rate.
  const showConversionRate =
    isSettlementMode &&
    settlesEntry != null &&
    value.currency_code !== settlesEntry.currency_code;
  const showKursFields =
    showGasFee && value.currency_code === "USDT" && value.entry_direction === "profit";

  const moreDetailsFilled =
    Boolean(value.remark.trim()) || (showAttachments && attachmentFiles.length > 0);
  const moreDetailsSummary = moreDetailsFilled
    ? [
        value.remark.trim() ? "remark" : null,
        showAttachments && attachmentFiles.length > 0
          ? `${attachmentFiles.length} file${attachmentFiles.length === 1 ? "" : "s"}`
          : null
      ]
        .filter(Boolean)
        .join(" · ")
    : undefined;

  const isNested = layout === "nested";
  const columns = isNested ? "nested" : "full";
  const spanClass = isNested ? "sm:col-span-2" : "sm:col-span-2 xl:col-span-3";

  function patch(partial: Partial<EntryFormState>) {
    onChange({ ...value, ...partial });
  }

  function applyTypeChange(nextTypeId: string) {
    const nextMappedVendorTypeId = mappedVendorTypeIdForType(nextTypeId, typeVendorTypeMaps);
    patch({
      entry_type_id: nextTypeId,
        vendor_type_id: nextMappedVendorTypeId,
      vendor_id: ""
    });
  }

  // Safety net: when Type is already selected (default create Type) or maps arrive,
  // keep Vendor Type in sync with the mapping. Re-apply on every Type change; do not
  // overwrite a non-empty Vendor Type on first mount of an edit form.
  const prevTypeIdRef = useRef<string | null>(null);
  useEffect(() => {
    const prevTypeId = prevTypeIdRef.current;
    prevTypeIdRef.current = value.entry_type_id;
    const mapped = mappedVendorTypeIdForType(value.entry_type_id, typeVendorTypeMaps);

    if (prevTypeId === null) {
      if (!value.vendor_type_id && mapped) {
        onChange({ ...value, vendor_type_id: mapped, vendor_id: "" });
      }
      return;
    }

    if (prevTypeId !== value.entry_type_id && value.vendor_type_id !== mapped) {
      // applyTypeChange usually already set this; this covers any other Type updates.
      onChange({
        ...value,
        vendor_type_id: mapped,
        vendor_id: ""
      });
    }
    // Intentionally depend on type id + maps only; value/onChange would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.entry_type_id, typeVendorTypeMaps]);

  // When conversion rate changes (typed or fetched), populate settlement Amount.
  // Formula: settlement_amount = credit_amount / rate
  // (rate = credit units per 1 settlement-currency unit).
  const prevConversionRateRef = useRef<string | null>(null);
  useEffect(() => {
    if (!showConversionRate || !settlesEntry) {
      prevConversionRateRef.current = null;
      return;
    }
    const rateRaw = value.settlement_conversion_rate;
    if (prevConversionRateRef.current === rateRaw) return;
    prevConversionRateRef.current = rateRaw;
    const rate = Number(rateRaw);
    if (!Number.isFinite(rate) || rate <= 0) return;
    const nextAmount = formatAmountInput(
      String(computeSettlementAmountFromCredit(Math.abs(settlesEntry.amount), rate))
    );
    if (nextAmount !== value.amount) {
      onChange({ ...value, amount: nextAmount });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    showConversionRate,
    value.settlement_conversion_rate,
    settlesEntry?.id,
    settlesEntry?.amount
  ]);

  // Recompute KURS companion amount whenever main amount or rate changes.
  // Manual edits to kurs_amount stick until A or r changes again.
  useEffect(() => {
    if (!showKursFields) {
      if (value.kurs_rate || value.kurs_amount) {
        onChange({ ...value, kurs_rate: "", kurs_amount: "" });
      }
      return;
    }
    const rateRaw = value.kurs_rate.trim();
    if (!rateRaw) {
      if (value.kurs_amount) onChange({ ...value, kurs_amount: "" });
      return;
    }
    const mainAmount = Number(parseAmountInput(value.amount));
    const rate = Number(parseAmountInput(rateRaw));
    if (!Number.isFinite(mainAmount) || mainAmount <= 0 || !Number.isFinite(rate)) {
      if (value.kurs_amount) onChange({ ...value, kurs_amount: "" });
      return;
    }
    const computed = mainAmount * (1 - rate);
    if (!Number.isFinite(computed) || computed <= 0) {
      if (value.kurs_amount) onChange({ ...value, kurs_amount: "" });
      return;
    }
    const nextAmount = formatAmountInput(String(Math.round(computed * 1e4) / 1e4));
    if (nextAmount !== value.kurs_amount) {
      onChange({ ...value, kurs_amount: nextAmount });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showKursFields, value.amount, value.kurs_rate]);

  const moneyFields = (
    <>
      <label className="text-sm">
        Date *
        <input
          className="field mt-1"
          type="date"
          value={value.entry_date}
          onChange={(event) => patch({ entry_date: event.target.value })}
        />
      </label>
      <label className="text-sm">
        Cash Flow *
        <select
          className="field mt-1"
          value={cashFlowLockedOut ? "spending" : value.entry_direction}
          disabled={cashFlowLockedOut}
          title={
            cashFlowLockedOut
              ? "Debt and debt payments always use Cash Flow Out."
              : undefined
          }
          onChange={(event) => {
            const nextDirection = event.target.value as "spending" | "profit";
            patch({
              entry_direction: nextDirection,
              ...(nextDirection !== "profit"
                ? { kurs_rate: "", kurs_amount: "" }
                : {})
            });
          }}
        >
          <option value="spending">Out</option>
          <option value="profit">In</option>
        </select>
        {cashFlowLockedOut ? (
          <span className="mt-1 block text-xs text-muted">Locked to Out for Debt.</span>
        ) : null}
      </label>
      <label className="text-sm">
        Amount *
        <div className="mt-1 flex overflow-hidden rounded-md border border-[rgb(var(--border))] focus-within:shadow-[0_0_0_3px_rgba(var(--focus),0.25)]">
          <input
            className="min-w-0 flex-1 border-0 bg-[rgb(var(--surface))] px-3 py-2 text-right text-base font-medium text-[rgb(var(--text))] focus:outline-none"
            inputMode="decimal"
            placeholder="0"
            value={value.amount}
            onChange={(event) => patch({ amount: formatAmountInput(event.target.value) })}
          />
          <select
            className="shrink-0 border-0 border-l border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] px-2 py-2 text-sm font-medium text-[rgb(var(--text))] focus:outline-none"
            value={value.currency_code}
            onChange={(event) => {
              const nextCurrency = event.target.value as EntryFormState["currency_code"];
              const sameAsCredit = Boolean(
                settlesEntry && nextCurrency === settlesEntry.currency_code
              );
              const keepUsdtCompanions = nextCurrency === "USDT";
              patch({
                currency_code: nextCurrency,
                pocket_id: "",
                gas_fee_amount: keepUsdtCompanions ? value.gas_fee_amount : "",
                kurs_rate: keepUsdtCompanions && value.entry_direction === "profit" ? value.kurs_rate : "",
                kurs_amount:
                  keepUsdtCompanions && value.entry_direction === "profit" ? value.kurs_amount : "",
                // Same-currency settlements force rate = 1; cross-currency requires an explicit rate.
                settlement_conversion_rate: sameAsCredit ? "1" : settlesEntry ? "" : value.settlement_conversion_rate
              });
            }}
            aria-label="Currency"
          >
            {sortedCurrencies.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </select>
        </div>
      </label>
      {showConversionRate && settlesEntry ? (
        <label className={`text-sm ${spanClass}`}>
          <span className="inline-flex items-center gap-1.5">
            Conversion Rate (1 {value.currency_code} = ? {settlesEntry.currency_code})
            <FieldHintTooltip
              label="Conversion rate help"
              content={
                <>
                  Optional. When set, amount in {value.currency_code} = credit amount ÷ rate.
                  Credit-currency equivalent is not required to save.
                </>
              }
            />
          </span>
          <div className="mt-1 flex gap-2">
            <input
              className="field flex-1"
              inputMode="decimal"
              placeholder="Optional — today’s company rate"
              value={value.settlement_conversion_rate}
              onChange={(event) =>
                patch({ settlement_conversion_rate: formatRateInput(event.target.value) })
              }
            />
            {onFetchConversionRate ? (
              <button
                type="button"
                className="btn-secondary whitespace-nowrap"
                onClick={onFetchConversionRate}
                disabled={fetchingConversionRate}
              >
                {fetchingConversionRate ? "Fetching..." : "Fetch rate"}
              </button>
            ) : null}
          </div>
          <span className="mt-1 block text-xs tabular-nums text-muted">
            Equivalent in {settlesEntry.currency_code}:{" "}
            {(() => {
              const rate = Number(value.settlement_conversion_rate);
              const settleAmount = Number(parseAmountInput(value.amount));
              if (!(rate > 0) || !(settleAmount > 0)) return "--";
              return formatAmount(computeSettlementAmountInCreditCurrency(settleAmount, rate), {
                minimumFractionDigits: 0,
                maximumFractionDigits: 4
              });
            })()}
          </span>
        </label>
      ) : null}
      {showGasFee && value.currency_code === "USDT" ? (
        <label className="text-sm">
          <span className="inline-flex items-center gap-1.5">
            Gas fee
            <FieldHintTooltip
              label="Gas fee help"
              content="Optional. Creates a grouped TRX spending entry."
            />
          </span>
          <div className="mt-1 flex overflow-hidden rounded-md border border-[rgb(var(--border))] focus-within:shadow-[0_0_0_3px_rgba(var(--focus),0.25)]">
            <input
              className="min-w-0 flex-1 border-0 bg-[rgb(var(--surface))] px-3 py-2 text-right text-base font-medium text-[rgb(var(--text))] focus:outline-none"
              inputMode="decimal"
              placeholder="0"
              value={value.gas_fee_amount}
              onChange={(event) => patch({ gas_fee_amount: formatAmountInput(event.target.value) })}
              aria-label="Gas fee amount"
            />
            <span
              className="shrink-0 border-0 border-l border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] px-2 py-2 text-sm font-medium text-[rgb(var(--text))]"
              aria-hidden
            >
              TRX
            </span>
          </div>
        </label>
      ) : null}
      {showKursFields ? (
        <>
          <label className="text-sm">
            <span className="inline-flex items-center gap-1.5">
              KURS
              <FieldHintTooltip
                label="KURS rate help"
                content="Optional. Companion amount = amount × (1 − rate)."
              />
            </span>
            <input
              className="field mt-1 text-right"
              inputMode="decimal"
              placeholder="0.999423"
              value={value.kurs_rate}
              onChange={(event) => patch({ kurs_rate: formatRateInput(event.target.value) })}
              aria-label="KURS rate"
            />
          </label>
          <label className="text-sm">
            <span className="inline-flex items-center gap-1.5">
              KURS amount
              <FieldHintTooltip
                label="KURS amount help"
                content="Editable. Recalculates when amount or KURS rate changes. Creates a grouped USDT spending entry typed KURS."
              />
            </span>
            <div className="mt-1 flex overflow-hidden rounded-md border border-[rgb(var(--border))] focus-within:shadow-[0_0_0_3px_rgba(var(--focus),0.25)]">
              <input
                className="min-w-0 flex-1 border-0 bg-[rgb(var(--surface))] px-3 py-2 text-right text-base font-medium text-[rgb(var(--text))] focus:outline-none"
                inputMode="decimal"
                placeholder="0"
                value={value.kurs_amount}
                onChange={(event) => patch({ kurs_amount: formatAmountInput(event.target.value) })}
                aria-label="KURS USDT amount"
              />
              <span
                className="shrink-0 border-0 border-l border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] px-2 py-2 text-sm font-medium text-[rgb(var(--text))]"
                aria-hidden
              >
                USDT
              </span>
            </div>
          </label>
        </>
      ) : null}
      <label className={`text-sm ${spanClass}`}>
        Explanation *
        <input
          className="field mt-1"
          value={value.explanation}
          onChange={(event) => patch({ explanation: event.target.value })}
          placeholder={explanationPlaceholder}
          data-autofocus
        />
      </label>
    </>
  );

  const classificationFields = (
    <>
      <label className="text-sm">
        Type *
        <select
          className="field mt-1"
          value={value.entry_type_id}
          onChange={(event) => applyTypeChange(event.target.value)}
        >
          {activeTypes.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="inline-flex items-center gap-1.5">
          Vendor Type
          <FieldHintTooltip
            label="Vendor Type mapping help"
            content={
              mappedVendorType
                ? value.vendor_type_id === mappedVendorType.id
                  ? `Auto-filled from Type mapping: ${mappedVendorType.name}`
                  : `Type mapping suggests ${mappedVendorType.name} (currently overridden).`
                : typeVendorTypeMaps.length
                  ? "No Vendor Type mapping for this Type."
                  : "Set Type → Vendor Type mappings in Big Book Settings to auto-fill."
            }
          />
        </span>
        <select
          className="field mt-1"
          value={value.vendor_type_id}
          onChange={(event) =>
            patch({
              vendor_type_id: event.target.value,
              vendor_id: ""
            })
          }
        >
          <option value="">(none)</option>
          {vendorTypesForSelect.map((vendorType) => (
            <option key={vendorType.id} value={vendorType.id}>
              {vendorType.name}
              {!vendorType.is_active ? " (Inactive)" : ""}
            </option>
          ))}
        </select>
      </label>
    </>
  );

  const settlementTypeFields = (
    <div
      className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${spanClass}`}
      role="radiogroup"
      aria-label="Settlement Type"
    >
      {(
        [
          {
            kind: "credit" as const,
            title: "Credit",
            hint: "Vendor owes our company"
          },
          {
            kind: "debt" as const,
            title: "Debt",
            hint: "Our company owes the vendor"
          }
        ] as const
      ).map((option) => {
        const selected = settlementKind === option.kind;
        return (
          <div
            key={option.kind}
            role="radio"
            aria-checked={selected}
            tabIndex={0}
            className={`cursor-pointer rounded-lg border px-4 py-3 text-left transition ${
              selected
                ? "border-[rgb(var(--primary))] bg-[rgb(var(--primary)/0.08)] shadow-[0_0_0_1px_rgb(var(--primary)/0.35)]"
                : "border-[rgb(var(--border))] bg-[rgb(var(--surface))] hover:border-[rgb(var(--primary)/0.45)] hover:bg-[rgb(var(--surface-muted))]"
            }`}
            onClick={() => applySettlementKind(selected ? "none" : option.kind)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                applySettlementKind(selected ? "none" : option.kind);
              }
            }}
          >
            <span className="flex items-start gap-3">
              <span
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                  selected
                    ? "border-[rgb(var(--primary))] bg-[rgb(var(--primary))]"
                    : "border-[rgb(var(--border))] bg-[rgb(var(--surface))]"
                }`}
                aria-hidden
              >
                {selected ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="text-sm font-semibold text-[rgb(var(--text))]">{option.title}</span>
                <FieldHintTooltip label={`${option.title} help`} content={option.hint} />
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );

  const attributionFields = (
    <>
      <label className="text-sm">
        Responsible Actor *
        <select
          className="field mt-1"
          value={value.responsible_actor_id}
          onChange={(event) =>
            patch({
              responsible_actor_id: event.target.value,
              pocket_id: ""
            })
          }
        >
          {sortedActors.map((actor) => (
            <option key={actor.id} value={actor.id}>
              {actor.display_name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        Action By
        <select
          className="field mt-1"
          value={value.action_by_id}
          onChange={(event) => patch({ action_by_id: event.target.value })}
        >
          <option value="">(none)</option>
          {activeActionBy.map((actionBy) => (
            <option key={actionBy.id} value={actionBy.id}>
              {actionBy.name}
            </option>
          ))}
        </select>
      </label>
    </>
  );

  const moreDetailsFields = (
    <>
      <label className={`text-sm ${spanClass}`}>
        Remark
        <input
          className="field mt-1"
          value={value.remark}
          onChange={(event) => patch({ remark: event.target.value })}
        />
      </label>
      {showAttachments ? (
        <label className={`text-sm ${spanClass}`}>
          Attachments
          <input
            className="field mt-1"
            type="file"
            accept="image/*"
            multiple
            onChange={(event) => onAttachmentFilesChange?.(Array.from(event.target.files ?? []))}
          />
          {attachmentFiles.length > 0 ? (
            <ul className="mt-2 space-y-1 rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] p-2 text-xs text-[rgb(var(--text))]">
              {attachmentFiles.map((file, index) => (
                <li key={`${file.name}-${file.size}-${index}`} className="flex items-center justify-between gap-2">
                  <span className="truncate">
                    {file.name} ({(file.size / 1024).toFixed(1)} KB)
                  </span>
                  <button
                    type="button"
                    className="text-[rgb(var(--danger))] underline"
                    onClick={() => onRemoveAttachmentAt?.(index)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </label>
      ) : null}
    </>
  );

  return (
    <div className={isNested ? "space-y-4" : "space-y-6"}>
      {settlesEntry ? (
        <div className="rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] p-3 text-sm">
          <p className="font-medium">
            {settlesEntry.is_debt ? "Paying debt" : "Settling credit"}
          </p>
          <p className="mt-1 text-muted">
            {settlesEntry.entry_date} · {settlesEntry.explanation}
            {settlesEntry.vendor_name ? ` · ${settlesEntry.vendor_name}` : ""}
          </p>
          <p className="mt-1">
            {settlesEntry.is_debt ? "Debt" : "Credit"} amount:{" "}
            <span className="font-medium">
              {formatAmount(settlesEntry.amount, {
                minimumFractionDigits: 0,
                maximumFractionDigits: 4
              })}{" "}
              {settlesEntry.currency_code}
            </span>
            {" · "}
            Status:{" "}
            <span className="font-medium capitalize">
              {settlesEntry.is_debt
                ? settlesEntry.debt_status ?? "open"
                : settlesEntry.credit_status ?? "open"}
            </span>
          </p>
        </div>
      ) : null}

      {isNested ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {moneyFields}
          {classificationFields}
          {showSettlementType ? settlementTypeFields : null}
          {attributionFields}
          {moreDetailsFields}
        </div>
      ) : (
        <>
          <FormSection step="01" title="Money & timing" columns={columns}>
            {moneyFields}
          </FormSection>
          <FormSection step="02" title="Classification" columns={columns}>
            {classificationFields}
          </FormSection>
          {showSettlementType ? (
            <FormSection step="03" title="Settlement Type" columns={columns}>
              {settlementTypeFields}
            </FormSection>
          ) : null}
          <FormSection
            step={showSettlementType ? "04" : "03"}
            title="Attribution"
            columns={columns}
          >
            {attributionFields}
          </FormSection>
          <FormSection
            step={showSettlementType ? "05" : "04"}
            title="More details"
            columns={columns}
            collapsible
            defaultOpen={moreDetailsFilled}
            summary={moreDetailsSummary}
          >
            {moreDetailsFields}
          </FormSection>
        </>
      )}

      {isSettlementMode ? (
        <div className="space-y-3">
          <label className="block text-sm">
            Settlement Note
            <input
              className="field mt-1"
              value={value.settlement_note}
              onChange={(event) => patch({ settlement_note: event.target.value })}
              placeholder="Optional note about this settlement payment"
            />
          </label>
          {settlesEntry?.is_debt ? (
            <>
              <label className="flex items-start gap-2 text-sm">
                <input
                  className="mt-1"
                  type="checkbox"
                  checked={value.close_debt}
                  onChange={(event) =>
                    patch({
                      close_debt: event.target.checked,
                      debt_settlement_note: event.target.checked
                        ? value.debt_settlement_note
                        : ""
                    })
                  }
                />
                <span className="inline-flex items-center gap-1.5 font-medium">
                  Mark this debt as settled
                  <FieldHintTooltip
                    label="Mark debt settled help"
                    content="Closing is an admin decision — payment amount does not need to match the debt."
                  />
                </span>
              </label>
              {value.close_debt ? (
                <label className="block text-sm">
                  Closure Note
                  <input
                    className="field mt-1"
                    value={value.debt_settlement_note}
                    onChange={(event) => patch({ debt_settlement_note: event.target.value })}
                    placeholder="Why is this debt being closed?"
                  />
                </label>
              ) : null}
            </>
          ) : (
            <>
              <label className="flex items-start gap-2 text-sm">
                <input
                  className="mt-1"
                  type="checkbox"
                  checked={value.close_credit}
                  onChange={(event) =>
                    patch({
                      close_credit: event.target.checked,
                      credit_settlement_note: event.target.checked
                        ? value.credit_settlement_note
                        : ""
                    })
                  }
                />
                <span className="inline-flex items-center gap-1.5 font-medium">
                  Mark this credit as settled
                  <FieldHintTooltip
                    label="Mark credit settled help"
                    content="Closing is an admin decision — payment amount does not need to match the credit."
                  />
                </span>
              </label>
              {value.close_credit ? (
                <label className="block text-sm">
                  Closure Note
                  <input
                    className="field mt-1"
                    value={value.credit_settlement_note}
                    onChange={(event) => patch({ credit_settlement_note: event.target.value })}
                    placeholder="Why is this credit being closed? (e.g. short/over payment approved)"
                  />
                </label>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
