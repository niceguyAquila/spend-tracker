import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdminApi } from "@/lib/auth-api";
import { hasTrustedOrigin } from "@/lib/security/origin";
import { bigBookEntryInputSchema, bigBookEntryUpdateSchema } from "@/lib/validation/big-book";

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const authCheck = await requireAdminApi();
  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.message }, { status: authCheck.status });
  }

  const body = await request.json();
  const parsed = bigBookEntryInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createClient();
  const actorId = authCheck.user.id;
  const payload = parsed.data;
  const { data, error } = await supabase
    .from("business_ledger_entries")
    .insert({
      brand_id: authCheck.activeBrandId,
      entry_date: payload.entry_date,
      entry_direction: payload.entry_direction,
      entry_type_id: payload.entry_type_id,
      explanation: payload.explanation,
      amount: payload.amount,
      currency_code: payload.currency_code,
      remark: payload.remark || null,
      responsible_actor_id: payload.responsible_actor_id,
      created_by: actorId,
      updated_by: actorId
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ id: data.id });
}

export async function PATCH(request: Request) {
  if (!hasTrustedOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const authCheck = await requireAdminApi();
  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.message }, { status: authCheck.status });
  }

  const body = await request.json();
  const parsed = bigBookEntryUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id, ...payload } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("business_ledger_entries")
    .update({
      ...payload,
      remark: payload.remark || null,
      updated_by: authCheck.user.id
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  if (!hasTrustedOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const authCheck = await requireAdminApi();
  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.message }, { status: authCheck.status });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Entry ID is required." }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("business_ledger_entries")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
