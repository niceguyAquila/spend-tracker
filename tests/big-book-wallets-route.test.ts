import { beforeEach, describe, expect, it, vi } from "vitest";

const insertMock = vi.fn();
const insertSelectSingleMock = vi.fn();
const updateMock = vi.fn();
const updateEqMock = vi.fn();
const deleteSelectMaybeSingleMock = vi.fn();
const deleteSelectMock = vi.fn(() => ({ maybeSingle: deleteSelectMaybeSingleMock }));
const deleteEqMock = vi.fn(() => ({ select: deleteSelectMock }));
const selectListMock = vi.fn();

const requireAdminApiMock = vi.fn();
const assertCsrfAndOriginMock = vi.fn();

vi.mock("@/lib/security/origin", () => ({
  assertCsrfAndOrigin: assertCsrfAndOriginMock,
  hasTrustedOrigin: vi.fn(() => true)
}));

vi.mock("@/lib/auth-api", () => ({
  requireAdminApi: requireAdminApiMock
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: vi.fn((table: string) => {
      if (table === "big_book_invoice_wallets") {
        return {
          select: selectListMock,
          insert: insertMock,
          update: updateMock,
          delete: vi.fn(() => ({ eq: deleteEqMock }))
        };
      }
      return {};
    })
  }))
}));

describe("big book wallets route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertCsrfAndOriginMock.mockResolvedValue(true);
    requireAdminApiMock.mockResolvedValue({
      ok: true,
      user: { id: "auth-user-1" }
    });

    insertMock.mockReturnValue({
      select: vi.fn(() => ({
        single: insertSelectSingleMock
      }))
    });
    insertSelectSingleMock.mockResolvedValue({
      data: { id: "wallet-1" },
      error: null
    });

    updateMock.mockReturnValue({ eq: updateEqMock });
    updateEqMock.mockResolvedValue({ error: null });

    selectListMock.mockResolvedValue({
      data: [{ name: "Binance", is_active: true, sort_order: 10 }],
      error: null
    });

    deleteSelectMaybeSingleMock.mockResolvedValue({ data: { id: "wallet-1" }, error: null });
  });

  it("creates a new wallet", async () => {
    const { POST } = await import("@/app/api/big-book/wallets/route");
    const request = new Request("https://app.localhost/api/big-book/wallets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "OKX USDT",
        network: "TRC20",
        address: "TXyz1234567890abcdef"
      })
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.id).toBe("wallet-1");
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock.mock.calls[0][0]).toMatchObject({
      name: "OKX USDT",
      network: "TRC20",
      address: "TXyz1234567890abcdef",
      sort_order: 20
    });
  });

  it("returns conflict when wallet name already exists", async () => {
    selectListMock.mockResolvedValueOnce({
      data: [{ name: "OKX USDT", is_active: true, sort_order: 10 }],
      error: null
    });

    const { POST } = await import("@/app/api/big-book/wallets/route");
    const request = new Request("https://app.localhost/api/big-book/wallets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "OKX USDT",
        network: "TRC20",
        address: "TXyz1234567890abcdef"
      })
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toContain("already uses the name");
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("rejects invalid create payload", async () => {
    const { POST } = await import("@/app/api/big-book/wallets/route");
    const request = new Request("https://app.localhost/api/big-book/wallets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "x",
        network: "n",
        address: "ab"
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("updates a wallet via PATCH", async () => {
    const { PATCH } = await import("@/app/api/big-book/wallets/route");
    selectListMock.mockResolvedValueOnce({
      data: [{ id: "other", name: "Other", is_active: true }],
      error: null
    });

    const request = new Request("https://app.localhost/api/big-book/wallets", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "55555555-5555-4555-8555-555555555555",
        name: "OKX USDT",
        network: "ERC20",
        address: "0xabc1234567890"
      })
    });

    const response = await PATCH(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(updateMock).toHaveBeenCalledTimes(1);
  });
});
