import { NextResponse } from "next/server";
import type { createClient } from "@/lib/supabase/server";
import { calculateKursAmount, KURS_TYPE_MISSING_ERROR } from "@/lib/big-book/kurs-usdt-entry";
import { PROFIT_TYPE_MISSING_ERROR } from "@/lib/big-book/profit-entry";
import { OPTIMISTIC_CONFLICT_MESSAGE } from "@/lib/db/optimistic-lock";
import { callRpc, isMissingFunctionError, type RpcError } from "@/lib/db/required-rpc";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type CurrencyCode = "IDR" | "MYR" | "USDT" | "TRX";

/**
 * single: ONE payment allocated across the obligations, oldest first. Amount is explicit.
 * each:   one payment per obligation paying its open balance (converted by the rate).
 * Ordinary "record settlement" from the entry form is `single` with one obligation.
 */
export type SettlementPlan = { mode: "single"; amount: number } | { mode: "each" };

/**
 * anchor: descriptive fields copied from the obligation (bulk paths).
 * form:   the entry form's fields (ordinary create).
 * Direction is derived in SQL: credit → profit, debt → spending.
 */
export type PaymentContext =
  | { source: "anchor"; explanation: string | null }
  | {
      source: "form";
      entryTypeId: string;
      vendorTypeId: string | null;
      vendorId: string | null;
      pocketId: string | null;
      actionById: string | null;
      responsibleActorId: string;
      explanation: string;
      remark: string | null;
    };

export type CompanionRequest = { role: "profit" | "kurs" | "gas_fee"; amount: number };

export type SettlementCommand = {
  /** Browser-generated, stable across retries of one user action. */
  requestId: string;
  /** Distinct; order is not meaningful (SQL allocates oldest first). */
  obligationIds: readonly string[];
  plan: SettlementPlan;
  entryDate: string;
  /** Null = the obligations' currency. */
  paymentCurrency: CurrencyCode | null;
  rate: number | null;
  /** Stamp close on obligations that receive money. */
  close: { note: string | null } | null;
  settlementNote: string | null;
  context: PaymentContext;
  companions: readonly CompanionRequest[];
};

export type SettlementAllocation = { obligationId: string; appliedAmount: number };

export type SettlementPayment = {
  paymentId: string;
  amount: number;
  currency: CurrencyCode;
  allocations: readonly SettlementAllocation[];
};

export type SettlementOutcome = {
  status: "created" | "replayed";
  groupId: string | null;
  payments: readonly SettlementPayment[];
  companionIds: readonly string[];
  closedObligationIds: readonly string[];
  unallocatedObligationIds: readonly string[];
};

export type SettlementError =
  | { code: "request_id_reused" }
  | { code: "obligation_not_found"; ids: string[] }
  | { code: "not_an_obligation"; ids: string[] }
  | { code: "mixed_obligation_kinds" }
  | { code: "obligation_closed"; ids: string[] }
  | { code: "obligation_is_payment"; ids: string[] }
  | { code: "mixed_obligation_currencies" }
  | { code: "rate_required" }
  | { code: "amount_required" }
  | { code: "unknown_open_balance"; ids: string[] }
  | { code: "nothing_to_allocate" }
  | { code: "companion_type_missing"; role: "profit" | "kurs" }
  | { code: "invalid_command"; message: string }
  | { code: "not_admin" }
  | { code: "database"; message: string };

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

const SETTLEMENT_ERROR_MESSAGES: Record<
  Exclude<SettlementError["code"], "database" | "invalid_command" | "companion_type_missing">,
  string
> = {
  request_id_reused: "This request id was already used for a different settlement. Close the dialog and try again.",
  obligation_not_found: "Some selected entries no longer exist. Refresh and try again.",
  not_an_obligation: "Only credit or debt entries can be settled.",
  mixed_obligation_kinds: "Credits and debts cannot be settled together.",
  obligation_closed: "One or more selected entries are already settled. Refresh and try again.",
  obligation_is_payment: "Settlement targets cannot themselves be settlements.",
  mixed_obligation_currencies:
    "Selected entries use different currencies. Settle a single-currency set.",
  rate_required:
    "A conversion rate is required when the payment currency differs from the obligation currency.",
  amount_required: "Enter the payment amount.",
  unknown_open_balance:
    "An earlier payment on this obligation has no recorded amount in its currency, so the open balance is unknown.",
  nothing_to_allocate: "None of the selected entries has an open balance.",
  not_admin: "Admin access required."
};

