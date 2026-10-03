"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/modal";
import {
  computeSettlementAmountFromCredit,
  computeSettlementAmountInCreditCurrency,
  computeUsdtSettleAmountWithProfit
} from "@/lib/big-book/credit";
import { calculateKursAmount } from "@/lib/big-book/kurs-usdt-entry";
import { formatAmount } from "@/lib/display-format";
import {
  formatAmountInput,
  formatRateInput,
  parseAmountInput
} from "@/components/big-book-entry-fields";
import { sortByDisplayLabel } from "@/lib/ui/sort-by-display-label";

export type BulkSettleMode = "single" | "per_credit";
export type BulkSettleCurrency = "IDR" | "MYR" | "USDT" | "TRX";

export type BulkSettleCreditDraft = {
  id: string;
  amount: number;
  currency_code: BulkSettleCurrency;
  explanation: string;
  entry_date: string;
};

export type BulkSettleEditDraft = {
  mode: BulkSettleMode;
  credits: BulkSettleCreditDraft[];
  label: string;
};

export type BulkSettleSubmitPayload = {
  entry_date: string;
  currency_code: BulkSettleCurrency;
  amount: number;
  /** Omitted when USDT settle has no optional FX rate. */
  settlement_conversion_rate?: number;
  settlement_note: string;
  close_credits: boolean;
  explanation: string;
  /** Optional PROFIT surcharge in credit currency. */
  profit_amount?: number;
  /** Optional KURS rate (USDT settle only). */
  kurs_rate?: number;
  /** Optional KURS amount override (USDT settle only). */
  kurs_amount?: number;
};

type Props = {
  draft: BulkSettleEditDraft | null;
  open: boolean;
  submitting: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: BulkSettleSubmitPayload) => void;
};

const CURRENCY_OPTIONS: BulkSettleCurrency[] = sortByDisplayLabel(
  ["IDR", "MYR", "USDT", "TRX"] as BulkSettleCurrency[],
  (currency) => currency
);

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Bulk settle always opens this edit dialog (even for “one settlement for all”)
 * so admins can change currency / USDT rate / PROFIT / KURS before commit.
 */
