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
    .select("id, currency_code")
    .eq("id", payload.entry_id)
    .maybeSingle();
  if (entryError) {
    return NextResponse.json({ error: entryError.message }, { status: 400 });
  }
  if (!entry) {
    return NextResponse.json({ error: "Ledger entry not found." }, { status: 404 });
  }

  const entryCurrency = entry.currency_code as "IDR" | "MYR" | "USDT" | "TRX";
  const settlementCurrency = payload.settlement_currency_code;
  const conversionRate =
    settlementCurrency === entryCurrency ? 1 : payload.conversion_rate;
  const amountInEntryCurrency =
    Math.round(payload.amount * conversionRate * 10000) / 10000;

  const actorId = authCheck.user.id;
  const { data, error } = await supabase
    .from("credit_ledger_settlements")
    .insert({
      entry_id: payload.entry_id,
      settlement_date: payload.settlement_date,
      amount: payload.amount,
      settlement_currency_code: settlementCurrency,
      conversion_rate: conversionRate,
      amount_in_entry_currency: amountInEntryCurrency,
      note: payload.note ? payload.note : null,
      created_by: actorId,
      updated_by: actorId
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({
    id: data.id,
    amount_in_entry_currency: amountInEntryCurrency,
    conversion_rate: conversionRate,
    settlement_currency_code: settlementCurrency
  });
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

  const { data: existing, error: existingError } = await supabase
    .from("credit_ledger_settlements")
    .select(
      "id, entry_id, amount, settlement_currency_code, conversion_rate, credit_ledger_entries(currency_code)"
    )
    .eq("id", id)
    .maybeSingle();
  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 400 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Settlement not found." }, { status: 404 });
  }
  const entryRel = Array.isArray(existing.credit_ledger_entries)
    ? existing.credit_ledger_entries[0]
    : existing.credit_ledger_entries;
  const entryCurrency = (entryRel?.currency_code ?? null) as
    | "IDR"
    | "MYR"
    | "USDT"
    | "TRX"
    | null;
  if (!entryCurrency) {
    return NextResponse.json({ error: "Parent entry currency not found." }, { status: 400 });
  }

  const nextCurrency = (payload.settlement_currency_code ??
    existing.settlement_currency_code) as "IDR" | "MYR" | "USDT" | "TRX";
  const requestedRate =
    payload.conversion_rate !== undefined
      ? payload.conversion_rate
      : Number(existing.conversion_rate);
  const nextRate = nextCurrency === entryCurrency ? 1 : requestedRate;
  const nextAmount = payload.amount !== undefined ? payload.amount : Number(existing.amount);
  const nextAmountInEntryCurrency =
    Math.round(nextAmount * nextRate * 10000) / 10000;

  const updates: Record<string, unknown> = {
    updated_by: authCheck.user.id
  };
  if (payload.settlement_date !== undefined) updates.settlement_date = payload.settlement_date;
  if (payload.note !== undefined) updates.note = payload.note ? payload.note : null;
  if (
    payload.amount !== undefined ||
    payload.settlement_currency_code !== undefined ||
    payload.conversion_rate !== undefined
  ) {
    updates.amount = nextAmount;
    updates.settlement_currency_code = nextCurrency;
    updates.conversion_rate = nextRate;
    updates.amount_in_entry_currency = nextAmountInEntryCurrency;
  }

  const { error } = await supabase
    .from("credit_ledger_settlements")
    .update(updates)
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({
    ok: true,
    amount_in_entry_currency: nextAmountInEntryCurrency,
    conversion_rate: nextRate,
    settlement_currency_code: nextCurrency
  });
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
