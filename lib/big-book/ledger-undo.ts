import { NextResponse } from "next/server";
import type { createClient } from "@/lib/supabase/server";
import { callRpc, isMissingFunctionError, type RpcError } from "@/lib/db/required-rpc";
import { idsFrom, parseHint, type CurrencyCode, type Result } from "@/lib/big-book/settlement";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

const MIGRATION_HINT = "Apply supabase migrations (202611070001_group_delete_and_settlement_revert).";

// ---------------------------------------------------------------------------
// Group delete
// ---------------------------------------------------------------------------

export type DeleteGroupCommand = {
  groupId: string;
  /** Group entry ids the caller showed; null skips the membership check. */
  expectedEntryIds: readonly string[] | null;
  linked: { cascade: false } | { cascade: true; expectedLinkedIds: readonly string[] };
};

export type DeleteGroupOutcome = { deletedIds: string[]; linkedIds: string[] };

export type DeleteGroupError =
  | { code: "group_not_found" }
  | { code: "group_changed"; memberIds: string[] }
  | { code: "linked_set_requires_confirmation"; memberIds: string[] }
  | { code: "linked_set_changed"; memberIds: string[] }
  | { code: "not_admin" }
  | { code: "database"; message: string };

function parseDeleteGroupError(error: RpcError): DeleteGroupError {
  if (isMissingFunctionError(error, "big_book_delete_group")) {
    return { code: "database", message: `Database function big_book_delete_group is missing. ${MIGRATION_HINT}` };
  }
  const hint = parseHint(error);
  switch (error.message) {
    case "group_not_found":
    case "not_admin":
      return { code: error.message };
    case "group_changed":
    case "linked_set_requires_confirmation":
    case "linked_set_changed":
      return { code: error.message, memberIds: idsFrom(hint.member_ids) };
    default:
      return { code: "database", message: error.message || "Failed to delete grouped transaction." };
  }
}

/**
 * Deletes a group and its entries in one transaction. Allocations are removed
 * before entries, and settlement rows linked from outside the group are only
 * deleted when the caller confirms exactly which ones.
 */
export async function deleteLedgerGroup(
  supabase: SupabaseClient,
  command: DeleteGroupCommand
): Promise<Result<DeleteGroupOutcome, DeleteGroupError>> {
  const { data, error } = await callRpc<{ deleted_ids: string[]; linked_ids: string[] }>(
    supabase,
    "big_book_delete_group",
    {
      p_group_id: command.groupId,
      p_expected_entry_ids: command.expectedEntryIds ? [...command.expectedEntryIds] : null,
      p_cascade_linked: command.linked.cascade,
      p_expected_linked_ids: command.linked.cascade ? [...command.linked.expectedLinkedIds] : null
    }
  );
  if (error) return { ok: false, error: parseDeleteGroupError(error) };
  return {
    ok: true,
    value: { deletedIds: data?.deleted_ids ?? [], linkedIds: data?.linked_ids ?? [] }
  };
}

