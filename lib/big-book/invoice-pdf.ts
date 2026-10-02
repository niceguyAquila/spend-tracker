import PDFDocument from "pdfkit";
import { formatInvoiceMoney } from "@/lib/big-book/invoice-money";

export type InvoicePdfWallet = {
  name: string;
  network: string;
  address: string;
};

export type InvoicePdfLine = {
  unit_name: string;
  unit_no: string;
  period: string;
  description: string;
  price: number;
};

export type InvoicePdfPayload = {
  title: string;
  invoice_no: string;
  invoice_date: string;
  due_date: string;
  terms: string;
  currency: string;
  bill_to_company: string;
  bill_to_name: string;
  bill_to_passport: string;
  bill_to_address: string;
  bill_to_phone: string;
  subject: string;
  lines: InvoicePdfLine[];
  notes: string;
  fx_note: string;
  wallets: InvoicePdfWallet[];
};

export { formatInvoiceMoney } from "@/lib/big-book/invoice-money";

function formatDisplayDate(isoDate: string) {
  const trimmed = isoDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const [year, month, day] = trimmed.split("-");
  return `${day}/${month}/${year}`;
}

function drawWrappedText(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  options: { width: number; fontSize?: number; lineGap?: number; align?: "left" | "center" | "right" }
) {
  const fontSize = options.fontSize ?? 10;
  doc.fontSize(fontSize);
  doc.text(text, x, y, {
    width: options.width,
    lineGap: options.lineGap ?? 2,
    align: options.align ?? "left"
  });
  return doc.y;
}

function drawRule(
  doc: PDFKit.PDFDocument,
  left: number,
  y: number,
  width: number,
  options?: { color?: string; lineWidth?: number }
) {
  doc
    .moveTo(left, y)
    .lineTo(left + width, y)
    .strokeColor(options?.color ?? "#333333")
    .lineWidth(options?.lineWidth ?? 0.8)
    .stroke();
}

/**
 * Invoice PDF layout aligned to the sample structure:
 * Bill To + separator + PIC fields, centered Period/Subject with double rules,
 * then Notes section ordered Wallets → FX note → manual note.
 */
