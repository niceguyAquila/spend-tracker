import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdminApi } from "@/lib/auth-api";
import { assertCsrfAndOrigin } from "@/lib/security/origin";
import {
  computeSettlementAmountFromCredit,
  computeSettlementAmountInCreditCurrency
} from "@/lib/big-book/credit";
import { ensureDebtPaymentGroup } from "@/lib/big-book/debt-payment-group";
import { bigBookBulkDebtSettleSchema } from "@/lib/validation/big-book";

type DebtCurrency = "IDR" | "MYR" | "USDT" | "TRX";

type DebtRow = {
  id: string;
  group_id: string | null;
  entry_date: string;
  entry_direction: "spending" | "profit";
  entry_type_id: string;
  vendor_type_id: string | null;
  vendor_id: string | null;
  action_by_id: string | null;
  explanation: string;
  amount: number;
  currency_code: DebtCurrency;
  responsible_actor_id: string;
  is_debt: boolean;
  settles_entry_id: string | null;
  debt_settled_at: string | null;
};

type LedgerInsertRow = Record<string, unknown>;

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function resolveConversionRate(
  settlementCurrency: DebtCurrency,
  debtCurrency: DebtCurrency,
  requestedRate: number | undefined
): { ok: true; rate: number | null } {
  if (settlementCurrency === debtCurrency) {
    return { ok: true, rate: 1 };
  }
  const rate = Number(requestedRate);
  if (Number.isFinite(rate) && rate > 0) {
    return { ok: true, rate };
  }
  return { ok: true, rate: null };
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
  const parsed = bigBookBulkDebtSettleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const {
    debt_entry_ids: debtIds,
    mode,
    entry_date: entryDate,
    close_debts: closeDebts,
    settlement_note: settlementNote,
    explanation: customExplanation,
    currency_code: requestedCurrency,
    amount: requestedAmount,
    settlement_conversion_rate: requestedRate
  } = parsed.data;

  const supabase = await createClient();
  const actorId = authCheck.user.id;

  const { data: debtRows, error: debtError } = await supabase
    .from("business_ledger_entries")
    .select(
      `
      id, group_id, entry_date, entry_direction, entry_type_id,
      vendor_type_id, vendor_id, action_by_id, explanation, amount, currency_code,
      responsible_actor_id, is_debt, settles_entry_id, debt_settled_at
    `
    )
    .in("id", debtIds);

  if (debtError) {
    return NextResponse.json({ error: debtError.message }, { status: 400 });
  }

  const debts = (debtRows ?? []) as DebtRow[];
  if (debts.length !== debtIds.length) {
    return NextResponse.json(
      { error: "Some selected debts no longer exist. Refresh and try again." },
      { status: 400 }
    );
  }

  for (const debt of debts) {
    if (!debt.is_debt) {
      return NextResponse.json(
        { error: "All selected entries must be open debts." },
        { status: 400 }
      );
    }
    if (debt.settles_entry_id) {
      return NextResponse.json(
        { error: "Settlement targets cannot themselves be settlements." },
        { status: 400 }
      );
    }
    if (debt.debt_settled_at) {
      return NextResponse.json(
        { error: "One or more selected debts are already settled. Refresh and try again." },
        { status: 400 }
      );
    }
  }

  const debtCurrencies = new Set(debts.map((row) => row.currency_code));
  if (mode === "single" && debtCurrencies.size > 1) {
    return NextResponse.json(
      {
        error:
          "One payment covering all debts requires the same debt currency. Pay per debt or select a single-currency set."
      },
      { status: 400 }
    );
  }

  const primary = debts[0];
  const debtCurrency = primary.currency_code;
  const settlementCurrency = requestedCurrency ?? debtCurrency;
  const settleDate = entryDate || todayIsoDate();

  const settlementIds: string[] = [];
  const closedDebtIds: string[] = [];
  const insertRows: LedgerInsertRow[] = [];
  const groupIdsByDebtId = new Map<string, string>();

  if (mode === "per_debt") {
    for (const debt of debts) {
      const grouped = await ensureDebtPaymentGroup(supabase, debt, actorId);
      if (!grouped.ok) {
        return NextResponse.json({ error: grouped.error }, { status: 400 });
      }
      groupIdsByDebtId.set(debt.id, grouped.groupId);
      // Keep in-memory debt.group_id current for any later reuse in this request.
      debt.group_id = grouped.groupId;

      const settleCurrency = requestedCurrency ?? debt.currency_code;
      const rateResult = resolveConversionRate(settleCurrency, debt.currency_code, requestedRate);
      const debtAmount = Math.abs(Number(debt.amount));
      const settlementAmount =
        settleCurrency === debt.currency_code || rateResult.rate == null
          ? debtAmount
          : computeSettlementAmountFromCredit(debtAmount, rateResult.rate);

      insertRows.push({
        group_id: grouped.groupId,
        entry_date: settleDate,
        entry_direction: "spending" as const,
        entry_type_id: debt.entry_type_id,
        vendor_type_id: debt.vendor_type_id,
        vendor_id: debt.vendor_id,
        pocket_id: null,
        action_by_id: debt.action_by_id,
        explanation:
          customExplanation?.trim() || `Debt payment for: ${debt.explanation}`,
        amount: settlementAmount,
        currency_code: settleCurrency,
        remark: null,
        responsible_actor_id: debt.responsible_actor_id,
        is_credit: false,
        is_debt: false,
        settles_entry_id: debt.id,
        settlement_conversion_rate: rateResult.rate,
        settlement_amount_in_credit_currency:
          rateResult.rate == null
            ? null
            : computeSettlementAmountInCreditCurrency(settlementAmount, rateResult.rate),
        settlement_note: settlementNote ?? null,
        created_by: actorId,
        updated_by: actorId
      });
    }
  } else {
    const grouped = await ensureDebtPaymentGroup(supabase, primary, actorId);
    if (!grouped.ok) {
      return NextResponse.json({ error: grouped.error }, { status: 400 });
    }
    groupIdsByDebtId.set(primary.id, grouped.groupId);
    primary.group_id = grouped.groupId;

    const rateResult = resolveConversionRate(settlementCurrency, debtCurrency, requestedRate);
    const totalDebtAmount = debts.reduce((sum, row) => sum + Math.abs(Number(row.amount)), 0);
    const defaultSettlementAmount =
      settlementCurrency === debtCurrency || rateResult.rate == null
        ? totalDebtAmount
        : computeSettlementAmountFromCredit(totalDebtAmount, rateResult.rate);
    const settlementAmount =
      requestedAmount != null && Number.isFinite(requestedAmount) && requestedAmount > 0
        ? requestedAmount
        : defaultSettlementAmount;

    const explanation =
      customExplanation?.trim() ||
      (debts.length === 1
        ? `Debt payment for: ${primary.explanation}`
        : `Bulk debt payment for ${debts.length} open debts`);

    insertRows.push({
      group_id: grouped.groupId,
      entry_date: settleDate,
      entry_direction: "spending",
      entry_type_id: primary.entry_type_id,
      vendor_type_id: primary.vendor_type_id,
      vendor_id: primary.vendor_id,
      pocket_id: null,
      action_by_id: primary.action_by_id,
      explanation,
      amount: settlementAmount,
      currency_code: settlementCurrency,
      remark: null,
      responsible_actor_id: primary.responsible_actor_id,
      is_credit: false,
      is_debt: false,
      settles_entry_id: primary.id,
      settlement_conversion_rate: rateResult.rate,
      settlement_amount_in_credit_currency:
        rateResult.rate == null
          ? null
          : computeSettlementAmountInCreditCurrency(settlementAmount, rateResult.rate),
      settlement_note: settlementNote ?? null,
      created_by: actorId,
      updated_by: actorId
    });
  }

  const { data: inserted, error: insertError } = await supabase
    .from("business_ledger_entries")
    .insert(insertRows)
    .select("id, settles_entry_id");

  if (insertError || !inserted?.length) {
    return NextResponse.json(
      { error: insertError?.message ?? "Failed to create debt payment entries." },
      { status: 400 }
    );
  }

  for (const row of inserted) {
    if (row.settles_entry_id) {
      settlementIds.push(row.id);
    }
  }

  if (closeDebts) {
    const now = new Date().toISOString();
    const { data: closed, error: closeError } = await supabase
      .from("business_ledger_entries")
      .update({
        debt_settled_at: now,
        debt_settled_by: actorId,
        debt_settlement_note: settlementNote ?? null,
        updated_by: actorId
      })
      .in("id", debtIds)
      .eq("is_debt", true)
      .is("debt_settled_at", null)
      .select("id");

    if (closeError) {
      return NextResponse.json({ error: closeError.message }, { status: 400 });
    }
    closedDebtIds.push(...(closed ?? []).map((row) => row.id));
  }

  return NextResponse.json({
    ok: true,
    mode,
    settlement_ids: settlementIds,
    closed_debt_ids: closedDebtIds,
    group_ids: Object.fromEntries(groupIdsByDebtId),
    settled_count: debtIds.length
  });
}
