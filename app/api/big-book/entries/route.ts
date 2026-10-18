import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdminApi } from "@/lib/auth-api";
import { assertCsrfAndOrigin } from "@/lib/security/origin";
import {
  bigBookEntriesQuerySchema,
  bigBookEntryInputSchema,
  bigBookEntryUpdateSchema
} from "@/lib/validation/big-book";
import { buildGasFeeEntry, buildGasFeeGroupLabel } from "@/lib/big-book/gas-fee-entry";
import {
  deleteLedgerEntry,
  deleteResponse,
  parseIdList,
  recordSettlement,
  settlementCommandFromEntryCreate,
  settlementResponse
} from "@/lib/big-book/settlement";
import {
  buildKursEntry,
  findKursTypeId,
  KURS_TYPE_MISSING_ERROR,
  KURS_TYPE_NAME,
  resolveKursCompanionAmount
} from "@/lib/big-book/kurs-usdt-entry";
import {
  getBigBookActorCurrencyMetrics,
  getBigBookActorPocketMetrics,
  getBigBookEntriesPaged,
  getBigBookLedgerRowsPaged,
  getBigBookVendorActorOutstanding,
  getBigBookVendorActorFutureOutstanding,
  getBigBookVendorActorOutstandingDebt
} from "@/lib/db/queries";
import {
  parseExpectedUpdatedAt,
  resolveOptimisticMiss
} from "@/lib/db/optimistic-lock";

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
    entryId: searchParams.get("entryId") ?? "",
    page: searchParams.get("page") ?? undefined,
    pageSize: searchParams.get("pageSize") ?? undefined,
    sortBy: searchParams.get("sortBy") ?? undefined,
    sortDir: searchParams.get("sortDir") ?? undefined
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    // Metrics are independent of pagination filters — fetch in parallel so one
    // client request can refresh the table and the summary cards without a
    // full router.refresh() round trip.
    const includeMetrics = searchParams.get("includeMetrics") === "1";
    const metricsPromise = includeMetrics
      ? Promise.all([
          getBigBookActorCurrencyMetrics(),
          getBigBookActorPocketMetrics(),
          getBigBookVendorActorOutstanding(),
          getBigBookVendorActorFutureOutstanding(),
          getBigBookVendorActorOutstandingDebt()
        ])
      : null;

    if (view === "rows") {
      const [result, metrics] = await Promise.all([
        getBigBookLedgerRowsPaged(parsed.data),
        metricsPromise
      ]);
      if (!metrics) return NextResponse.json(result);
      const [
        actorMetrics,
        actorPocketMetrics,
        vendorActorOutstanding,
        vendorActorOutstandingFuture,
        vendorActorOutstandingDebt
      ] = metrics;
      return NextResponse.json({
        ...result,
        actorMetrics,
        actorPocketMetrics,
        vendorActorOutstanding,
        vendorActorOutstandingFuture,
        vendorActorOutstandingDebt
      });
    }

    const [result, metrics] = await Promise.all([
      getBigBookEntriesPaged(parsed.data),
      metricsPromise
    ]);
    if (!metrics) return NextResponse.json(result);
    const [
      actorMetrics,
      actorPocketMetrics,
      vendorActorOutstanding,
      vendorActorOutstandingFuture,
      vendorActorOutstandingDebt
    ] = metrics;
    return NextResponse.json({
      ...result,
      actorMetrics,
      actorPocketMetrics,
      vendorActorOutstanding,
      vendorActorOutstandingFuture,
      vendorActorOutstandingDebt
    });
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
  const { settles, client_request_id: clientRequestId } = parsed.data;

  if (settles && clientRequestId) {
    const result = await recordSettlement(
      supabase,
      settlementCommandFromEntryCreate({ ...parsed.data, settles, client_request_id: clientRequestId })
    );
    return settlementResponse(result);
  }

  const {
    gas_fee_amount: gasFeeAmount,
    kurs_rate: kursRate,
    kurs_amount: kursAmountInput,
    ...payload
  } = parsed.data;

  if (payload.is_debt && payload.entry_direction !== "spending") {
    return NextResponse.json(
      { error: "Debt entries must use Cash Flow Out (spending)." },
      { status: 400 }
    );
  }

  const kursAmount = resolveKursCompanionAmount({
    currencyCode: payload.currency_code,
    entryDirection: payload.entry_direction,
    mainAmount: payload.amount,
    kursRate,
    kursAmount: kursAmountInput
  });

  let kursTypeId: string | null = null;
  if (kursAmount != null) {
    const { data: kursTypes, error: kursTypeError } = await supabase
      .from("business_ledger_types")
      .select("id, name, is_active")
      .ilike("name", KURS_TYPE_NAME);

    if (kursTypeError) {
      return NextResponse.json({ error: kursTypeError.message }, { status: 400 });
    }
    kursTypeId = findKursTypeId(kursTypes ?? []);
    if (!kursTypeId) {
      return NextResponse.json({ error: KURS_TYPE_MISSING_ERROR }, { status: 400 });
    }
  }

  const needsCompanions = gasFeeAmount != null || kursAmount != null;

  let groupId: string | null = null;
  if (needsCompanions) {
    const { data: group, error: groupError } = await supabase
      .from("business_ledger_entry_groups")
      .insert({
        label: buildGasFeeGroupLabel(payload.explanation),
        remark: null,
        created_by: actorId,
        updated_by: actorId
      })
      .select("id")
      .single();

    if (groupError || !group) {
      return NextResponse.json(
        { error: groupError?.message ?? "Failed to create companion entry group." },
        { status: 400 }
      );
    }
    groupId = group.id;
  }

  const isCredit = Boolean(payload.is_credit);
  const isFutureCredit = isCredit && Boolean(payload.is_future_credit);
  const isDebt = isCredit ? false : Boolean(payload.is_debt);

  const mainRow = {
    group_id: groupId,
    entry_date: payload.entry_date,
    entry_direction: payload.entry_direction,
    entry_type_id: payload.entry_type_id,
    vendor_type_id: payload.vendor_type_id ?? null,
    vendor_id: payload.vendor_id ?? null,
    pocket_id: payload.pocket_id ?? null,
    action_by_id: payload.action_by_id ?? null,
    explanation: payload.explanation,
    amount: payload.amount,
    currency_code: payload.currency_code,
    remark: payload.remark || null,
    responsible_actor_id: payload.responsible_actor_id,
    is_credit: isCredit,
    is_future_credit: isFutureCredit,
    is_debt: isDebt,
    created_by: actorId,
    updated_by: actorId
  };

  let createdEntryId: string;

  async function rollbackCreatedGroup() {
    if (groupId) {
      await supabase.from("business_ledger_entry_groups").delete().eq("id", groupId);
    }
  }

  if (groupId && needsCompanions) {
    const companionRows: Array<Record<string, unknown>> = [];

    if (kursAmount != null && kursTypeId) {
      const kursEntry = buildKursEntry(payload, kursTypeId, kursAmount);
      companionRows.push({
        group_id: groupId,
        entry_date: kursEntry.entry_date,
        entry_direction: kursEntry.entry_direction,
        entry_type_id: kursEntry.entry_type_id,
        vendor_type_id: kursEntry.vendor_type_id,
        vendor_id: kursEntry.vendor_id,
        pocket_id: kursEntry.pocket_id,
        action_by_id: kursEntry.action_by_id,
        explanation: kursEntry.explanation,
        amount: kursEntry.amount,
        currency_code: kursEntry.currency_code,
        remark: kursEntry.remark || null,
        responsible_actor_id: kursEntry.responsible_actor_id,
        is_credit: false,
        is_future_credit: false,
        is_debt: false,
        created_by: actorId,
        updated_by: actorId
      });
    }

    if (gasFeeAmount != null) {
      const gasEntry = buildGasFeeEntry(payload, gasFeeAmount);
      companionRows.push({
        group_id: groupId,
        entry_date: gasEntry.entry_date,
        entry_direction: gasEntry.entry_direction,
        entry_type_id: gasEntry.entry_type_id,
        vendor_type_id: gasEntry.vendor_type_id,
        vendor_id: gasEntry.vendor_id,
        pocket_id: gasEntry.pocket_id,
        action_by_id: gasEntry.action_by_id,
        explanation: gasEntry.explanation,
        amount: gasEntry.amount,
        currency_code: gasEntry.currency_code,
        remark: gasEntry.remark || null,
        responsible_actor_id: gasEntry.responsible_actor_id,
        is_credit: false,
        is_future_credit: false,
        is_debt: false,
        created_by: actorId,
        updated_by: actorId
      });
    }

    const { data: inserted, error } = await supabase
      .from("business_ledger_entries")
      .insert([mainRow, ...companionRows])
      .select("id");

    if (error || !inserted?.[0]) {
      await rollbackCreatedGroup();
      return NextResponse.json(
        { error: error?.message ?? "Failed to create ledger entry." },
        { status: 400 }
      );
    }
    createdEntryId = inserted[0].id;
  } else {
    const { data, error } = await supabase.from("business_ledger_entries").insert(mainRow).select("id").single();

    if (error || !data) {
      await rollbackCreatedGroup();
      return NextResponse.json({ error: error?.message ?? "Failed to create ledger entry." }, { status: 400 });
    }
    createdEntryId = data.id;
  }

  return NextResponse.json({ id: createdEntryId });
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

  const { id, expected_updated_at, ...payload } = parsed.data;
  const supabase = await createClient();

  if (payload.is_debt && payload.entry_direction !== "spending") {
    return NextResponse.json(
      { error: "Debt entries must use Cash Flow Out (spending)." },
      { status: 400 }
    );
  }

  const isCredit = Boolean(payload.is_credit);
  const isFutureCredit = isCredit && Boolean(payload.is_future_credit);
  const isDebt = isCredit ? false : Boolean(payload.is_debt);

  // Payment amount, currency, rate and links are fixed once allocated (database guard);
  // retargeting a settlement is delete + record again.
  const { data: updated, error } = await supabase
    .from("business_ledger_entries")
    .update({
      entry_date: payload.entry_date,
      entry_direction: payload.entry_direction,
      entry_type_id: payload.entry_type_id,
      vendor_type_id: payload.vendor_type_id ?? null,
      vendor_id: payload.vendor_id ?? null,
      pocket_id: payload.pocket_id ?? null,
      action_by_id: payload.action_by_id ?? null,
      explanation: payload.explanation,
      amount: payload.amount,
      currency_code: payload.currency_code,
      remark: payload.remark || null,
      responsible_actor_id: payload.responsible_actor_id,
      is_credit: isCredit,
      is_future_credit: isFutureCredit,
      is_debt: isDebt,
      updated_by: authCheck.user.id
    })
    .eq("id", id)
    .eq("updated_at", expected_updated_at)
    .select("id, updated_at")
    .maybeSingle();

  if (error) {
    const status = error.code === "PT409" ? 409 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }
  if (!updated) {
    const { data: existing } = await supabase
      .from("business_ledger_entries")
      .select("id, updated_at")
      .eq("id", id)
      .maybeSingle();
    return resolveOptimisticMiss({ existing });
  }
  return NextResponse.json({ ok: true, updated_at: updated.updated_at });
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
  const expectedUpdatedAt = parseExpectedUpdatedAt(searchParams.get("expected_updated_at"));
  if (!expectedUpdatedAt.ok) {
    return expectedUpdatedAt.response;
  }
  const cascadeLinked = searchParams.get("cascadeLinked") === "1";

  const supabase = await createClient();
  const result = await deleteLedgerEntry(supabase, {
    entryId: id,
    expectedUpdatedAt: expectedUpdatedAt.value,
    linked: cascadeLinked
      ? { cascade: true, expectedMemberIds: parseIdList(searchParams.get("linkedSet")) }
      : { cascade: false }
  });
  return deleteResponse(result);
}
