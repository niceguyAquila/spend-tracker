"use client";

import type {
  BigBookActionBy,
  BigBookActor,
  BigBookActorPocket,
  BigBookLedgerSubType,
  BigBookLedgerType,
  BigBookSettlementTargetRef,
  BigBookVendor,
  BigBookVendorType
} from "@/lib/types";
import { formatAmount } from "@/lib/display-format";
import { FormSection } from "@/components/ui/form-section";

export type EntryFormState = {
  entry_date: string;
  entry_direction: "spending" | "profit";
  entry_type_id: string;
  entry_sub_type_id: string;
  vendor_type_id: string;
  vendor_id: string;
  pocket_id: string;
  action_by_id: string;
  explanation: string;
  amount: string;
  currency_code: "IDR" | "MYR" | "USDT" | "TRX";
  gas_fee_amount: string;
  remark: string;
  responsible_actor_id: string;
  is_credit: boolean;
  settles_entry_id: string;
  settlement_conversion_rate: string;
  settlement_note: string;
  close_credit: boolean;
  credit_settlement_note: string;
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
}): EntryFormState {
  return {
    entry_date: options.today,
    entry_direction: "spending",
    entry_type_id: options.defaultTypeId,
    entry_sub_type_id: "",
    vendor_type_id: "",
    vendor_id: "",
    pocket_id: "",
    action_by_id: "",
    explanation: "",
    amount: "",
    currency_code: "IDR",
    gas_fee_amount: "",
    remark: "",
    responsible_actor_id: options.defaultActorId,
    is_credit: false,
    settles_entry_id: "",
    settlement_conversion_rate: "",
    settlement_note: "",
    close_credit: false,
    credit_settlement_note: ""
  };
}

