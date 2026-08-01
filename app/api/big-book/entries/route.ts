import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdminApi } from "@/lib/auth-api";
import { assertCsrfAndOrigin } from "@/lib/security/origin";
import { computeSettlementAmountInCreditCurrency } from "@/lib/big-book/credit";
import {
  bigBookEntriesQuerySchema,
  bigBookEntryInputSchema,
  bigBookEntryUpdateSchema
} from "@/lib/validation/big-book";
import { getBigBookEntriesPaged, getBigBookLedgerRowsPaged } from "@/lib/db/queries";

type BigBookCurrency = "IDR" | "MYR" | "USDT" | "TRX";

function isFkRestrictError(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes("foreign key") ||
    lower.includes("violates foreign key constraint") ||
    lower.includes("settles_entry_id")
  );
}

async function resolveSettlementFields(
  supabase: Awaited<ReturnType<typeof createClient>>,
  payload: {
    settles_entry_id: string | null;
    settlement_conversion_rate?: number | null;
    amount: number;
    currency_code: BigBookCurrency;
  }
): Promise<
  | {
      ok: true;
      settles_entry_id: string | null;
      settlement_conversion_rate: number | null;
      settlement_amount_in_credit_currency: number | null;
    }
  | { ok: false; status: number; error: string }
> {
  if (!payload.settles_entry_id) {
    return {
      ok: true,
      settles_entry_id: null,
      settlement_conversion_rate: null,
      settlement_amount_in_credit_currency: null
    };
  }

  const { data: creditEntry, error: creditError } = await supabase
    .from("business_ledger_entries")
    .select("id, is_credit, settles_entry_id, currency_code")
    .eq("id", payload.settles_entry_id)
    .maybeSingle();

  if (creditError) {
    return { ok: false, status: 400, error: creditError.message };
  }
  if (!creditEntry) {
    return { ok: false, status: 404, error: "Settlement target entry not found." };
  }
  if (!creditEntry.is_credit) {
    return { ok: false, status: 400, error: "Settlement target is not marked as credit." };
  }
  if (creditEntry.settles_entry_id) {
    return {
      ok: false,
      status: 400,
      error: "Settlement target is itself a settlement (chains are not allowed)."
    };
  }

  const creditCurrency = creditEntry.currency_code as BigBookCurrency;
  const conversionRate =
    payload.currency_code === creditCurrency
      ? 1
      : Number(payload.settlement_conversion_rate);
  if (!Number.isFinite(conversionRate) || conversionRate <= 0) {
    return { ok: false, status: 400, error: "Conversion rate must be greater than 0." };
  }

  return {
    ok: true,
    settles_entry_id: payload.settles_entry_id,
    settlement_conversion_rate: conversionRate,
    settlement_amount_in_credit_currency: computeSettlementAmountInCreditCurrency(
      payload.amount,
      conversionRate
    )
  };
}

