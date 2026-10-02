import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdminApi } from "@/lib/auth-api";
import { assertCsrfAndOrigin } from "@/lib/security/origin";
import { describeWriteError } from "@/lib/db/entity-writes";
import { getBigBookLedgerTypeInvoiceProfiles } from "@/lib/db/queries";
import { bigBookLedgerTypeInvoiceProfileUpsertSchema } from "@/lib/validation/invoice";

const TABLE = "business_ledger_type_invoice_profiles";
const ENTITY_LABEL = "Type invoice profile";

export async function GET() {
  const authCheck = await requireAdminApi();
  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.message }, { status: authCheck.status });
  }

  try {
    const rows = await getBigBookLedgerTypeInvoiceProfiles();
    return NextResponse.json({ rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load type invoice profiles.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
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

  const parsed = bigBookLedgerTypeInvoiceProfileUpsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: typeRow, error: typeError } = await supabase
    .from("business_ledger_types")
    .select("id")
    .eq("id", parsed.data.type_id)
    .maybeSingle();

  if (typeError) {
    return NextResponse.json({ error: describeWriteError(typeError, "Ledger type") }, { status: 400 });
  }
  if (!typeRow) {
    return NextResponse.json({ error: "Ledger type not found." }, { status: 404 });
  }

  const payload = {
    type_id: parsed.data.type_id,
    pic_name: parsed.data.pic_name,
    pic_passport: parsed.data.pic_passport,
    pic_address: parsed.data.pic_address,
    pic_phone: parsed.data.pic_phone,
    bill_to_company: parsed.data.bill_to_company,
    background_color: parsed.data.background_color
  };

  const { data, error } = await supabase
    .from(TABLE)
    .upsert(payload, { onConflict: "type_id" })
    .select("type_id")
    .single();

  if (error) {
    return NextResponse.json({ error: describeWriteError(error, ENTITY_LABEL) }, { status: 400 });
  }

  return NextResponse.json({ type_id: data.type_id });
}
