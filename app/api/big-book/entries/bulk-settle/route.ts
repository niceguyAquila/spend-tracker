import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdminApi } from "@/lib/auth-api";
import { assertCsrfAndOrigin } from "@/lib/security/origin";
import {
  computeSettlementAmountFromCredit,
  computeSettlementAmountInCreditCurrency,
  computeUsdtSettleAmountWithProfit
} from "@/lib/big-book/credit";
import {
  ensureBulkCreditSettlementGroup,
  rollbackCreditSettlementGroup
} from "@/lib/big-book/credit-settlement-group";
import {
  buildKursEntry,
  findKursTypeId,
  KURS_TYPE_MISSING_ERROR,
  KURS_TYPE_NAME,
  resolveKursCompanionAmount
} from "@/lib/big-book/kurs-usdt-entry";
import {
  buildProfitEntry,
  findProfitTypeId,
  PROFIT_TYPE_MISSING_ERROR,
  PROFIT_TYPE_NAME
} from "@/lib/big-book/profit-entry";
import { bigBookBulkSettleSchema } from "@/lib/validation/big-book";

type CreditCurrency = "IDR" | "MYR" | "USDT" | "TRX";

type CreditRow = {
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
  currency_code: CreditCurrency;
  responsible_actor_id: string;
  is_credit: boolean;
  is_future_credit: boolean;
  settles_entry_id: string | null;
  credit_settled_at: string | null;
};

type LedgerInsertRow = Record<string, unknown>;

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function resolveConversionRate(
  settlementCurrency: CreditCurrency,
  creditCurrency: CreditCurrency,
  requestedRate: number | undefined
): { ok: true; rate: number | null } {
  if (settlementCurrency === creditCurrency) {
    return { ok: true, rate: 1 };
  }
  const rate = Number(requestedRate);
  if (Number.isFinite(rate) && rate > 0) {
    return { ok: true, rate };
  }
  // Cross-currency FX rate / credit-currency equivalent are optional.
  return { ok: true, rate: null };
}

async function lookupTypeIdByName(
  supabase: Awaited<ReturnType<typeof createClient>>,
  typeName: string
): Promise<{ ok: true; id: string | null } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("business_ledger_types")
    .select("id, name, is_active")
    .ilike("name", typeName);

  if (error) {
    return { ok: false, error: error.message };
  }

  if (typeName.toLowerCase() === KURS_TYPE_NAME.toLowerCase()) {
    return { ok: true, id: findKursTypeId(data ?? []) };
  }
  if (typeName.toLowerCase() === PROFIT_TYPE_NAME.toLowerCase()) {
    return { ok: true, id: findProfitTypeId(data ?? []) };
  }
  return { ok: true, id: null };
}