type Props = {
  value: EntryFormState;
  onChange: (next: EntryFormState) => void;
  types: BigBookLedgerType[];
  subTypes: BigBookLedgerSubType[];
  vendorTypes: BigBookVendorType[];
  vendors: BigBookVendor[];
  actionByOptions: BigBookActionBy[];
  pockets: BigBookActorPocket[];
  actors: BigBookActor[];
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
  /** Create-only: show an optional TRX gas-fee amount when currency is USDT. */
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
  subTypes,
  vendorTypes,
  vendors,
  actionByOptions,
  pockets,
  actors,
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
  const activeTypes = types.filter((row) => row.is_active);
  const subTypesForForm = subTypes.filter(
    (row) => row.is_active && row.entry_type_id === value.entry_type_id
  );
  const activeVendorTypes = vendorTypes.filter((row) => row.is_active);
  const vendorsForForm = vendors.filter(
    (row) => row.is_active && row.vendor_type_id === value.vendor_type_id
  );
  const activeActionBy = actionByOptions.filter((row) => row.is_active);
  const pocketsForForm = pockets.filter(
    (row) =>
      row.is_active &&
      row.actor_id === value.responsible_actor_id &&
      row.currency_code === value.currency_code
  );
  const pocketDisabled = value.currency_code !== "IDR" || !pocketsForForm.length;
  const pocketHint =
    value.currency_code !== "IDR"
      ? "Pockets are IDR-only"
      : !pocketsForForm.length
        ? "No pockets for this actor yet"
        : null;
  const isSettlementMode = Boolean(settlesEntry || value.settles_entry_id);
  const settlementCurrencyDiffers =
    isSettlementMode &&
    settlesEntry != null &&
    value.currency_code !== settlesEntry.currency_code;

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
          value={value.entry_direction}
          onChange={(event) =>
            patch({
              entry_direction: event.target.value as "spending" | "profit"
            })
          }
        >
          <option value="spending">Out</option>
          <option value="profit">In</option>
        </select>
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
              patch({
                currency_code: nextCurrency,
                pocket_id: "",
                gas_fee_amount: nextCurrency === "USDT" ? value.gas_fee_amount : "",
                settlement_conversion_rate:
                  settlesEntry && nextCurrency === settlesEntry.currency_code
                    ? "1"
                    : value.settlement_conversion_rate
              });
            }}
            aria-label="Currency"
          >
            {currencies.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </select>
        </div>
      </label>
      {showGasFee && value.currency_code === "USDT" ? (
        <label className="text-sm">
          Gas fee
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
          <span className="mt-1 block text-xs text-muted">Optional. Creates a grouped TRX spending entry.</span>
        </label>
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
          onChange={(event) =>
            patch({
              entry_type_id: event.target.value,
              entry_sub_type_id: ""
            })
          }
        >
          {activeTypes.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        Sub-Type
        <select
          className="field mt-1"
          value={value.entry_sub_type_id}
          onChange={(event) => patch({ entry_sub_type_id: event.target.value })}
          disabled={!subTypesForForm.length}
        >
          <option value="">(none)</option>
          {subTypesForForm.map((subType) => (
            <option key={subType.id} value={subType.id}>
              {subType.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        Vendor Type
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
          {activeVendorTypes.map((vendorType) => (
            <option key={vendorType.id} value={vendorType.id}>
              {vendorType.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        Vendor Name
        <select
          className="field mt-1"
          value={value.vendor_id}
          onChange={(event) => patch({ vendor_id: event.target.value })}
          disabled={!value.vendor_type_id || !vendorsForForm.length}
        >
          <option value="">(none)</option>
          {vendorsForForm.map((vendor) => (
            <option key={vendor.id} value={vendor.id}>
              {vendor.name}
            </option>
          ))}
        </select>
      </label>
    </>
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
          {actors.map((actor) => (
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
      <label className="text-sm">
        Pocket
        <select
          className="field mt-1"
          value={value.pocket_id}
          onChange={(event) => patch({ pocket_id: event.target.value })}
          disabled={pocketDisabled}
        >
          <option value="">(none)</option>
          {pocketsForForm.map((pocket) => (
            <option key={pocket.id} value={pocket.id}>
              {pocket.name}
            </option>
          ))}
        </select>
        {pocketHint ? <span className="mt-1 block text-xs text-muted">{pocketHint}</span> : null}
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
    <div className="space-y-5">
      {settlesEntry ? (
        <div className="rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] p-3 text-sm">
          <p className="font-medium">Settling credit</p>
          <p className="mt-1 text-muted">
            {settlesEntry.entry_date} · {settlesEntry.explanation}
            {settlesEntry.vendor_name ? ` · ${settlesEntry.vendor_name}` : ""}
          </p>
          <p className="mt-1">
            Credit amount:{" "}
            <span className="font-medium">
              {formatAmount(settlesEntry.amount, {
                minimumFractionDigits: 0,
                maximumFractionDigits: 4
              })}{" "}
              {settlesEntry.currency_code}
            </span>
            {" · "}
            Status:{" "}
            <span className="font-medium capitalize">{settlesEntry.credit_status}</span>
          </p>
        </div>
      ) : null}

      {isNested ? (
        <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2`}>
          {moneyFields}
          {classificationFields}
          {attributionFields}
          {moreDetailsFields}
        </div>
      ) : (
        <>
          <FormSection title="Money & timing" columns={columns}>
            {moneyFields}
          </FormSection>
          <FormSection title="Classification" columns={columns}>
            {classificationFields}
          </FormSection>
          <FormSection title="Attribution" columns={columns}>
            {attributionFields}
          </FormSection>
          <FormSection
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

      {!hideCreditToggle && !isSettlementMode ? (
        <label className="flex items-start gap-2 text-sm">
          <input
            className="mt-1"
            type="checkbox"
            checked={value.is_credit}
            onChange={(event) =>
              patch({
                is_credit: event.target.checked,
                settles_entry_id: "",
                settlement_conversion_rate: "",
                settlement_note: "",
                close_credit: false,
                credit_settlement_note: ""
              })
            }
          />
          <span>
            <span className="font-medium">Mark as Credit</span>
            <span className="mt-0.5 block text-xs text-muted">
              Vendor owes our company this amount. You can record settlement payments later.
            </span>
          </span>
        </label>
      ) : null}

      {isSettlementMode ? (
        <div className="space-y-3">
          {settlementCurrencyDiffers ? (
            <label className="block text-sm">
              Conversion Rate * ({value.currency_code} → {settlesEntry?.currency_code})
              <div className="mt-1 flex gap-2">
                <input
                  className="field flex-1"
                  inputMode="decimal"
                  placeholder="0"
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
              <span className="mt-1 block text-xs text-muted">
                Multiply settlement amount by this rate to get the credit-currency equivalent.
              </span>
            </label>
          ) : null}
          <label className="block text-sm">
            Settlement Note
            <input
              className="field mt-1"
              value={value.settlement_note}
              onChange={(event) => patch({ settlement_note: event.target.value })}
              placeholder="Optional note about this settlement payment"
            />
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              className="mt-1"
              type="checkbox"
              checked={value.close_credit}
              onChange={(event) =>
                patch({
                  close_credit: event.target.checked,
                  credit_settlement_note: event.target.checked ? value.credit_settlement_note : ""
                })
              }
            />
            <span>
              <span className="font-medium">Mark this credit as settled</span>
              <span className="mt-0.5 block text-xs text-muted">
                Closing is an admin decision — payment amount does not need to match the credit.
              </span>
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
        </div>
      ) : null}
    </div>
  );
}
