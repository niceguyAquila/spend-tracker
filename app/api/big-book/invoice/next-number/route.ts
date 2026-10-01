import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdminApi } from "@/lib/auth-api";
import { assertCsrfAndOrigin } from "@/lib/security/origin";

/**
 * Allocates the next daily invoice number (ddmmyy-x) via a server-side counter.
 * Call when opening the invoice builder so concurrent admins do not collide.
 */
export async function POST(request: Request) {
  if (!(await assertCsrfAndOrigin(request))) {
    return NextResponse.json({ error: "Invalid request origin or CSRF token." }, { status: 403 });
  }

  const authCheck = await requireAdminApi();
  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.message }, { status: authCheck.status });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("allocate_big_book_invoice_number");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const invoiceNo = typeof data === "string" ? data : null;
  if (!invoiceNo) {
    return NextResponse.json({ error: "Failed to allocate invoice number." }, { status: 500 });
  }

  return NextResponse.json({ invoice_no: invoiceNo });
}