export function BigBookBulkSettleEditModal({
  draft,
  open,
  submitting,
  error,
  onOpenChange,
  onSubmit
}: Props) {
  const creditCurrency = draft?.credits[0]?.currency_code ?? "IDR";
  const creditTotal = useMemo(
    () => (draft?.credits ?? []).reduce((sum, row) => sum + Math.abs(row.amount), 0),
    [draft]
  );
  const mixedCreditCurrency = useMemo(() => {
    if (!draft?.credits.length) return false;
    return new Set(draft.credits.map((row) => row.currency_code)).size > 1;
  }, [draft]);

  const [entryDate, setEntryDate] = useState(todayIsoDate);
  const [currencyCode, setCurrencyCode] = useState<BulkSettleCurrency>(creditCurrency);
  const [amount, setAmount] = useState("");
  const [conversionRate, setConversionRate] = useState("");
  const [includeProfit, setIncludeProfit] = useState(false);
  const [profitAmount, setProfitAmount] = useState("");
  const [kursRate, setKursRate] = useState("");
  const [kursAmount, setKursAmount] = useState("");
  const [note, setNote] = useState("");
  const [closeCredits, setCloseCredits] = useState(true);
  const [explanation, setExplanation] = useState("");

  useEffect(() => {
    if (!open || !draft) return;
    const primaryCurrency = draft.credits[0]?.currency_code ?? "IDR";
    const total = draft.credits.reduce((sum, row) => sum + Math.abs(row.amount), 0);
    setEntryDate(todayIsoDate());
    setCurrencyCode(primaryCurrency);
    setAmount(formatAmountInput(String(total)));
    setConversionRate(primaryCurrency === "USDT" ? "1" : "");
    setIncludeProfit(false);
    setProfitAmount("");
    setKursRate("");
    setKursAmount("");
    setNote("");
    setCloseCredits(true);
    setExplanation(
      draft.mode === "single" && draft.credits.length > 1
        ? `Bulk settlement for ${draft.credits.length} open credits`
        : draft.credits.length === 1
          ? `Settlement for: ${draft.credits[0].explanation}`
          : ""
    );
  }, [open, draft]);

  const sameCurrency = currencyCode === creditCurrency && !mixedCreditCurrency;
  const showConversionRate = !sameCurrency && !mixedCreditCurrency;
  const showUsdtKurs = currencyCode === "USDT" && !mixedCreditCurrency;
  const rateValue = sameCurrency ? 1 : Number(conversionRate);
  const amountValue = Number(parseAmountInput(amount));
  const profitValue = Number(parseAmountInput(profitAmount));
  const hasPositiveProfit =
    includeProfit && Number.isFinite(profitValue) && profitValue > 0;
  const hasPositiveRate = Number.isFinite(rateValue) && rateValue > 0;
  const isAmountValid =
    draft?.mode === "per_credit"
      ? true
      : Number.isFinite(amountValue) && amountValue > 0;

  // Recalculate KURS amount from rate + settlement amount A (manual override sticks until A/r change).
  useEffect(() => {
    if (!showUsdtKurs) {
      if (kursRate || kursAmount) {
        setKursRate("");
        setKursAmount("");
      }
      return;
    }
    const rateRaw = kursRate.trim();
    if (!rateRaw) {
      if (kursAmount) setKursAmount("");
      return;
    }
    const rate = Number(parseAmountInput(rateRaw));
    if (!Number.isFinite(rate) || !Number.isFinite(amountValue) || amountValue <= 0) {
      if (kursAmount) setKursAmount("");
      return;
    }
    const next = calculateKursAmount(amountValue, rate);
    const nextAmount = next != null ? formatAmountInput(String(next)) : "";
    if (nextAmount !== kursAmount) {
      setKursAmount(nextAmount);
    }
    // Intentionally omit kursAmount from deps so manual edits stick until A or r changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showUsdtKurs, amountValue, kursRate]);

  if (!draft) return null;

  const blockedReason =
    draft.mode === "single" && mixedCreditCurrency
      ? "One settlement for all requires the same credit currency. Switch to one settlement per credit, or select a single-currency set."
      : hasPositiveProfit && mixedCreditCurrency
        ? "PROFIT requires a single credit currency so the surcharge matches the credits."
        : currencyCode === "USDT" && mixedCreditCurrency && hasPositiveRate
          ? "USDT conversion needs a single credit currency so one company rate applies. Clear the rate, settle same-currency credits together, or settle in each credit's own currency."
          : draft.mode === "single" && !isAmountValid
            ? "Enter a settlement amount greater than 0."
            : !entryDate
              ? "Choose a settlement date."
              : null;
  const canSubmit = !submitting && blockedReason == null;

  const equivalentCredit =
    showConversionRate && hasPositiveRate && Number.isFinite(amountValue) && amountValue > 0
      ? computeSettlementAmountInCreditCurrency(amountValue, rateValue)
      : null;

  function syncSettlementAmountFromRateAndProfit(
    nextRateRaw: string,
    nextProfitRaw: string,
    settleCurrency: BulkSettleCurrency,
    profitIncluded: boolean
  ) {
    if (draft?.mode !== "single" || mixedCreditCurrency) return;
    const rate = Number(nextRateRaw);
    const profit = Number(parseAmountInput(nextProfitRaw));
    const profitSafe =
      profitIncluded && Number.isFinite(profit) && profit > 0 ? profit : 0;

    if (settleCurrency === creditCurrency) {
      setAmount(formatAmountInput(String(creditTotal)));
      return;
    }
    if (!(rate > 0)) return;

    if (settleCurrency === "USDT") {
      setAmount(
        formatAmountInput(
          String(computeUsdtSettleAmountWithProfit(creditTotal, profitSafe, rate))
        )
      );
      return;
    }
    setAmount(formatAmountInput(String(computeSettlementAmountFromCredit(creditTotal, rate))));
  }

  function applyConversionRate(nextRateRaw: string) {
    setConversionRate(nextRateRaw);
    syncSettlementAmountFromRateAndProfit(
      nextRateRaw,
      profitAmount,
      currencyCode,
      includeProfit
    );
  }

  function applyProfitAmount(nextProfitRaw: string) {
    setProfitAmount(nextProfitRaw);
    if (currencyCode === "USDT" && !sameCurrency) {
      syncSettlementAmountFromRateAndProfit(
        conversionRate,
        nextProfitRaw,
        currencyCode,
        true
      );
    }
  }

  function applyIncludeProfit(next: boolean) {
    setIncludeProfit(next);
    if (!next) {
      setProfitAmount("");
      if (currencyCode === "USDT" && !sameCurrency) {
        syncSettlementAmountFromRateAndProfit(conversionRate, "", currencyCode, false);
      }
      return;
    }
    if (currencyCode === "USDT" && !sameCurrency) {
      syncSettlementAmountFromRateAndProfit(
        conversionRate,
        profitAmount,
        currencyCode,
        true
      );
    }
  }

  function handleCurrencyChange(next: BulkSettleCurrency) {
    setCurrencyCode(next);
    if (next === creditCurrency && !mixedCreditCurrency) {
      setConversionRate("1");
      if (draft?.mode === "single") {
        setAmount(formatAmountInput(String(creditTotal)));
      }
      return;
    }
    // Cross-currency always needs an explicit rate (cleared until entered).
    setConversionRate("");
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (submitting) return;
        onOpenChange(next);
      }}
      title={
        draft.mode === "single"
          ? "Edit bulk settlement"
          : "Edit per-credit settlements"
      }
      size="lg"
      dismissible={!submitting}
      closeOnBackdrop={!submitting}
      footer={
        <>
          <button
            type="button"
            className="btn-secondary"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            disabled={!canSubmit}
            onClick={() => {
              if (!canSubmit) return;
              const resolvedAmount =
                draft.mode === "per_credit"
                  ? // API ignores amount in per_credit mode; send a placeholder > 0.
                    1
                  : amountValue;
              const profitParsed = Number(parseAmountInput(profitAmount));
              const kursRateParsed = Number(parseAmountInput(kursRate));
              const kursAmountParsed = Number(parseAmountInput(kursAmount));
              onSubmit({
                entry_date: entryDate,
                currency_code: currencyCode,
                amount: resolvedAmount,
                ...(sameCurrency
                  ? { settlement_conversion_rate: 1 }
                  : hasPositiveRate
                    ? { settlement_conversion_rate: rateValue }
                    : {}),
                settlement_note: note.trim(),
                close_credits: closeCredits,
                explanation: explanation.trim(),
                ...(includeProfit &&
                Number.isFinite(profitParsed) &&
                profitParsed > 0
                  ? { profit_amount: profitParsed }
                  : {}),
                ...(showUsdtKurs && Number.isFinite(kursRateParsed)
                  ? { kurs_rate: kursRateParsed }
                  : {}),
                ...(showUsdtKurs &&
                Number.isFinite(kursAmountParsed) &&
                kursAmountParsed > 0
                  ? { kurs_amount: kursAmountParsed }
                  : {})
              });
            }}
          >
            {submitting
              ? "Saving..."
              : draft.mode === "single"
                ? "Record settlement"
                : `Record ${draft.credits.length} settlements`}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <div className="rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] p-3">
          <p>
            Settling <span className="font-medium">{draft.credits.length}</span> open credit
            {draft.credits.length === 1 ? "" : "s"} for{" "}
            <span className="font-medium">{draft.label}</span>
            {draft.mode === "single" ? " as one settlement" : " (one settlement per credit)"}.
          </p>
          <p className="mt-1 text-xs text-muted">
            Base (credit total):{" "}
            {formatAmount(creditTotal, {
              minimumFractionDigits: 0,
              maximumFractionDigits: 4
            })}{" "}
            {mixedCreditCurrency ? "(mixed currencies)" : creditCurrency}
          </p>
          {draft.credits.length <= 8 ? (
            <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-xs text-muted">
              {draft.credits.map((credit) => (
                <li key={credit.id} className="truncate">
                  {credit.entry_date} · {credit.explanation} ·{" "}
                  {formatAmount(credit.amount, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 4
                  })}{" "}
                  {credit.currency_code}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {draft.mode === "single" && mixedCreditCurrency ? (
          <p className="text-[rgb(var(--danger))]">
            One settlement for all requires the same credit currency. Switch to one settlement per
            credit, or select a single-currency set.
          </p>
        ) : null}

        {currencyCode === "USDT" && mixedCreditCurrency ? (
          <p className="text-[rgb(var(--danger))]">
            USDT conversion needs a single credit currency so one company rate applies. Settle
            same-currency credits together, or settle in each credit&apos;s own currency.
          </p>
        ) : null}

        <label className="block text-sm">
          Settlement Date *
          <input
            className="field mt-1 w-full"
            type="date"
            value={entryDate}
            onChange={(event) => setEntryDate(event.target.value)}
          />
        </label>

        <label className="block text-sm">
          Settlement Currency *
          <select
            className="field mt-1 w-full"
            value={currencyCode}
            onChange={(event) =>
              handleCurrencyChange(event.target.value as BulkSettleCurrency)
            }
          >
            {CURRENCY_OPTIONS.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
                {currency === creditCurrency && !mixedCreditCurrency
                  ? " (credit currency)"
                  : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-start gap-2 text-sm">
          <input
            className="mt-1"
            type="checkbox"
            checked={includeProfit}
            onChange={(event) => applyIncludeProfit(event.target.checked)}
            disabled={mixedCreditCurrency}
          />
          <span>
            <span className="font-medium">Include PROFIT</span>
            <span className="mt-0.5 block text-xs text-muted">
              Optional. Creates a separate PROFIT-type inflow in the credit currency
              {currencyCode === "USDT" && !sameCurrency
                ? ". When enabled with an amount > 0, USDT uses (base + profit) ÷ rate."
                : "."}
            </span>
          </span>
        </label>

        {includeProfit ? (
          <label className="block text-sm">
            PROFIT amount
            <div className="mt-1 flex overflow-hidden rounded-md border border-[rgb(var(--border))] focus-within:shadow-[0_0_0_3px_rgba(var(--focus),0.25)]">
              <input
                className="min-w-0 flex-1 border-0 bg-[rgb(var(--surface))] px-3 py-2 text-right text-base font-medium text-[rgb(var(--text))] focus:outline-none"
                inputMode="decimal"
                placeholder="0"
                value={profitAmount}
                onChange={(event) => applyProfitAmount(formatAmountInput(event.target.value))}
                aria-label="PROFIT amount"
                disabled={mixedCreditCurrency}
              />
              <span
                className="shrink-0 border-0 border-l border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] px-2 py-2 text-sm font-medium text-[rgb(var(--text))]"
                aria-hidden
              >
                {mixedCreditCurrency ? "—" : creditCurrency}
              </span>
            </div>
            <span className="mt-1 block text-xs text-muted">
              Enter amount in credit currency when including PROFIT
              {currencyCode === "USDT" && !sameCurrency
                ? ". Included in USDT amount as (base + profit) ÷ rate."
                : "."}
            </span>
          </label>
        ) : null}

        {draft.mode === "single" ? (
          <div className="space-y-3">
            <label className="block text-sm">
              Settlement Amount *
              <input
                className="field mt-1 w-full"
                inputMode="decimal"
                placeholder="0"
                value={amount}
                onChange={(event) => setAmount(formatAmountInput(event.target.value))}
              />
            </label>
            {showConversionRate ? (
              <label className="block text-sm">
                Conversion Rate (1 {currencyCode} = ? {creditCurrency})
                <input
                  className="field mt-1 w-full"
                  inputMode="decimal"
                  placeholder="Optional — today’s company rate"
                  value={conversionRate}
                  onChange={(event) => applyConversionRate(formatRateInput(event.target.value))}
                />
                <span className="mt-1 block text-xs text-muted">
                  Optional. When set,{" "}
                  {currencyCode === "USDT"
                    ? hasPositiveProfit
                      ? "amount in USDT = (base + profit) ÷ rate."
                      : "amount in USDT = base ÷ rate."
                    : `amount in ${currencyCode} = credit amount ÷ rate.`}
                  Credit-currency equivalent is not required to record the settlement.
                  {equivalentCredit != null
                    ? ` Equivalent: ${formatAmount(equivalentCredit, {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 4
                      })} ${creditCurrency}.`
                    : null}
                </span>
              </label>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted">
              Each credit gets its own settlement amount
              {showConversionRate && hasPositiveRate
                ? " (credit amount ÷ conversion rate)"
                : " (matching that credit’s outstanding)"}
              {hasPositiveProfit ? ". PROFIT is recorded once for the batch." : "."}
            </p>
            {showConversionRate ? (
              <label className="block text-sm">
                Conversion Rate (1 {currencyCode} = ? {creditCurrency})
                <input
                  className="field mt-1 w-full"
                  inputMode="decimal"
                  placeholder="Optional — today’s company rate"
                  value={conversionRate}
                  onChange={(event) => applyConversionRate(formatRateInput(event.target.value))}
                />
                <span className="mt-1 block text-xs text-muted">
                  Optional. When set, amount in {currencyCode} = credit amount ÷ rate for each
                  credit. Credit-currency equivalent is not required.
                </span>
              </label>
            ) : null}
          </div>
        )}

        {showUsdtKurs ? (
          <div className="space-y-3">
            <label className="block text-sm">
              KURS
              <input
                className="field mt-1 w-full text-right"
                inputMode="decimal"
                placeholder="0.999423"
                value={kursRate}
                onChange={(event) => setKursRate(formatRateInput(event.target.value))}
                aria-label="KURS rate"
              />
              <span className="mt-1 block text-xs text-muted">
                Optional. Companion amount = settlement amount × (1 − rate).
              </span>
            </label>
            <label className="block text-sm">
              KURS amount
              <div className="mt-1 flex overflow-hidden rounded-md border border-[rgb(var(--border))] focus-within:shadow-[0_0_0_3px_rgba(var(--focus),0.25)]">
                <input
                  className="min-w-0 flex-1 border-0 bg-[rgb(var(--surface))] px-3 py-2 text-right text-base font-medium text-[rgb(var(--text))] focus:outline-none"
                  inputMode="decimal"
                  placeholder="0"
                  value={kursAmount}
                  onChange={(event) => setKursAmount(formatAmountInput(event.target.value))}
                  aria-label="KURS USDT amount"
                />
                <span
                  className="shrink-0 border-0 border-l border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] px-2 py-2 text-sm font-medium text-[rgb(var(--text))]"
                  aria-hidden
                >
                  USDT
                </span>
              </div>
              <span className="mt-1 block text-xs text-muted">
                Editable. Recalculates when settlement amount or KURS rate changes. Creates a
                grouped USDT spending entry typed KURS.
              </span>
            </label>
          </div>
        ) : null}

        <label className="block text-sm">
          Explanation
          <input
            className="field mt-1 w-full"
            value={explanation}
            onChange={(event) => setExplanation(event.target.value)}
            placeholder="Optional override for settlement explanation"
          />
        </label>

        <label className="block text-sm">
          Settlement Note
          <input
            className="field mt-1 w-full"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Optional note"
          />
        </label>

        <label className="flex items-start gap-2 text-sm">
          <input
            className="mt-1"
            type="checkbox"
            checked={closeCredits}
            onChange={(event) => setCloseCredits(event.target.checked)}
          />
          <span>
            <span className="font-medium">Mark selected credits as settled</span>
            <span className="mt-0.5 block text-xs text-muted">
              Closing is an admin decision — payment amount does not need to match each credit.
            </span>
          </span>
        </label>

        {error ? <p className="text-[rgb(var(--danger))]">{error}</p> : null}
        {!error && blockedReason ? (
          <p className="text-[rgb(var(--danger))]">{blockedReason}</p>
        ) : null}
      </div>
    </Modal>
  );
}
