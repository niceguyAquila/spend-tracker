"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { CreditBookEntry } from "@/lib/types";
import { handleUnauthorizedResponse, secureFetch } from "@/lib/client/auth-fetch";
import { formatAmount, formatDateDisplay, getAmountColorClass } from "@/lib/display-format";

type Props = {
  entry: CreditBookEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (info: {
    entry: CreditBookEntry;
    amount: number;
    settlementId: string;
  }) => void;
};

const amountFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 4
});

function parseAmountInput(value: string) {
  return value.replace(/,/g, "");
}

function formatAmountInput(value: string) {
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

function extractApiErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "string" && error.trim().length > 0) return error;
  if (error && typeof error === "object") {
    const maybe = error as { formErrors?: unknown; fieldErrors?: Record<string, unknown> };
    if (Array.isArray(maybe.formErrors)) {
      const formError = maybe.formErrors.find(
        (item) => typeof item === "string" && item.trim().length > 0
      );
      if (typeof formError === "string") return formError;
    }
    if (maybe.fieldErrors && typeof maybe.fieldErrors === "object") {
      for (const value of Object.values(maybe.fieldErrors)) {
        if (Array.isArray(value)) {
          const found = value.find(
            (item) => typeof item === "string" && item.trim().length > 0
          );
          if (typeof found === "string") return found;
        }
      }
    }
  }
  return fallback;
}

