import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdminApi } from "@/lib/auth-api";
import { assertCsrfAndOrigin } from "@/lib/security/origin";
import {
  creditBookSettlementCreateSchema,
  creditBookSettlementDeleteSchema,
  creditBookSettlementListQuerySchema,
  creditBookSettlementUpdateSchema
} from "@/lib/validation/credit-big-book";
import { getCreditBookSettlementsForEntry } from "@/lib/db/queries";

export async function GET(request: Request) {
  const authCheck = await requireAdminApi();
  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.message }, { status: authCheck.status });
  }

  const { searchParams } = new URL(request.url);
  const parsed = creditBookSettlementListQuerySchema.safeParse({
    entryId: searchParams.get("entryId") ?? ""
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const settlements = await getCreditBookSettlementsForEntry(parsed.data.entryId);
    return NextResponse.json({ settlements });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load settlements.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!(await assertCsrfAndOrigin(request))) {
    return NextResponse.json({ error: "Invalid request origin or CSRF token." }, { status: 403 });
  }

  const authCheck = await requireAdminApi();
  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.message }, { status: authCheck.status });
  }

  const body = await request.json();
  const parsed = creditBookSettlementCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const payload = parsed.data;
  const supabase = await createClient();

  const { data: entry, error: entryError } = await supabase
    .from("credit_ledger_entries")
    .select("id, brand_id")
    .eq("id", payload.entry_id)
    .maybeSingle();
  if (entryError) {
    return NextResponse.json({ error: entryError.message }, { status: 400 });
  }
  if (!entry) {
    return NextResponse.json({ error: "Ledger entry not found." }, { status: 404 });
  }

  const actorId = authCheck.user.id;
  const { data, error } = await supabase
    .from("credit_ledger_settlements")
    .insert({
      entry_id: payload.entry_id,
      settlement_date: payload.settlement_date,
      amount: payload.amount,
      note: payload.note ? payload.note : null,
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
  if (!(await assertCsrfAndOrigin(request))) {
    return NextResponse.json({ error: "Invalid request origin or CSRF token." }, { status: 403 });
  }

  const authCheck = await requireAdminApi();
  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.message }, { status: authCheck.status });
  }

  const body = await request.json();
  const parsed = creditBookSettlementUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id, ...payload } = parsed.data;
  const supabase = await createClient();

  const updates: Record<string, unknown> = {
    updated_by: authCheck.user.id
  };
  if (payload.settlement_date !== undefined) updates.settlement_date = payload.settlement_date;
  if (payload.amount !== undefined) updates.amount = payload.amount;
  if (payload.note !== undefined) updates.note = payload.note ? payload.note : null;

  const { error } = await supabase
    .from("credit_ledger_settlements")
    .update(updates)
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  if (!(await assertCsrfAndOrigin(request))) {
    return NextResponse.json({ error: "Invalid request origin or CSRF token." }, { status: 403 });
  }

  const authCheck = await requireAdminApi();
  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.message }, { status: authCheck.status });
  }

  const { searchParams } = new URL(request.url);
  const parsed = creditBookSettlementDeleteSchema.safeParse({ id: searchParams.get("id") });
  if (!parsed.success) {
    return NextResponse.json({ error: "Settlement ID is required." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("credit_ledger_settlements")
    .delete()
    .eq("id", parsed.data.id)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!data) {
    return NextResponse.json({ error: "Settlement not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