function companionLedgerRow(
  payload: {
    entry_date: string;
    entry_direction: "spending" | "profit";
    entry_type_id: string;
    vendor_type_id: string | null;
    vendor_id: string | null;
    pocket_id: null;
    action_by_id: string | null;
    explanation: string;
    amount: number;
    currency_code: string;
    remark: string;
    responsible_actor_id: string;
  },
  groupId: string | null,
  actorId: string
): LedgerInsertRow {
  return {
    group_id: groupId,
    entry_date: payload.entry_date,
    entry_direction: payload.entry_direction,
    entry_type_id: payload.entry_type_id,
    vendor_type_id: payload.vendor_type_id,
    vendor_id: payload.vendor_id,
    pocket_id: payload.pocket_id,
    action_by_id: payload.action_by_id,
    explanation: payload.explanation,
    amount: payload.amount,
    currency_code: payload.currency_code,
    remark: payload.remark || null,
    responsible_actor_id: payload.responsible_actor_id,
    is_credit: false,
    is_debt: false,
    settles_entry_id: null,
    settlement_conversion_rate: null,
    settlement_amount_in_credit_currency: null,
    settlement_note: null,
    created_by: actorId,
    updated_by: actorId
  };
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
    explanation: customExplanation,
    currency_code: requestedCurrency,
    amount: requestedAmount,
    settlement_conversion_rate: requestedRate,
    profit_amount: profitAmountInput,
    kurs_rate: kursRate,
    kurs_amount: kursAmountInput
  } = parsed.data;

  const supabase = await createClient();
  const actorId = authCheck.user.id;
  const profitAmount =
    profitAmountInput != null && Number.isFinite(profitAmountInput) && profitAmountInput > 0
      ? profitAmountInput
      : null;

  const { data: creditRows, error: creditError } = await supabase
    .from("business_ledger_entries")
    .select(
      `
      id, group_id, entry_date, entry_direction, entry_type_id,
      vendor_type_id, vendor_id, action_by_id, explanation, amount, currency_code,
      responsible_actor_id, is_credit, is_future_credit, settles_entry_id, credit_settled_at
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

  const creditCurrencies = new Set(credits.map((row) => row.currency_code));
  if (mode === "single" && creditCurrencies.size > 1) {
    return NextResponse.json(
      {
        error:
          "One settlement covering all credits requires the same credit currency. Settle per credit or select a single-currency set."
      },
      { status: 400 }
    );
  }

  if (profitAmount != null && creditCurrencies.size > 1) {
    return NextResponse.json(
      {
        error:
          "PROFIT requires a single credit currency so the surcharge matches the credits. Select a single-currency set."
      },
      { status: 400 }
    );
  }

  const primary = credits[0];
  const creditCurrency = primary.currency_code;
  const settlementCurrency = requestedCurrency ?? creditCurrency;
  const settleDate = entryDate || todayIsoDate();

  const wantsKurs =
    settlementCurrency === "USDT" && (kursRate != null || kursAmountInput != null);

  let profitTypeId: string | null = null;
  if (profitAmount != null) {
    const profitLookup = await lookupTypeIdByName(supabase, PROFIT_TYPE_NAME);
    if (!profitLookup.ok) {
      return NextResponse.json({ error: profitLookup.error }, { status: 400 });
    }
    profitTypeId = profitLookup.id;
    if (!profitTypeId) {
      return NextResponse.json({ error: PROFIT_TYPE_MISSING_ERROR }, { status: 400 });
    }
  }

  let kursTypeId: string | null = null;
  if (wantsKurs) {
    const kursLookup = await lookupTypeIdByName(supabase, KURS_TYPE_NAME);
    if (!kursLookup.ok) {
      return NextResponse.json({ error: kursLookup.error }, { status: 400 });
    }
    kursTypeId = kursLookup.id;
    if (!kursTypeId) {
      return NextResponse.json({ error: KURS_TYPE_MISSING_ERROR }, { status: 400 });
    }
  }

  const settlementIds: string[] = [];
  const closedCreditIds: string[] = [];
  const companionIds: string[] = [];

  const labelSource =
    customExplanation?.trim() ||
    (credits.length === 1
      ? `Settlement for: ${primary.explanation}`
      : `Bulk settlement for ${credits.length} open credits`);

  const grouped = await ensureBulkCreditSettlementGroup(
    supabase,
    credits.map((credit) => ({
      id: credit.id,
      group_id: credit.group_id,
      explanation: credit.explanation
    })),
    labelSource,
    actorId
  );
  if (!grouped.ok) {
    return NextResponse.json({ error: grouped.error }, { status: 400 });
  }
  const groupId = grouped.groupId;
  const createdGroupId = grouped.createdGroupId;
  const attachedCreditIds = grouped.attachedCreditIds;

  async function rollbackCreatedGroup() {
    await rollbackCreditSettlementGroup(
      supabase,
      createdGroupId,
      attachedCreditIds,
      actorId
    );
  }

  const insertRows: LedgerInsertRow[] = [];

  if (mode === "per_credit") {
    const settlementRows: LedgerInsertRow[] = [];
    let totalSettlementAmount = 0;

    for (const credit of credits) {
      const settleCurrency = requestedCurrency ?? credit.currency_code;
      const rateResult = resolveConversionRate(
        settleCurrency,
        credit.currency_code,
        requestedRate
      );
      const creditAmount = Math.abs(Number(credit.amount));
      // App convention: settlement_amount = credit_amount / rate when currencies differ.
      // Without an optional FX rate, keep the credit's numeric amount as the settle amount.
      // PROFIT is a separate companion; per-credit settle amounts stay credit-only.
      const settlementAmount =
        settleCurrency === credit.currency_code || rateResult.rate == null
          ? creditAmount
          : computeSettlementAmountFromCredit(creditAmount, rateResult.rate);
      totalSettlementAmount += settlementAmount;

      settlementRows.push({
        group_id: groupId,
        entry_date: settleDate,
        entry_direction: "profit" as const,
        entry_type_id: credit.entry_type_id,
        vendor_type_id: credit.vendor_type_id,
        vendor_id: credit.vendor_id,
        pocket_id: null,
        action_by_id: credit.action_by_id,
        explanation:
          customExplanation?.trim() ||
          `Settlement for: ${credit.explanation}`,
        amount: settlementAmount,
        currency_code: settleCurrency,
        remark: null,
        responsible_actor_id: credit.responsible_actor_id,
        is_credit: false,
        is_debt: false,
        settles_entry_id: credit.id,
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

    insertRows.push(...settlementRows);

    if (profitAmount != null && profitTypeId) {
      const explanation =
        customExplanation?.trim() ||
        (credits.length === 1
          ? `Settlement for: ${primary.explanation}`
          : `Bulk settlement for ${credits.length} open credits`);
      const profitPayload = buildProfitEntry(
        {
          entry_date: settleDate,
          vendor_type_id: primary.vendor_type_id,
          vendor_id: primary.vendor_id,
          action_by_id: primary.action_by_id,
          explanation,
          responsible_actor_id: primary.responsible_actor_id
        },
        profitTypeId,
        profitAmount,
        creditCurrency
      );
      insertRows.push(companionLedgerRow(profitPayload, groupId, actorId));
    }

    if (wantsKurs && kursTypeId) {
      const kursAmount = resolveKursCompanionAmount({
        currencyCode: "USDT",
        entryDirection: "profit",
        mainAmount: totalSettlementAmount,
        kursRate,
        kursAmount: kursAmountInput
      });
      if (kursAmount != null) {
        const explanation =
          customExplanation?.trim() ||
          (credits.length === 1
            ? `Settlement for: ${primary.explanation}`
            : `Bulk settlement for ${credits.length} open credits`);
        const kursPayload = buildKursEntry(
          {
            entry_date: settleDate,
            entry_direction: "profit",
            entry_type_id: primary.entry_type_id,
            vendor_type_id: primary.vendor_type_id,
            vendor_id: primary.vendor_id,
            action_by_id: primary.action_by_id,
            explanation,
            amount: totalSettlementAmount,
            currency_code: "USDT",
            responsible_actor_id: primary.responsible_actor_id
          },
          kursTypeId,
          kursAmount
        );
        insertRows.push(companionLedgerRow(kursPayload, groupId, actorId));
      }
    }

    const { data: inserted, error: insertError } = await supabase
      .from("business_ledger_entries")
      .insert(insertRows)
      .select("id, settles_entry_id, entry_type_id");

    if (insertError || !inserted?.length) {
      await rollbackCreatedGroup();
      return NextResponse.json(
        { error: insertError?.message ?? "Failed to create settlement entries." },
        { status: 400 }
      );
    }

    for (const row of inserted) {
      if (row.settles_entry_id) {
        settlementIds.push(row.id);
      } else {
        companionIds.push(row.id);
      }
    }
  } else {
    // One settlement covering all selected credits (same credit currency).
    const rateResult = resolveConversionRate(settlementCurrency, creditCurrency, requestedRate);

    const totalCreditAmount = credits.reduce(
      (sum, row) => sum + Math.abs(Number(row.amount)),
      0
    );

    let defaultSettlementAmount: number;
    if (settlementCurrency === creditCurrency || rateResult.rate == null) {
      // Same-currency / no FX: settle the credit base; PROFIT is a separate companion.
      defaultSettlementAmount = totalCreditAmount;
    } else if (settlementCurrency === "USDT") {
      // USDT FX path: A = (base + profit) / rate
      defaultSettlementAmount = computeUsdtSettleAmountWithProfit(
        totalCreditAmount,
        profitAmount ?? 0,
        rateResult.rate
      );
    } else {
      defaultSettlementAmount = computeSettlementAmountFromCredit(
        totalCreditAmount,
        rateResult.rate
      );
    }

    const settlementAmount =
      requestedAmount != null && Number.isFinite(requestedAmount) && requestedAmount > 0
        ? requestedAmount
        : defaultSettlementAmount;

    const explanation =
      customExplanation?.trim() ||
      (credits.length === 1
        ? `Settlement for: ${primary.explanation}`
        : `Bulk settlement for ${credits.length} open credits`);

    insertRows.push({
      group_id: groupId,
      entry_date: settleDate,
      entry_direction: "profit",
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

    if (profitAmount != null && profitTypeId) {
      const profitPayload = buildProfitEntry(
        {
          entry_date: settleDate,
          vendor_type_id: primary.vendor_type_id,
          vendor_id: primary.vendor_id,
          action_by_id: primary.action_by_id,
          explanation,
          responsible_actor_id: primary.responsible_actor_id
        },
        profitTypeId,
        profitAmount,
        creditCurrency
      );
      insertRows.push(companionLedgerRow(profitPayload, groupId, actorId));
    }

    if (wantsKurs && kursTypeId) {
      const kursAmount = resolveKursCompanionAmount({
        currencyCode: "USDT",
        entryDirection: "profit",
        mainAmount: settlementAmount,
        kursRate,
        kursAmount: kursAmountInput
      });
      if (kursAmount != null) {
        const kursPayload = buildKursEntry(
          {
            entry_date: settleDate,
            entry_direction: "profit",
            entry_type_id: primary.entry_type_id,
            vendor_type_id: primary.vendor_type_id,
            vendor_id: primary.vendor_id,
            action_by_id: primary.action_by_id,
            explanation,
            amount: settlementAmount,
            currency_code: "USDT",
            responsible_actor_id: primary.responsible_actor_id
          },
          kursTypeId,
          kursAmount
        );
        insertRows.push(companionLedgerRow(kursPayload, groupId, actorId));
      }
    }

    const { data: inserted, error: insertError } = await supabase
      .from("business_ledger_entries")
      .insert(insertRows)
      .select("id, settles_entry_id");

    if (insertError || !inserted?.length) {
      await rollbackCreatedGroup();
      return NextResponse.json(
        { error: insertError?.message ?? "Failed to create settlement entry." },
        { status: 400 }
      );
    }

    for (const row of inserted) {
      if (row.settles_entry_id) {
        settlementIds.push(row.id);
      } else {
        companionIds.push(row.id);
      }
    }
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
    companion_ids: companionIds,
    group_id: groupId,
    closed_credit_ids: closedCreditIds,
    settled_count: creditIds.length
  });
}
