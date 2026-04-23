import type { BigBookCurrencyCode } from "@/lib/validation/big-book";

export type ExchangeQuote = {
  source: "coinbase-public";
  fetched_at: string;
  base_currency: BigBookCurrencyCode;
  quote_currency: BigBookCurrencyCode;
  amount: number;
  rate: number;
  converted_amount: number;
};

type CoinbaseExchangeRatesResponse = {
  data?: {
    currency?: string;
    rates?: Record<string, string>;
  };
};

const COINBASE_ENDPOINT = "https://api.coinbase.com/v2/exchange-rates";

async function fetchRatesMap(baseCurrency: string): Promise<Record<string, string>> {
  const response = await fetch(`${COINBASE_ENDPOINT}?currency=${baseCurrency}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error("Coinbase request failed.");
  }

  const payload = (await response.json()) as CoinbaseExchangeRatesResponse;
  const rates = payload.data?.rates;
  if (!rates || typeof rates !== "object") {
    throw new Error("Coinbase response is missing rates.");
  }
  return rates;
}

function readPositiveRate(rates: Record<string, string>, quoteCurrency: string): number | null {
  const rawValue = rates[quoteCurrency];
  if (!rawValue) return null;
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

async function resolveRate(baseCurrency: BigBookCurrencyCode, quoteCurrency: BigBookCurrencyCode): Promise<number> {
  if (baseCurrency === quoteCurrency) return 1;

  const directRates = await fetchRatesMap(baseCurrency);
  const directRate = readPositiveRate(directRates, quoteCurrency);
  if (directRate) return directRate;

  const baseToUsd = readPositiveRate(directRates, "USD");
  if (!baseToUsd) {
    throw new Error(`No conversion path found for ${baseCurrency} -> ${quoteCurrency}.`);
  }

  const usdRates = await fetchRatesMap("USD");
  const usdToQuote = readPositiveRate(usdRates, quoteCurrency);
  if (!usdToQuote) {
    throw new Error(`No conversion path found for ${baseCurrency} -> ${quoteCurrency}.`);
  }

  return baseToUsd * usdToQuote;
}

export async function convertCurrencyWithCoinbase(params: {
  amount: number;
  base_currency: BigBookCurrencyCode;
  quote_currency: BigBookCurrencyCode;
}): Promise<ExchangeQuote> {
  const rate = await resolveRate(params.base_currency, params.quote_currency);
  const convertedAmount = params.amount * rate;

  return {
    source: "coinbase-public",
    fetched_at: new Date().toISOString(),
    base_currency: params.base_currency,
    quote_currency: params.quote_currency,
    amount: params.amount,
    rate,
    converted_amount: convertedAmount
  };
}
