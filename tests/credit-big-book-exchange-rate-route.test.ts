import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminApiMock = vi.fn();
const convertCurrencyWithCoinbaseMock = vi.fn();

vi.mock("@/lib/auth-api", () => ({
  requireAdminApi: requireAdminApiMock
}));

vi.mock("@/lib/exchange-rate", () => ({
  convertCurrencyWithCoinbase: convertCurrencyWithCoinbaseMock
}));

describe("credit big book exchange rate route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminApiMock.mockResolvedValue({
      ok: true,
      activeBrandId: "brand-1",
      user: { id: "admin-1" }
    });
  });

  it("returns conversion quote for valid request", async () => {
    convertCurrencyWithCoinbaseMock.mockResolvedValue({
      source: "coinbase-public",
      fetched_at: "2026-04-24T00:00:00.000Z",
      base_currency: "USDT",
      quote_currency: "MYR",
      amount: 1000,
      rate: 4.2,
      converted_amount: 4200
    });

    const { GET } = await import("@/app/api/credit-big-book/exchange-rate/route");
    const request = new Request(
      "https://app.localhost/api/credit-big-book/exchange-rate?amount=1000&base_currency=USDT&quote_currency=MYR"
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.converted_amount).toBe(4200);
    expect(convertCurrencyWithCoinbaseMock).toHaveBeenCalledWith({
      amount: 1000,
      base_currency: "USDT",
      quote_currency: "MYR"
    });
  });

  it("returns 400 for invalid query parameters", async () => {
    const { GET } = await import("@/app/api/credit-big-book/exchange-rate/route");
    const request = new Request(
      "https://app.localhost/api/credit-big-book/exchange-rate?amount=0&base_currency=INVALID&quote_currency=MYR"
    );

    const response = await GET(request);
    expect(response.status).toBe(400);
  });

  it("returns 502 when provider call fails", async () => {
    convertCurrencyWithCoinbaseMock.mockRejectedValue(new Error("Coinbase unavailable"));

    const { GET } = await import("@/app/api/credit-big-book/exchange-rate/route");
    const request = new Request(
      "https://app.localhost/api/credit-big-book/exchange-rate?amount=1000&base_currency=USDT&quote_currency=MYR"
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(502);
    expect(data.error).toContain("Coinbase unavailable");
  });
});
