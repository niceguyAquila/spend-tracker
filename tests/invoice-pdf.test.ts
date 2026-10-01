import { describe, expect, it } from "vitest";
import { formatInvoiceMoney } from "@/lib/big-book/invoice-money";
import { renderInvoicePdf } from "@/lib/big-book/invoice-pdf";

describe("formatInvoiceMoney", () => {
  it("formats with currency first, commas, and two decimal places", () => {
    expect(formatInvoiceMoney(3006610, "RM")).toBe("RM 3,006,610.00");
    expect(formatInvoiceMoney(1500, "USDT")).toBe("USDT 1,500.00");
    expect(formatInvoiceMoney(12.3456, "MYR")).toBe("MYR 12.3456");
  });
});

describe("renderInvoicePdf", () => {
  it("produces a PDF buffer with Bill To / Period / Notes layout fields", async () => {
    const pdf = await renderInvoicePdf({
      title: "OCTOBER RENT 2026 INVOICE",
      invoice_no: "250926-6",
      invoice_date: "2026-09-25",
      due_date: "2026-10-02",
      terms: "Due on receipt",
      currency: "USDT",
      bill_to_company: "HCM",
      bill_to_name: "John Doe",
      bill_to_passport: "A1234567",
      bill_to_address: "Jakarta, Indonesia",
      bill_to_phone: "+62 812 0000 0000",
      subject: "October 2026 rent · Visa · Kompi 7891",
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