function parseHint(error: RpcError): Record<string, unknown> {
  if (!error.hint) return {};
  try {
    const parsed = JSON.parse(error.hint) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function idsFrom(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
}

function parseSettlementError(error: RpcError): SettlementError {
  if (isMissingFunctionError(error, "big_book_record_settlement")) {
    return {
      code: "database",
      message: "Database function big_book_record_settlement is missing. Apply supabase migrations."
    };
  }
  const hint = parseHint(error);
  const ids = idsFrom(hint.ids);
  switch (error.message) {
    case "request_id_reused":
    case "mixed_obligation_kinds":
    case "mixed_obligation_currencies":
    case "rate_required":
    case "amount_required":
    case "nothing_to_allocate":
    case "not_admin":
      return { code: error.message };
    case "obligation_not_found":
    case "not_an_obligation":
    case "obligation_closed":
    case "obligation_is_payment":
    case "unknown_open_balance":
      return { code: error.message, ids };
    case "companion_type_missing":
      return { code: "companion_type_missing", role: hint.role === "profit" ? "profit" : "kurs" };
    case "invalid_command":
      return { code: "invalid_command", message: error.details || "Invalid settlement request." };
    default:
      return { code: "database", message: error.message || "Failed to record settlement." };
  }
}

type RawOutcome = {
  status: "created" | "replayed";
  group_id: string | null;
  payments: Array<{
    payment_id: string;
    amount: number | string;
    currency_code: CurrencyCode;
    allocations: Array<{ obligation_id: string; applied_amount: number | string }> | null;
  }>;
  companion_ids: string[];
  closed_obligation_ids: string[];
  unallocated_obligation_ids: string[];
};

function parseOutcome(raw: RawOutcome): SettlementOutcome {
  return {
    status: raw.status,
    groupId: raw.group_id ?? null,
    payments: (raw.payments ?? []).map((payment) => ({
      paymentId: payment.payment_id,
      amount: Number(payment.amount),
      currency: payment.currency_code,
      allocations: (payment.allocations ?? []).map((allocation) => ({
        obligationId: allocation.obligation_id,
        appliedAmount: Number(allocation.applied_amount)
      }))
    })),
    companionIds: raw.companion_ids ?? [],
    closedObligationIds: raw.closed_obligation_ids ?? [],
    unallocatedObligationIds: raw.unallocated_obligation_ids ?? []
  };
}

function contextToWire(context: PaymentContext) {
  if (context.source === "anchor") {
    return { source: "anchor", explanation: context.explanation };
  }
  return {
    source: "form",
    entry_type_id: context.entryTypeId,
    vendor_type_id: context.vendorTypeId,
    vendor_id: context.vendorId,
    pocket_id: context.pocketId,
    action_by_id: context.actionById,
    responsible_actor_id: context.responsibleActorId,
    explanation: context.explanation,
    remark: context.remark
  };
}

/**
 * Atomically locks the obligations, allocates, attaches the group, inserts payment(s),
 * allocations and companions, and stamps close. Repeating `requestId` with the same
 * command returns the stored outcome with status "replayed".
 */
export async function recordSettlement(
  supabase: SupabaseClient,
  command: SettlementCommand
): Promise<Result<SettlementOutcome, SettlementError>> {
  const { data, error } = await callRpc<RawOutcome>(supabase, "big_book_record_settlement", {
    p_request_id: command.requestId,
    p_mode: command.plan.mode,
    p_obligation_ids: [...command.obligationIds],
    p_entry_date: command.entryDate,
    p_currency_code: command.paymentCurrency,
    p_amount: command.plan.mode === "single" ? command.plan.amount : null,
    p_conversion_rate: command.rate,
    p_close: command.close != null,
    p_close_note: command.close?.note ?? null,
    p_settlement_note: command.settlementNote,
    p_context: contextToWire(command.context),
    p_companions: command.companions.map((companion) => ({
      role: companion.role,
      amount: companion.amount
    }))
  });
  if (error) return { ok: false, error: parseSettlementError(error) };
  if (!data) return { ok: false, error: { code: "database", message: "Settlement returned no result." } };
  return { ok: true, value: parseOutcome(data) };
}

export type DeleteEntryCommand = {
  entryId: string;
  expectedUpdatedAt: string;
  linked: { cascade: false } | { cascade: true; expectedMemberIds: readonly string[] };
};

export type DeleteEntryError =
  | { code: "entry_not_found" }
  | { code: "stale_entry"; currentUpdatedAt: string | null }
  | { code: "linked_set_requires_confirmation"; memberIds: string[] }
  | { code: "linked_set_changed"; memberIds: string[] }
  | { code: "not_admin" }
  | { code: "database"; message: string };

export type DeleteEntryOutcome = { deletedIds: string[]; cascaded: boolean };

function parseDeleteError(error: RpcError): DeleteEntryError {
  if (isMissingFunctionError(error, "big_book_delete_entry")) {
    return {
      code: "database",
      message: "Database function big_book_delete_entry is missing. Apply supabase migrations."
    };
  }
  const hint = parseHint(error);
  switch (error.message) {
    case "entry_not_found":
    case "not_admin":
      return { code: error.message };
    case "stale_entry":
      return {
        code: "stale_entry",
        currentUpdatedAt: typeof hint.current_updated_at === "string" ? hint.current_updated_at : null
      };
    case "linked_set_requires_confirmation":
    case "linked_set_changed":
      return { code: error.message, memberIds: idsFrom(hint.member_ids) };
    default:
      return { code: "database", message: error.message || "Failed to delete entry." };
  }
}

/** Deletes one entry, or its whole linked set (plus companions) when the caller confirms the members. */
export async function deleteLedgerEntry(
  supabase: SupabaseClient,
  command: DeleteEntryCommand
): Promise<Result<DeleteEntryOutcome, DeleteEntryError>> {
  const { data, error } = await callRpc<{ deleted_ids: string[]; cascaded: boolean }>(
    supabase,
    "big_book_delete_entry",
    {
      p_entry_id: command.entryId,
      p_expected_updated_at: command.expectedUpdatedAt,
      p_cascade_linked: command.linked.cascade,
      p_expected_member_ids: command.linked.cascade ? [...command.linked.expectedMemberIds] : null
    }
  );
  if (error) return { ok: false, error: parseDeleteError(error) };
  return {
    ok: true,
    value: { deletedIds: data?.deleted_ids ?? [], cascaded: Boolean(data?.cascaded) }
  };
}

/** Output of bigBookBulkSettleSchema / bigBookBulkDebtSettleSchema. */
export type BulkSettleInput = {
  client_request_id: string;
  obligation_ids: string[];
  mode: "single" | "each";
  entry_date: string;
  currency_code: CurrencyCode | null;
  amount?: number;
  settlement_conversion_rate?: number;
  close: boolean;
  settlement_note?: string | null;
  explanation?: string;
  profit_amount?: number;
  kurs_rate?: number;
  kurs_amount?: number;
};

export function settlementCommandFromBulk(input: BulkSettleInput): SettlementCommand {
  const plan: SettlementPlan =
    input.mode === "single" ? { mode: "single", amount: input.amount ?? 0 } : { mode: "each" };
  const companions: CompanionRequest[] = [];
  if (input.profit_amount != null) {
    companions.push({ role: "profit", amount: input.profit_amount });
  }
  const kursAmount =
    input.kurs_amount ??
    (plan.mode === "single" && input.kurs_rate != null
      ? calculateKursAmount(plan.amount, input.kurs_rate)
      : null);
  if (kursAmount != null) {
    companions.push({ role: "kurs", amount: kursAmount });
  }
  return {
    requestId: input.client_request_id,
    obligationIds: input.obligation_ids,
    plan,
    entryDate: input.entry_date,
    paymentCurrency: input.currency_code,
    rate: input.settlement_conversion_rate ?? null,
    close: input.close ? { note: input.settlement_note ?? null } : null,
    settlementNote: input.settlement_note ?? null,
    context: { source: "anchor", explanation: input.explanation?.trim() || null },
    companions
  };
}

/** Output of bigBookEntryInputSchema when `settles` (obligation id) is set. */
export type EntrySettleInput = {
  client_request_id: string;
  settles: string;
  entry_date: string;
  entry_type_id: string;
  vendor_type_id?: string | null;
  vendor_id?: string | null;
  pocket_id?: string | null;
  action_by_id?: string | null;
  responsible_actor_id: string;
  explanation: string;
  remark?: string | null;
  amount: number;
  currency_code: CurrencyCode;
  settlement_conversion_rate?: number | null;
  settlement_note?: string | null;
  close: boolean;
  close_note?: string | null;
  gas_fee_amount?: number;
  kurs_rate?: number;
  kurs_amount?: number;
};

export function settlementCommandFromEntryCreate(input: EntrySettleInput): SettlementCommand {
  const companions: CompanionRequest[] = [];
  const kursAmount =
    input.kurs_amount ??
    (input.kurs_rate != null ? calculateKursAmount(input.amount, input.kurs_rate) : null);
  if (kursAmount != null) {
    companions.push({ role: "kurs", amount: kursAmount });
  }
  if (input.gas_fee_amount != null) {
    companions.push({ role: "gas_fee", amount: input.gas_fee_amount });
  }
  return {
    requestId: input.client_request_id,
    obligationIds: [input.settles],
    plan: { mode: "single", amount: input.amount },
    entryDate: input.entry_date,
    paymentCurrency: input.currency_code,
    rate: input.settlement_conversion_rate ?? null,
    close: input.close ? { note: input.close_note ?? null } : null,
    settlementNote: input.settlement_note ?? null,
    context: {
      source: "form",
      entryTypeId: input.entry_type_id,
      vendorTypeId: input.vendor_type_id ?? null,
      vendorId: input.vendor_id ?? null,
      pocketId: input.pocket_id ?? null,
      actionById: input.action_by_id ?? null,
      responsibleActorId: input.responsible_actor_id,
      explanation: input.explanation,
      remark: input.remark || null
    },
    companions
  };
}

function settlementErrorStatus(code: SettlementError["code"]): number {
  switch (code) {
    case "not_admin":
      return 403;
    case "request_id_reused":
    case "obligation_not_found":
    case "obligation_closed":
      return 409;
    case "database":
      return 500;
    default:
      return 422;
  }
}

export function settlementResponse(result: Result<SettlementOutcome, SettlementError>): NextResponse {
  if (!result.ok) {
    const { error } = result;
    const message =
      error.code === "database" || error.code === "invalid_command"
        ? error.message
        : error.code === "companion_type_missing"
          ? error.role === "profit"
            ? PROFIT_TYPE_MISSING_ERROR
            : KURS_TYPE_MISSING_ERROR
          : SETTLEMENT_ERROR_MESSAGES[error.code];
    return NextResponse.json(
      { error: message, code: error.code, ...("ids" in error ? { ids: error.ids } : {}) },
      { status: settlementErrorStatus(error.code) }
    );
  }
  const outcome = result.value;
  const paymentIds = outcome.payments.map((payment) => payment.paymentId);
  return NextResponse.json({
    ok: true,
    status: outcome.status,
    id: paymentIds[0] ?? null,
    group_id: outcome.groupId,
    settlement_ids: paymentIds,
    payments: outcome.payments.map((payment) => ({
      payment_id: payment.paymentId,
      amount: payment.amount,
      currency_code: payment.currency,
      allocations: payment.allocations.map((allocation) => ({
        obligation_id: allocation.obligationId,
        applied_amount: allocation.appliedAmount
      }))
    })),
    companion_ids: outcome.companionIds,
    closed_obligation_ids: outcome.closedObligationIds,
    unallocated_obligation_ids: outcome.unallocatedObligationIds
  });
}

export function deleteResponse(result: Result<DeleteEntryOutcome, DeleteEntryError>): NextResponse {
  if (result.ok) {
    return NextResponse.json({
      ok: true,
      cascaded: result.value.cascaded,
      deleted_ids: result.value.deletedIds
    });
  }
  const { error } = result;
  switch (error.code) {
    case "entry_not_found":
      return NextResponse.json({ error: "Entry not found." }, { status: 404 });
    case "stale_entry":
      return NextResponse.json(
        {
          error: OPTIMISTIC_CONFLICT_MESSAGE,
          code: "optimistic_conflict",
          current_updated_at: error.currentUpdatedAt
        },
        { status: 409 }
      );
    case "linked_set_requires_confirmation":
      return NextResponse.json(
        {
          error: "This entry has linked settlements. Delete the linked set together.",
          code: error.code,
          member_ids: error.memberIds
        },
        { status: 409 }
      );
    case "linked_set_changed":
      return NextResponse.json(
        {
          error: "The linked settlements changed since you opened this dialog. Refresh and try again.",
          code: error.code,
          member_ids: error.memberIds
        },
        { status: 409 }
      );
    case "not_admin":
      return NextResponse.json({ error: "Admin access required.", code: error.code }, { status: 403 });
    case "database":
      return NextResponse.json({ error: error.message, code: error.code }, { status: 500 });
  }
}

export function parseIdList(value: string | null): string[] {
  if (!value) return [];
  return [...new Set(value.split(",").map((id) => id.trim()).filter(Boolean))];
}
