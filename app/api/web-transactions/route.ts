import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireFinanceApi } from "@/lib/auth-api";
import { hasTrustedOrigin } from "@/lib/security/origin";

const sourceSystemSchema = z.enum(["backoffice", "payment_gateway"]);

const createWebTransactionSchema = z.object({
  sourceSystem: sourceSystemSchema,
  externalTxnNo: z.string().trim().min(1, "Transaction number is required."),
  canonicalStatus: z.string().trim().min(1, "Status is required."),
  canonicalType: z.string().trim().min(1, "Type is required."),
  amount: z.number().finite().positive("Amount must be greater than 0."),
  merchantFee: z.number().finite().nullable().optional(),
  merchantName: z.string().trim().nullable().optional(),
  createTime: z.string().datetime({ offset: true }),
  lastUpdateTime: z.string().datetime({ offset: true })
});

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const authCheck = await requireFinanceApi();
  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.message }, { status: authCheck.status });
  }

  const body = await request.json();
  const parsed = createWebTransactionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const payload = parsed.data;
  const supabase = await createClient();
  const merchantName = payload.merchantName && payload.merchantName.length > 0 ? payload.merchantName : null;

  const { data, error } = await supabase
    .from("web_transactions")
    .insert({
      brand_id: authCheck.activeBrandId,
      source_system: payload.sourceSystem,
      external_txn_no: payload.externalTxnNo,
      create_time: payload.createTime,
      last_update_time: payload.lastUpdateTime,
      status: payload.canonicalStatus,
      raw_status: payload.canonicalStatus,
      canonical_status: payload.canonicalStatus,
      payment_type: payload.canonicalType,
      raw_type: payload.canonicalType,
      canonical_type: payload.canonicalType,
      product_type: "manual",
      currency_code: "IDR",
      original_amount: payload.amount,
      amount: payload.amount,
      merchant_fee: payload.merchantFee ?? null,
      merchant_name: merchantName,
      client_order_no: payload.externalTxnNo,
      aggregator_order_no: null,
      source_file_name: "manual-entry",
      imported_by: authCheck.user.id,
      raw_payload: null
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ id: data.id });
}

export async function DELETE(request: Request) {
  if (!hasTrustedOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const authCheck = await requireFinanceApi();
  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.message }, { status: authCheck.status });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Web transaction ID is required." }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("web_transactions")
    .delete()
    .eq("id", id)
    .eq("brand_id", authCheck.activeBrandId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
