import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.fn();
const requireAdminApiMock = vi.fn();
const assertCsrfAndOriginMock = vi.fn();
const renderInvoicePdfMock = vi.fn();

vi.mock("@/lib/security/origin", () => ({
  assertCsrfAndOrigin: assertCsrfAndOriginMock,
  hasTrustedOrigin: vi.fn(() => true)
}));

vi.mock("@/lib/auth-api", () => ({
  requireAdminApi: requireAdminApiMock
}));

vi.mock("@/lib/big-book/invoice-pdf", () => ({
  renderInvoicePdf: renderInvoicePdfMock
}));

const walletSelectInMock = vi.fn();
const walletSelectEqMock = vi.fn();
const walletSelectOrderMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    rpc: rpcMock,
    from: vi.fn((table: string) => {
      if (table === "big_book_invoice_wallets") {
        return {
          select: vi.fn(() => ({
            in: walletSelectInMock
          }))
        };
      }
      return {};
    })
  }))
}));

describe("big book invoice routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertCsrfAndOriginMock.mockResolvedValue(true);
    requireAdminApiMock.mockResolvedValue({
      ok: true,
      user: { id: "auth-user-1" }
    });
    rpcMock.mockResolvedValue({ data: "011026-1", error: null });
    renderInvoicePdfMock.mockResolvedValue(Buffer.from("%PDF-1.4 mock"));

    walletSelectOrderMock.mockReturnValue({
      order: vi.fn(async () => ({
        data: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            name: "Binance",
            network: "TRC20",
            address: "TAddress123",
            is_active: true
          }
        ],
        error: null
      }))
    });
    walletSelectEqMock.mockReturnValue({
      order: walletSelectOrderMock
    });
    walletSelectInMock.mockReturnValue({
      eq: walletSelectEqMock
    });
  });

  it("allocates the next invoice number", async () => {
    const { POST } = await import("@/app/api/big-book/invoice/next-number/route");
    const request = new Request("https://app.localhost/api/big-book/invoice/next-number", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.invoice_no).toBe("011026-1");
    expect(rpcMock).toHaveBeenCalledWith("allocate_big_book_invoice_number");
  });

  it("rejects next-number without admin", async () => {
    requireAdminApiMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      message: "Admin access required"
    });
    const { POST } = await import("@/app/api/big-book/invoice/next-number/route");
    const request = new Request("https://app.localhost/api/big-book/invoice/next-number", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
  });

  it("returns a PDF for a valid invoice payload", async () => {
    const { POST } = await import("@/app/api/big-book/invoice/pdf/route");
    const request = new Request("https://app.localhost/api/big-book/invoice/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "OCTOBER RENT 2026 INVOICE",
        invoice_no: "011026-1",
        invoice_date: "2026-10-01",
        due_date: "2026-10-08",
        terms: "Due on receipt",
        currency: "USDT",
        bill_to_company: "HCM",
        bill_to_passport: "P123",
        bill_to_address: "Jakarta",
        bill_to_phone: "+62",
        subject: "October rent",
        lines: [
          {
            unit_name: "Unit A",
            unit_no: "1",
            period: "Oct 2026",
            description: "Rent",
            price: 1200
          }
        ],
        notes: "Pay to selected wallets",
        fx_note: "1 USDT = 1 USD",
        wallet_ids: ["11111111-1111-4111-8111-111111111111"]
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/pdf");
    expect(renderInvoicePdfMock).toHaveBeenCalledTimes(1);
    const pdfArgs = renderInvoicePdfMock.mock.calls[0][0];
    expect(pdfArgs.invoice_no).toBe("011026-1");
    expect(pdfArgs.wallets).toEqual([
      { name: "Binance", network: "TRC20", address: "TAddress123" }
    ]);
  });

  it("rejects invalid PDF payloads", async () => {
    const { POST } = await import("@/app/api/big-book/invoice/pdf/route");
    const request = new Request("https://app.localhost/api/big-book/invoice/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "X",
        invoice_no: "1",
        lines: []
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(renderInvoicePdfMock).not.toHaveBeenCalled();
  });
});