export async function renderInvoicePdf(payload: InvoicePdfPayload): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 48, bottom: 48, left: 48, right: 48 },
    info: {
      Title: payload.title || "Invoice",
      Author: "AQ Spend Tracker"
    }
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const left = doc.page.margins.left;
  let y = doc.page.margins.top;

  // Title
  doc.font("Helvetica-Bold").fontSize(16);
  doc.text((payload.title || "INVOICE").toUpperCase(), left, y, {
    width: pageWidth,
    align: "center"
  });
  y = doc.y + 18;

  // Meta grid
  const metaLeftWidth = pageWidth * 0.55;
  const metaRightX = left + metaLeftWidth;
  const metaRightWidth = pageWidth - metaLeftWidth;
  doc.font("Helvetica").fontSize(10);

  const metaRows: Array<[string, string, string, string]> = [
    ["Invoice No", payload.invoice_no, "Invoice Date", formatDisplayDate(payload.invoice_date)],
    ["Due Date", formatDisplayDate(payload.due_date), "Terms", payload.terms || "—"],
    ["Currency", payload.currency, "", ""]
  ];

  for (const [lLabel, lValue, rLabel, rValue] of metaRows) {
    doc.font("Helvetica-Bold").text(`${lLabel}:`, left, y, { continued: true });
    doc.font("Helvetica").text(` ${lValue || "—"}`);
    if (rLabel) {
      const rowY = y;
      doc.font("Helvetica-Bold").text(`${rLabel}:`, metaRightX, rowY, {
        continued: true,
        width: metaRightWidth
      });
      doc.font("Helvetica").text(` ${rValue || "—"}`, { width: metaRightWidth });
    }
    y = Math.max(doc.y, y + 14);
  }

  y += 14;

  // Bill To: Company
  // Bill To: [Company Name]
  // ------------------------------
  // Name: ...
  doc.font("Helvetica-Bold").fontSize(11);
  doc.text("Bill To: ", left, y, { continued: true });
  doc.font("Helvetica").fontSize(11).text(payload.bill_to_company.trim() || "—");
  y = doc.y + 8;

  drawRule(doc, left, y, Math.min(pageWidth, 280), { lineWidth: 0.9 });
  y += 12;

  const billRows: Array<[string, string]> = [
    ["Name", payload.bill_to_name.trim()],
    ["Passport No", payload.bill_to_passport.trim()],
    ["Address", payload.bill_to_address.trim()],
    ["Phone", payload.bill_to_phone.trim()]
  ];

  for (const [label, value] of billRows) {
    doc.font("Helvetica-Bold").fontSize(10).text(`${label}: `, left, y, { continued: true });
    doc.font("Helvetica").fontSize(10);
    // Keep label+value on one flow; wrap long address under the same left margin.
    if (label === "Address" && value.length > 60) {
      doc.text("");
      y = doc.y + 2;
      y = drawWrappedText(doc, value || "—", left, y, { width: pageWidth, fontSize: 10 });
      y += 4;
    } else {
      doc.text(value || "—");
      y = Math.max(doc.y + 2, y + 14);
    }
  }

  // Period / Subject — centered, larger, with double rules before & after
  y += 10;
  if (payload.subject.trim()) {
    drawRule(doc, left, y, pageWidth, { lineWidth: 1 });
    y += 3;
    drawRule(doc, left, y, pageWidth, { lineWidth: 0.6 });
    y += 12;

    doc.font("Helvetica-Bold").fontSize(13);
    y = drawWrappedText(doc, payload.subject.trim(), left, y, {
      width: pageWidth,
      fontSize: 13,
      align: "center",
      lineGap: 3
    });
    y += 10;

    drawRule(doc, left, y, pageWidth, { lineWidth: 0.6 });
    y += 3;
    drawRule(doc, left, y, pageWidth, { lineWidth: 1 });
    y += 14;
  }

  // Line table
  const cols = [
    { key: "unit_name" as const, label: "UNIT NAME", width: 90 },
    { key: "unit_no" as const, label: "UNIT NO", width: 50 },
    { key: "period" as const, label: "PERIOD", width: 85 },
    { key: "description" as const, label: "DESCRIPTION", width: 155 },
    { key: "price" as const, label: "PRICE", width: 120 }
  ];
  const tableWidth = cols.reduce((sum, col) => sum + col.width, 0);
  const tableLeft = left + Math.max(0, (pageWidth - tableWidth) / 2);

  function ensureSpace(needed: number) {
    if (y + needed > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      y = doc.page.margins.top;
    }
  }

  function drawHeader() {
    ensureSpace(28);
    doc.rect(tableLeft, y, tableWidth, 22).fill("#222222");
    doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(8);
    let x = tableLeft;
    for (const col of cols) {
      doc.text(col.label, x + 4, y + 7, { width: col.width - 8, align: col.key === "price" ? "right" : "left" });
      x += col.width;
    }
    doc.fillColor("#000000");
    y += 22;
  }

  drawHeader();

  const lines = payload.lines.length
    ? payload.lines
    : [{ unit_name: "—", unit_no: "", period: "", description: "No line items", price: 0 }];

  let total = 0;
  for (const line of lines) {
    const priceText = formatInvoiceMoney(line.price, payload.currency);
    doc.font("Helvetica").fontSize(9);
    const cellHeights = [
      doc.heightOfString(line.unit_name || "—", { width: cols[0].width - 8 }),
      doc.heightOfString(line.unit_no || "—", { width: cols[1].width - 8 }),
      doc.heightOfString(line.period || "—", { width: cols[2].width - 8 }),
      doc.heightOfString(line.description || "—", { width: cols[3].width - 8 }),
      doc.heightOfString(priceText, { width: cols[4].width - 8 })
    ];
    const rowHeight = Math.max(20, ...cellHeights) + 8;
    ensureSpace(rowHeight + 4);

    doc.rect(tableLeft, y, tableWidth, rowHeight).strokeColor("#CCCCCC").lineWidth(0.5).stroke();
    let x = tableLeft;
    const values = [
      line.unit_name || "—",
      line.unit_no || "—",
      line.period || "—",
      line.description || "—",
      priceText
    ];
    values.forEach((value, index) => {
      const col = cols[index];
      doc.font("Helvetica").fontSize(9).fillColor("#000000");
      doc.text(value, x + 4, y + 4, {
        width: col.width - 8,
        align: col.key === "price" ? "right" : "left"
      });
      x += col.width;
    });
    y += rowHeight;
    total += Number.isFinite(line.price) ? line.price : 0;
  }

  ensureSpace(36);
  y += 8;
  doc.font("Helvetica-Bold").fontSize(11);
  doc.text(`Total: ${formatInvoiceMoney(total, payload.currency)}`, tableLeft, y, {
    width: tableWidth,
    align: "right"
  });
  y = doc.y + 16;

  // Notes / Terms — continuous block: wallets → FX note → manual note (no sub-labels)
  ensureSpace(80);
  drawRule(doc, left, y, pageWidth);
  y += 12;

  doc.font("Helvetica-Bold").fontSize(11).text("Notes / Terms", left, y);
  y = doc.y + 8;

  const hasNotesContent =
    payload.wallets.length > 0 || Boolean(payload.fx_note.trim()) || Boolean(payload.notes.trim());

  if (!hasNotesContent) {
    doc.font("Helvetica").fontSize(9).text("—", left, y);
  } else {
    // One wallet per line: "Wallet: NETWORK - ADDRESS" (full line bold; no wallet name)
    for (const wallet of payload.wallets) {
      ensureSpace(24);
      const network = wallet.network.trim() || "—";
      const address = wallet.address.trim() || "—";
      doc.font("Helvetica-Bold").fontSize(9);
      y = drawWrappedText(doc, `Wallet: ${network} - ${address}`, left, y, {
        width: pageWidth,
        fontSize: 9
      });
      y += 4;
    }

    if (payload.fx_note.trim()) {
      ensureSpace(24);
      doc.font("Helvetica").fontSize(9);
      y = drawWrappedText(doc, payload.fx_note.trim(), left, y, { width: pageWidth, fontSize: 9 });
      y += 4;
    }

    if (payload.notes.trim()) {
      ensureSpace(24);
      doc.font("Helvetica").fontSize(9);
      y = drawWrappedText(doc, payload.notes.trim(), left, y, { width: pageWidth, fontSize: 9 });
    }
  }

  doc.end();
  return done;
}
