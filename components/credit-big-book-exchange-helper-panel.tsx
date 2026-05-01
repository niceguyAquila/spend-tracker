"use client";

import { useState } from "react";
import { handleUnauthorizedResponse } from "@/lib/client/auth-fetch";
import type { CreditBookCurrencyCode } from "@/lib/validation/credit-big-book";
import { formatAmount, formatDateTimeDisplay } from "@/lib/display-format";

const CURRENCIES: CreditBookCurrencyCode[] = ["IDR", "MYR", "USDT", "TRX"];

type ExchangeQuoteResult = {
  source: string;
  fetched_at: string;
  base_currency: CreditBookCurrencyCode;
  quote_currency: CreditBookCurrencyCode;
  amount: number;
  rate: number;
  converted_amount: number;
};

function formatCurrencyValue(currencyCode: CreditBookCurrencyCode, value: number, maxFractionDigits = 4) {
  const prefix = currencyCode === "IDR" ? "Rp" : currencyCode === "MYR" ? "RM" : currencyCode === "USDT" ? "USDT" : "TRX";
  return `${prefix} ${formatAmount(value, { minimumFractionDigits: 2, maximumFractionDigits: maxFractionDigits })}`;
}

export function CreditBigBookExchangeHelperPanel() {
  const [amountInput, setAmountInput] = useState("1000");
  const [baseCurrency, setBaseCurrency] = useState<CreditBookCurrencyCode>("USDT");
  const [quoteCurrency, setQuoteCurrency] = useState<CreditBookCurrencyCode>("MYR");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExchangeQuoteResult | null>(null);

  async function handleConvert() {
    const amount = Number(amountInput.replace(/,/g, "").trim());
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Amount must be greater than 0.");
      setResult(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        amount: String(amount),
        base_currency: baseCurrency,
        quote_currency: quoteCurrency
      });
      const response = await fetch(`/api/credit-big-book/exchange-rate?${params.toString()}`, {
        method: "GET",
        cache: "no-store"
      });
      if (handleUnauthorizedResponse(response)) return;

      const data = await response.json();
      if (!response.ok) {
        setResult(null);
        if (typeof data.error === "string" && data.error.trim().length > 0) {
          setError(data.error);
          return;
        }
        setError("Failed to fetch exchange quote.");
        return;
      }

      setResult(data as ExchangeQuoteResult);
    } catch {
      setResult(null);
      setError("Network error while fetching exchange quote.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card">
      <h2 className="text-lg font-semibold">Today&apos;s Exchange Helper</h2>
      <p className="mt-1 text-sm text-slate-600">Get a live quote from Coinbase public rates for Credit Big Book currencies.</p>

      <div className="mt-4 space-y-3">
        <label className="block text-sm">
          Amount
          <input
            className="field mt-1"
            value={amountInput}
            onChange={(event) => setAmountInput(event.target.value)}
            inputMode="decimal"
            placeholder="1000"
          />
        </label>
        <div className="grid grid-cols-1 gap-3 md:max-w-xl md:grid-cols-2">
          <label className="text-sm">
            From
            <select
              className="field mt-1"
              value={baseCurrency}
              onChange={(event) => setBaseCurrency(event.target.value as CreditBookCurrencyCode)}
            >
              {CURRENCIES.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            To
            <select
              className="field mt-1"
              value={quoteCurrency}
              onChange={(event) => setQuoteCurrency(event.target.value as CreditBookCurrencyCode)}
            >
              {CURRENCIES.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="mt-4">
        <button className="btn" onClick={() => void handleConvert()} disabled={loading}>
          {loading ? "Converting..." : "Convert Now"}
        </button>
      </div>

      {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}

      {result ? (
        <article className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm text-slate-700">
            {formatCurrencyValue(result.base_currency, result.amount)} ={" "}
            <span className="font-semibold">{formatCurrencyValue(result.quote_currency, result.converted_amount)}</span>
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Rate: 1 {result.base_currency} = {formatAmount(result.rate, { minimumFractionDigits: 0, maximumFractionDigits: 6 })}{" "}
            {result.quote_currency}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Source: Coinbase public exchange rates · Fetched at {formatDateTimeDisplay(result.fetched_at)}
          </p>
        </article>
      ) : null}
    </section>
  );
}