export async function GET(request: Request) {
  const authCheck = await requireAdminApi();
  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.message }, { status: authCheck.status });
  }

  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view") === "rows" ? "rows" : "flat";
  const parsed = bigBookEntriesQuerySchema.safeParse({
    typeId: searchParams.getAll("typeId"),
    currencyCode: searchParams.getAll("currencyCode"),
    direction: searchParams.getAll("direction"),
    actorId: searchParams.getAll("actorId"),
    vendorTypeId: searchParams.getAll("vendorTypeId"),
    vendorId: searchParams.getAll("vendorId"),
    pocketId: searchParams.getAll("pocketId"),
    actionById: searchParams.getAll("actionById"),
    creditFlag: searchParams.getAll("creditFlag"),
    creditStatus: searchParams.getAll("creditStatus"),
    dateFrom: searchParams.get("dateFrom") ?? "",
    dateTo: searchParams.get("dateTo") ?? "",
    query: searchParams.get("query") ?? "",
    page: searchParams.get("page") ?? undefined,
    pageSize: searchParams.get("pageSize") ?? undefined,
    sortBy: searchParams.get("sortBy") ?? undefined,
    sortDir: searchParams.get("sortDir") ?? undefined
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    if (view === "rows") {
      const result = await getBigBookLedgerRowsPaged(parsed.data);
      return NextResponse.json(result);
    }
    const result = await getBigBookEntriesPaged(parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load ledger entries.";
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
  const parsed = bigBookEntryInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createClient();
  const actorId = authCheck.user.id;
  const payload = parsed.data;

  const settlement = await resolveSettlementFields(supabase, {
    settles_entry_id: payload.settles_entry_id ?? null,
    settlement_conversion_rate: payload.settlement_conversion_rate,
    amount: payload.amount,
    currency_code: payload.currency_code
  });
  if (!settlement.ok) {
    return NextResponse.json({ error: settlement.error }, { status: settlement.status });
  }

  const { data, error } = await supabase
    .from("business_ledger_entries")
    .insert({
      brand_id: authCheck.activeBrandId,
      entry_date: payload.entry_date,
      entry_direction: payload.entry_direction,
      entry_type_id: payload.entry_type_id,
      entry_sub_type_id: payload.entry_sub_type_id ?? null,
      vendor_type_id: payload.vendor_type_id ?? null,
      vendor_id: payload.vendor_id ?? null,
      pocket_id: payload.pocket_id ?? null,
      action_by_id: payload.action_by_id ?? null,
      explanation: payload.explanation,
      amount: payload.amount,
      currency_code: payload.currency_code,
      remark: payload.remark || null,
      responsible_actor_id: payload.responsible_actor_id,
      is_credit: settlement.settles_entry_id ? false : Boolean(payload.is_credit),
      settles_entry_id: settlement.settles_entry_id,
      settlement_conversion_rate: settlement.settlement_conversion_rate,
      settlement_amount_in_credit_currency: settlement.settlement_amount_in_credit_currency,
      settlement_note: settlement.settles_entry_id ? payload.settlement_note ?? null : null,
      created_by: actorId,
      updated_by: actorId
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (payload.close_credit && settlement.settles_entry_id) {
    const { error: closeError } = await supabase
      .from("business_ledger_entries")
      .update({
        credit_settled_at: new Date().toISOString(),
        credit_settled_by: actorId,
        credit_settlement_note: payload.credit_settlement_note ?? null,
        updated_by: actorId
      })
      .eq("id", settlement.settles_entry_id);

    if (closeError) {
      return NextResponse.json({ error: closeError.message }, { status: 400 });
    }
  }

  return NextResponse.json({
    id: data.id,
    settlement_conversion_rate: settlement.settlement_conversion_rate,
    settlement_amount_in_credit_currency: settlement.settlement_amount_in_credit_currency,
    credit_closed: Boolean(payload.close_credit && settlement.settles_entry_id)
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
  const parsed = bigBookEntryUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id, ...payload } = parsed.data;
  const supabase = await createClient();

  const settlement = await resolveSettlementFields(supabase, {
    settles_entry_id: payload.settles_entry_id ?? null,
    settlement_conversion_rate: payload.settlement_conversion_rate,
    amount: payload.amount,
    currency_code: payload.currency_code
  });
  if (!settlement.ok) {
    return NextResponse.json({ error: settlement.error }, { status: settlement.status });
  }

  const { error } = await supabase
    .from("business_ledger_entries")
    .update({
      entry_date: payload.entry_date,
      entry_direction: payload.entry_direction,
      entry_type_id: payload.entry_type_id,
      entry_sub_type_id: payload.entry_sub_type_id ?? null,
      vendor_type_id: payload.vendor_type_id ?? null,
      vendor_id: payload.vendor_id ?? null,
      pocket_id: payload.pocket_id ?? null,
      action_by_id: payload.action_by_id ?? null,
      explanation: payload.explanation,
      amount: payload.amount,
      currency_code: payload.currency_code,
      remark: payload.remark || null,
      responsible_actor_id: payload.responsible_actor_id,
      is_credit: settlement.settles_entry_id ? false : Boolean(payload.is_credit),
      settles_entry_id: settlement.settles_entry_id,
      settlement_conversion_rate: settlement.settlement_conversion_rate,
      settlement_amount_in_credit_currency: settlement.settlement_amount_in_credit_currency,
      settlement_note: settlement.settles_entry_id ? payload.settlement_note ?? null : null,
      updated_by: authCheck.user.id
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({
    ok: true,
    settlement_conversion_rate: settlement.settlement_conversion_rate,
    settlement_amount_in_credit_currency: settlement.settlement_amount_in_credit_currency
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
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Entry ID is required." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("business_ledger_entries")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    if (isFkRestrictError(error.message)) {
      return NextResponse.json(
        { error: "This credit has settlements. Delete them first." },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!data) {
    return NextResponse.json({ error: "Entry not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
