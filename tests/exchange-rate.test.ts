import { afterEach, describe, expect, it, vi } from "vitest";
import { convertCurrencyWithCoinbase } from "@/lib/exchange-rate";

describe("convertCurrencyWithCoinbase", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns direct conversion rate when pair exists", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          currency: "USDT",
          rates: { MYR: "4.21" }
        }
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    const quote = await convertCurrencyWithCoinbase({
      amount: 1000,
      base_currency: "USDT",
      quote_currency: "MYR"
    });

    expect(quote.rate).toBe(4.21);
    expect(quote.converted_amount).toBe(4210);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses USD bridge when direct pair is missing", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            currency: "TRX",
            rates: { USD: "0.12" }
          }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            currency: "USD",
            rates: { MYR: "4.2" }
          }
        })
      });
    vi.stubGlobal("fetch", fetchMock);

    const quote = await convertCurrencyWithCoinbase({
      amount: 50,
      base_currency: "TRX",
      quote_currency: "MYR"
    });

    expect(quote.rate).toBeCloseTo(0.504, 8);
    expect(quote.converted_amount).toBeCloseTo(25.2, 8);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