export function CreditBigBookSettlementModal({ entry, open, onOpenChange, onSuccess }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const isCredit = entry?.entry_direction === "credit";
  const directionLabel = isCredit ? "credit" : "debt";
  const titleVerb = isCredit ? "Settle Credit" : "Settle Debt";

  const outstandingFormatted = useMemo(() => {
    if (!entry) return "";
    return formatAmountInput(String(entry.outstanding));
  }, [entry]);

  const [settlementDate, setSettlementDate] = useState(today);
  const [amount, setAmount] = useState(outstandingFormatted);
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (open && entry) {
      setSettlementDate(today);
      setAmount(formatAmountInput(String(entry.outstanding)));
      setNote("");
      setFiles([]);
      setError(null);
    }
  }, [open, entry, today]);

  if (!entry) return null;

  const amountValue = Number(parseAmountInput(amount));
  const isAmountValid =
    Number.isFinite(amountValue) && amountValue > 0 && amountValue <= entry.outstanding + 0.0001;
  const canSubmit = !submitting && isAmountValid && Boolean(settlementDate);

  function setSettleInFull() {
    setAmount(formatAmountInput(String(entry?.outstanding ?? 0)));
  }

  function removeFileAt(index: number) {
    setFiles((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  }

  async function submitSettlement() {
    if (!entry) return;
    if (!isAmountValid) {
      setError(
        `Settlement amount must be greater than 0 and at most outstanding (${formatAmount(
          entry.outstanding,
          { minimumFractionDigits: 2, maximumFractionDigits: 4 }
        )}).`
      );
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await secureFetch("/api/credit-big-book/settlements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entry_id: entry.id,
          settlement_date: settlementDate,
          amount: amountValue,
          note: note.trim() ? note.trim() : ""
        })
      });
      if (handleUnauthorizedResponse(response)) return;
      const data = await response.json();
      if (!response.ok) {
        setError(extractApiErrorMessage(data?.error, "Failed to record settlement."));
        return;
      }
      const settlementId = data.id as string;

      if (files.length > 0) {
        for (const file of files) {
          const formData = new FormData();
          formData.append("settlement_id", settlementId);
          formData.append("file", file);
          const uploadResponse = await secureFetch("/api/credit-big-book/settlements/attachments", {
            method: "POST",
            body: formData
          });
          if (handleUnauthorizedResponse(uploadResponse)) return;
          const uploadData = await uploadResponse.json();
          if (!uploadResponse.ok) {
            setError(
              extractApiErrorMessage(
                uploadData?.error,
                `Settlement saved, but failed to upload ${file.name}.`
              )
            );
            onSuccess({ entry, amount: amountValue, settlementId });
            setConfirmOpen(false);
            onOpenChange(false);
            return;
          }
        }
      }

      onSuccess({ entry, amount: amountValue, settlementId });
      setConfirmOpen(false);
      onOpenChange(false);
    } catch {
      setError("Failed to record settlement due to a network error.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Modal
        open={open}
        onOpenChange={(next) => {
          if (!submitting) onOpenChange(next);
        }}
        title={titleVerb}
        dismissible={!submitting}
        closeOnBackdrop={!submitting}
        footer={
          <>
            <button
              className="btn-secondary"
              disabled={submitting}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </button>
            <button
              className="btn"
              disabled={!canSubmit}
              onClick={() => setConfirmOpen(true)}
            >
              {submitting ? "Saving..." : "Record Settlement"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] p-3 text-[rgb(var(--text))]">
            <p className="text-xs uppercase text-[rgb(var(--text-muted))]">
              Original {directionLabel} record
            </p>
            <p className="mt-1 text-sm text-[rgb(var(--text))]">
              <span className="font-medium">{formatDateDisplay(entry.entry_date)}</span> ·{" "}
              {entry.type_name} · {entry.actor_display_name}
            </p>
            <p className="mt-1 text-sm text-[rgb(var(--text))]">{entry.explanation}</p>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
              <div>
                <p className="text-[rgb(var(--text-muted))]">Original Amount</p>
                <p
                  className={`font-medium ${getAmountColorClass(
                    entry.entry_direction === "debt" ? -entry.amount : entry.amount
                  )}`}
                >
                  {entry.currency_code}{" "}
                  {formatAmount(entry.amount, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 4
                  })}
                </p>
              </div>
              <div>
                <p className="text-[rgb(var(--text-muted))]">Already Settled</p>
                <p className="font-medium text-[rgb(var(--text))]">
                  {entry.currency_code}{" "}
                  {formatAmount(entry.total_settled, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 4
                  })}
                </p>
              </div>
              <div>
                <p className="text-[rgb(var(--text-muted))]">Outstanding</p>
                <p
                  className={`font-medium ${getAmountColorClass(
                    entry.entry_direction === "debt" ? -entry.outstanding : entry.outstanding
                  )}`}
                >
                  {entry.currency_code}{" "}
                  {formatAmount(entry.outstanding, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 4
                  })}
                </p>
              </div>
            </div>
          </div>

          <label className="block text-sm text-[rgb(var(--text))]">
            Settlement Date *
            <input
              className="field mt-1 w-full"
              type="date"
              value={settlementDate}
              onChange={(event) => setSettlementDate(event.target.value)}
            />
          </label>

          <label className="block text-sm text-[rgb(var(--text))]">
            <div className="flex items-center justify-between">
              <span>Settlement Amount *</span>
              <button
                type="button"
                className="text-xs text-blue-600 underline"
                onClick={setSettleInFull}
              >
                Settle in full
              </button>
            </div>
            <input
              className="field mt-1 w-full"
              inputMode="decimal"
              placeholder="0"
              value={amount}
              onChange={(event) => setAmount(formatAmountInput(event.target.value))}
            />
            <p className="mt-1 text-xs text-[rgb(var(--text-muted))]">
              Up to {entry.currency_code}{" "}
              {formatAmount(entry.outstanding, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 4
              })}{" "}
              outstanding.
            </p>
          </label>

          <label className="block text-sm text-[rgb(var(--text))]">
            Note
            <textarea
              className="field mt-1 w-full"
              rows={2}
              placeholder={`Optional note about this ${directionLabel} settlement...`}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>

          <label className="block text-sm text-[rgb(var(--text))]">
            Proof / Attachments
            <input
              className="field mt-1 w-full"
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
            />
            {files.length ? (
              <ul className="mt-2 space-y-1 rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] p-2 text-xs text-[rgb(var(--text))]">
                {files.map((file, index) => (
                  <li
                    key={`${file.name}-${file.size}-${index}`}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="truncate">
                      {file.name} ({(file.size / 1024).toFixed(1)} KB)
                    </span>
                    <button
                      type="button"
                      className="text-rose-600 underline"
                      onClick={() => removeFileAt(index)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </label>

          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Record ${directionLabel} settlement?`}
        description={`This will record a ${entry.currency_code} ${formatAmount(amountValue, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 4
        })} settlement against the selected ${directionLabel} record.`}
        confirmLabel="Record Settlement"
        confirming={submitting}
        closeOnBackdrop={false}
        onConfirm={submitSettlement}
      />
    </>
  );
}
