import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdminApi } from "@/lib/auth-api";
import { assertCsrfAndOrigin } from "@/lib/security/origin";
import { renderInvoicePdf } from "@/lib/big-book/invoice-pdf";
import { invoicePdfRequestSchema } from "@/lib/validation/invoice";

export const runtime = "nodejs";

function safeFilenamePart(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

export async function POST(request: Request) {
  if (!(await assertCsrfAndOrigin(request))) {
    return NextResponse.json({ error: "Invalid request origin or CSRF token." }, { status: 403 });
  }

  const authCheck = await requireAdminApi();
  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.message }, { status: authCheck.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = invoicePdfRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createClient();
  let wallets: Array<{ name: string; network: string; address: string }> = [];

  if (parsed.data.wallet_ids.length) {
    const { data, error } = await supabase
      .from("big_book_invoice_wallets")
      .select("id, name, network, address, is_active")
      .in("id", parsed.data.wallet_ids)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const byId = new Map((data ?? []).map((row) => [row.id, row]));
    wallets = parsed.data.wallet_ids
      .map((id) => byId.get(id))
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .map((row) => ({
        name: row.name,
        network: row.network,
        address: row.address
      }));
  }

  try {
    const pdf = await renderInvoicePdf({
      title: parsed.data.title,
      invoice_no: parsed.data.invoice_no,
      invoice_date: parsed.data.invoice_date,
      due_date: parsed.data.due_date,
      terms: parsed.data.terms,
      currency: parsed.data.currency,
      bill_to_company: parsed.data.bill_to_company,
      bill_to_name: parsed.data.bill_to_name,
      bill_to_passport: parsed.data.bill_to_passport,
      bill_to_address: parsed.data.bill_to_address,
      bill_to_phone: parsed.data.bill_to_phone,
      subject: parsed.data.subject,
      lines: parsed.data.lines.map((line) => ({
        unit_name: line.unit_name,
        unit_no: line.unit_no,
        period: line.period,
        description: line.description,
        price: line.price
      })),
      notes: parsed.data.notes,
      fx_note: parsed.data.fx_note,
      wallets
    });

    const filename = `${safeFilenamePart(parsed.data.invoice_no) || "invoice"}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate PDF.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
