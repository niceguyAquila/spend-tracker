import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdminApi } from "@/lib/auth-api";
import { assertCsrfAndOrigin } from "@/lib/security/origin";
import { computeSettlementAmountInCreditCurrency } from "@/lib/big-book/credit";
import { bigBookBulkSettleSchema } from "@/lib/validation/big-book";

type CreditRow = {
  id: string;
  entry_date: string;
  entry_direction: "spending" | "profit";
  entry_type_id: string;
  entry_sub_type_id: string | null;
  vendor_type_id: string | null;
  vendor_id: string | null;
  action_by_id: string | null;
  explanation: string;
  amount: number;
  currency_code: "IDR" | "MYR" | "USDT" | "TRX";
  responsible_actor_id: string;
  is_credit: boolean;
  settles_entry_id: string | null;
  credit_settled_at: string | null;
};

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
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
  const parsed = bigBookBulkSettleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const {
    credit_entry_ids: creditIds,
    mode,
    entry_date: entryDate,
    close_credits: closeCredits,
    settlement_note: settlementNote,
    explanation: customExplanation
  } = parsed.data;

  const supabase = await createClient();
  const actorId = authCheck.user.id;

  const { data: creditRows, error: creditError } = await supabase
    .from("business_ledger_entries")
    .select(
      `
      id, entry_date, entry_direction, entry_type_id, entry_sub_type_id,
      vendor_type_id, vendor_id, action_by_id, explanation, amount, currency_code,
      responsible_actor_id, is_credit, settles_entry_id, credit_settled_at
    `
    )
    .in("id", creditIds);

  if (creditError) {
    return NextResponse.json({ error: creditError.message }, { status: 400 });
  }

  const credits = (creditRows ?? []) as CreditRow[];
  if (credits.length !== creditIds.length) {
    return NextResponse.json(
      { error: "Some selected credits no longer exist. Refresh and try again." },
      { status: 400 }
    );
  }

  for (const credit of credits) {
    if (!credit.is_credit) {
      return NextResponse.json(
        { error: "All selected entries must be open credits." },
        { status: 400 }
      );
    }
    if (credit.settles_entry_id) {
      return NextResponse.json(
        { error: "Settlement targets cannot themselves be settlements." },
        { status: 400 }
      );
    }
    if (credit.credit_settled_at) {
      return NextResponse.json(
        { error: "One or more selected credits are already settled. Refresh and try again." },
        { status: 400 }
      );
    }
  }

  const currencies = new Set(credits.map((row) => row.currency_code));
  if (mode === "single" && currencies.size > 1) {
    return NextResponse.json(
      {
        error:
          "One settlement covering all credits requires the same currency. Settle per credit or select a single-currency set."
      },
      { status: 400 }
    );
  }

  const settlementIds: string[] = [];
  const closedCreditIds: string[] = [];

  if (mode === "per_credit") {
    const settlementRows = credits.map((credit) => ({
      entry_date: entryDate || todayIsoDate(),
      entry_direction: "profit" as const,
      entry_type_id: credit.entry_type_id,
      entry_sub_type_id: credit.entry_sub_type_id,
      vendor_type_id: credit.vendor_type_id,
      vendor_id: credit.vendor_id,
      pocket_id: null,
      action_by_id: credit.action_by_id,
      explanation:
        customExplanation?.trim() ||
        `Settlement for: ${credit.explanation}`,
      amount: Math.abs(Number(credit.amount)),
      currency_code: credit.currency_code,
      remark: null,
      responsible_actor_id: credit.responsible_actor_id,
      is_credit: false,
      settles_entry_id: credit.id,
      settlement_conversion_rate: 1,
      settlement_amount_in_credit_currency: Math.abs(Number(credit.amount)),
      settlement_note: settlementNote ?? null,
      created_by: actorId,
      updated_by: actorId
    }));

    const { data: inserted, error: insertError } = await supabase
      .from("business_ledger_entries")
      .insert(settlementRows)
      .select("id");

    if (insertError || !inserted?.length) {
      return NextResponse.json(
        { error: insertError?.message ?? "Failed to create settlement entries." },
        { status: 400 }
      );
    }
    settlementIds.push(...inserted.map((row) => row.id));
  } else {
    // One settlement covering all selected credits (same currency).
    const primary = credits[0];
    const totalAmount = credits.reduce((sum, row) => sum + Math.abs(Number(row.amount)), 0);
    const rate = 1;
    const explanation =
      customExplanation?.trim() ||
      (credits.length === 1
        ? `Settlement for: ${primary.explanation}`
        : `Bulk settlement for ${credits.length} open credits`);

    const { data: inserted, error: insertError } = await supabase
      .from("business_ledger_entries")
      .insert({
        entry_date: entryDate || todayIsoDate(),
        entry_direction: "profit",
        entry_type_id: primary.entry_type_id,
        entry_sub_type_id: primary.entry_sub_type_id,
        vendor_type_id: primary.vendor_type_id,
        vendor_id: primary.vendor_id,
        pocket_id: null,
        action_by_id: primary.action_by_id,
        explanation,
        amount: totalAmount,
        currency_code: primary.currency_code,
        remark: null,
        responsible_actor_id: primary.responsible_actor_id,
        is_credit: false,
        settles_entry_id: primary.id,
        settlement_conversion_rate: rate,
        settlement_amount_in_credit_currency: computeSettlementAmountInCreditCurrency(
          totalAmount,
          rate
        ),
        settlement_note: settlementNote ?? null,
        created_by: actorId,
        updated_by: actorId
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      return NextResponse.json(
        { error: insertError?.message ?? "Failed to create settlement entry." },
        { status: 400 }
      );
    }
    settlementIds.push(inserted.id);
  }

  if (closeCredits) {
    const now = new Date().toISOString();
    const { data: closed, error: closeError } = await supabase
      .from("business_ledger_entries")
      .update({
        credit_settled_at: now,
        credit_settled_by: actorId,
        credit_settlement_note: settlementNote ?? null,
        updated_by: actorId
      })
      .in("id", creditIds)
      .eq("is_credit", true)
      .is("credit_settled_at", null)
      .select("id");

    if (closeError) {
      return NextResponse.json({ error: closeError.message }, { status: 400 });
    }
    closedCreditIds.push(...(closed ?? []).map((row) => row.id));
  }

  return NextResponse.json({
    ok: true,
    mode,
    settlement_ids: settlementIds,
    closed_credit_ids: closedCreditIds,
    settled_count: creditIds.length
  });
}