export function deleteGroupResponse(result: Result<DeleteGroupOutcome, DeleteGroupError>): NextResponse {
  if (result.ok) {
    return NextResponse.json({
      ok: true,
      deleted_ids: result.value.deletedIds,
      linked_ids: result.value.linkedIds
    });
  }
  const { error } = result;
  switch (error.code) {
    case "group_not_found":
      return NextResponse.json({ error: "Group not found.", code: error.code }, { status: 404 });
    case "group_changed":
      return NextResponse.json(
        {
          error: "The transactions in this group changed since you opened this dialog. Refresh and try again.",
          code: error.code,
          member_ids: error.memberIds
        },
        { status: 409 }
      );
    case "linked_set_requires_confirmation":
      return NextResponse.json(
        {
          error: "This group is linked to settlement records outside the group. Delete them together.",
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

// ---------------------------------------------------------------------------
// Settlement undo
// ---------------------------------------------------------------------------

/** Identify a settlement by its request id, or by one of its payment rows. */
export type SettlementRef = { requestId: string } | { paymentId: string };

export type RevertPlanEntry = {
  id: string;
  entry_date: string;
  explanation: string;
  amount: number;
  currency_code: CurrencyCode;
  entry_direction: "spending" | "profit";
};

export type RevertPlanObligation = {
  id: string;
  entry_date: string;
  explanation: string;
  amount: number;
  currency_code: CurrencyCode;
  is_debt: boolean;
  is_future_credit: boolean;
  applied_amount: number | null;
  /** True when this settlement closed it; undo reopens it. */
  reopen: boolean;
  /** True when this settlement moved it into its group; undo moves it back. */
  restore_group: boolean;
  /** Null with restore_group = becomes standalone. */
  restore_group_id: string | null;
  restore_group_label: string | null;
};

export type SettlementRevertPlan = {
  request_id: string | null;
  /** Recorded before settlement requests existed: single payment, no closure/group changes. */
  legacy: boolean;
  kind: "credit" | "debt" | null;
  recorded_at: string | null;
  /** Payments + companions; send back as expected_entry_ids. */
  entry_ids: string[];
  payments: RevertPlanEntry[];
  companions: RevertPlanEntry[];
  obligations: RevertPlanObligation[];
  group: {
    id: string;
    label: string;
    created_by_settlement: boolean;
    delete_after_revert: boolean;
  } | null;
};

export type RevertOutcome = {
  requestId: string | null;
  deletedIds: string[];
  reopenedIds: string[];
  regroupedIds: string[];
  groupId: string | null;
  groupDeleted: boolean;
};

export type RevertError =
  | { code: "invalid_command"; message: string }
  | { code: "not_a_settlement" }
  | { code: "settlement_not_found" }
  | { code: "settlement_already_reverted" }
  | { code: "settlement_changed"; entryIds: string[] }
  | { code: "not_admin" }
  | { code: "database"; message: string };

function parseRevertError(error: RpcError, fn: string): RevertError {
  if (isMissingFunctionError(error, fn)) {
    return { code: "database", message: `Database function ${fn} is missing. ${MIGRATION_HINT}` };
  }
  const hint = parseHint(error);
  switch (error.message) {
    case "not_a_settlement":
    case "settlement_not_found":
    case "settlement_already_reverted":
    case "not_admin":
      return { code: error.message };
    case "settlement_changed":
      return { code: "settlement_changed", entryIds: idsFrom(hint.entry_ids) };
    case "invalid_command":
      return { code: "invalid_command", message: error.details || "Invalid undo request." };
    default:
      return { code: "database", message: error.message || "Failed to undo settlement." };
  }
}

function refToArgs(ref: SettlementRef) {
  return "requestId" in ref
    ? { p_request_id: ref.requestId, p_payment_id: null }
    : { p_request_id: null, p_payment_id: ref.paymentId };
}

function toNumberOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizePlan(raw: SettlementRevertPlan): SettlementRevertPlan {
  const entry = (row: RevertPlanEntry): RevertPlanEntry => ({ ...row, amount: Number(row.amount) });
  return {
    ...raw,
    entry_ids: raw.entry_ids ?? [],
    payments: (raw.payments ?? []).map(entry),
    companions: (raw.companions ?? []).map(entry),
    obligations: (raw.obligations ?? []).map((row) => ({
      ...row,
      amount: Number(row.amount),
      applied_amount: toNumberOrNull(row.applied_amount)
    })),
    group: raw.group ?? null
  };
}

export async function planSettlementRevert(
  supabase: SupabaseClient,
  ref: SettlementRef
): Promise<Result<SettlementRevertPlan, RevertError>> {
  const { data, error } = await callRpc<SettlementRevertPlan>(
    supabase,
    "big_book_settlement_revert_plan",
    refToArgs(ref)
  );
  if (error) return { ok: false, error: parseRevertError(error, "big_book_settlement_revert_plan") };
  if (!data) return { ok: false, error: { code: "database", message: "Undo preview returned no result." } };
  return { ok: true, value: normalizePlan(data) };
}

export async function revertSettlement(
  supabase: SupabaseClient,
  command: { ref: SettlementRef; expectedEntryIds: readonly string[]; reason: string | null }
): Promise<Result<RevertOutcome, RevertError>> {
  const { data, error } = await callRpc<{
    request_id: string | null;
    deleted_ids: string[];
    reopened_ids: string[];
    regrouped_ids: string[];
    group_id: string | null;
    group_deleted: boolean;
  }>(supabase, "big_book_revert_settlement", {
    ...refToArgs(command.ref),
    p_expected_entry_ids: [...command.expectedEntryIds],
    p_reason: command.reason
  });
  if (error) return { ok: false, error: parseRevertError(error, "big_book_revert_settlement") };
  return {
    ok: true,
    value: {
      requestId: data?.request_id ?? null,
      deletedIds: data?.deleted_ids ?? [],
      reopenedIds: data?.reopened_ids ?? [],
      regroupedIds: data?.regrouped_ids ?? [],
      groupId: data?.group_id ?? null,
      groupDeleted: Boolean(data?.group_deleted)
    }
  };
}

const REVERT_ERROR_MESSAGES: Record<Exclude<RevertError["code"], "database" | "invalid_command">, string> = {
  not_a_settlement: "This entry is not a settlement payment.",
  settlement_not_found: "This settlement no longer exists. Refresh and try again.",
  settlement_already_reverted: "This settlement was already undone. Refresh to see the current state.",
  settlement_changed: "This settlement changed since you opened this dialog. Refresh and try again.",
  not_admin: "Admin access required."
};

function revertErrorStatus(code: RevertError["code"]): number {
  switch (code) {
    case "not_admin":
      return 403;
    case "settlement_not_found":
      return 404;
    case "settlement_already_reverted":
    case "settlement_changed":
      return 409;
    case "database":
      return 500;
    default:
      return 422;
  }
}

export function revertErrorResponse(error: RevertError): NextResponse {
  const message =
    error.code === "database" || error.code === "invalid_command" ? error.message : REVERT_ERROR_MESSAGES[error.code];
  return NextResponse.json(
    { error: message, code: error.code, ...(error.code === "settlement_changed" ? { entry_ids: error.entryIds } : {}) },
    { status: revertErrorStatus(error.code) }
  );
}
