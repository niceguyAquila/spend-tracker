import { describe, expect, it } from "vitest";
import { renderInvoicePdf } from "@/lib/big-book/invoice-pdf";

describe("renderInvoicePdf", () => {
  it("produces a PDF buffer with sample-equivalent fields", async () => {
    const pdf = await renderInvoicePdf({
      title: "OCTOBER RENT 2026 INVOICE",
      invoice_no: "250926-6",
      invoice_date: "2026-09-25",
      due_date: "2026-10-02",
      terms: "Due on receipt",
      currency: "USDT",
      bill_to_company: "HCM",
      bill_to_passport: "A1234567",
      bill_to_address: "Jakarta, Indonesia",
      bill_to_phone: "+62 812 0000 0000",
      subject: "October 2026 rent",
      lines: [
        {
          unit_name: "Kompi",
          unit_no: "7891",
          period: "Oct 2026",
          description: "Visa rent",
          price: 1500
        }
      ],
      notes: "Please pay to the wallets below.",
      fx_note: "Quoted in USDT.",
      wallets: [
        {
          name: "Binance",
          network: "TRC20",
          address: "TExampleAddress123"
        }
      ]
    });

    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.subarray(0, 4).toString("utf8")).toBe("%PDF");
    expect(pdf.length).toBeGreaterThan(500);
  });
});
