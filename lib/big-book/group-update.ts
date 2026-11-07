import { NextResponse } from "next/server";
import type { createClient } from "@/lib/supabase/server";
import { callRpc, isMissingFunctionError, type RpcError } from "@/lib/db/required-rpc";
import { idsFrom, parseHint, type CurrencyCode, type Result } from "@/lib/big-book/settlement";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type GroupEntryInput = {
  entry_date: string;
  entry_direction: "spending" | "profit";
  entry_type_id: string;
  vendor_type_id?: string | null;
  vendor_id?: string | null;
  pocket_id?: string | null;
  action_by_id?: string | null;
  explanation: string;
  amount: number;
  currency_code: CurrencyCode;
  remark?: string | null;
  responsible_actor_id: string;
  is_credit?: boolean;
  is_future_credit?: boolean;
  is_debt?: boolean;
};

/** Column values for one group member; credit/debt flags are made mutually consistent. */
export function normalizeGroupEntry(payload: GroupEntryInput) {
  const isCredit = Boolean(payload.is_credit) && !payload.is_debt;
  const isFutureCredit = isCredit && Boolean(payload.is_future_credit);
  const isDebt = Boolean(payload.is_debt) && !payload.is_credit;
  return {
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
    is_debt: isDebt
  };
}

export type UpdateGroupCommand = {
  groupId: string;
  label: string;
  remark: string | null;
  /** id null = new row. Members not listed are deleted. */
  entries: ReadonlyArray<ReturnType<typeof normalizeGroupEntry> & { id: string | null }>;
  /** Members the editor loaded; null skips the check. */
  expectedEntryIds: readonly string[] | null;
};

export type UpdateGroupOutcome = { updatedIds: string[]; insertedIds: string[]; deletedIds: string[] };

export type UpdateGroupError =
  | { code: "group_not_found" }
  | { code: "group_changed"; memberIds: string[] }
  | { code: "settlement_rows_in_removal"; ids: string[] }
  | { code: "entry_not_in_group"; ids: string[] }
  | { code: "settlement_locked"; message: string }
  | { code: "invalid_command"; message: string }
  | { code: "not_admin" }
  | { code: "database"; message: string };

function parseUpdateGroupError(error: RpcError): UpdateGroupError {
  if (isMissingFunctionError(error, "big_book_update_group")) {
    return {
      code: "database",
      message:
        "Database function big_book_update_group is missing. Apply supabase migrations (202611070002_attachment_purge_and_group_update)."
    };
  }
  const hint = parseHint(error);
  switch (error.message) {
    case "group_not_found":
    case "not_admin":
      return { code: error.message };
    case "group_changed":
      return { code: "group_changed", memberIds: idsFrom(hint.member_ids) };
    case "settlement_rows_in_removal":
    case "entry_not_in_group":
      return { code: error.message, ids: idsFrom(hint.ids) };
    case "invalid_command":
      return { code: "invalid_command", message: error.details || "Invalid group update." };
    default:
      // trg_settlement_entry_guard raises PT409 with a human message when a
      // payment's amount/currency/rate/direction or a paid obligation's type changes.
      if (error.code === "PT409") {
        return { code: "settlement_locked", message: error.message || "This change is not allowed." };
      }
      return { code: "database", message: error.message || "Failed to update grouped transaction." };
  }
}

/** Saves the group edit form atomically: everything commits or nothing does. */
export async function updateLedgerGroup(
  supabase: SupabaseClient,
  command: UpdateGroupCommand
): Promise<Result<UpdateGroupOutcome, UpdateGroupError>> {
  const { data, error } = await callRpc<{ updated_ids: string[]; inserted_ids: string[]; deleted_ids: string[] }>(
    supabase,
    "big_book_update_group",
    {
      p_group_id: command.groupId,
      p_label: command.label,
      p_remark: command.remark,
      p_entries: command.entries,
      p_expected_entry_ids: command.expectedEntryIds ? [...command.expectedEntryIds] : null
    }
  );
  if (error) return { ok: false, error: parseUpdateGroupError(error) };
  return {
    ok: true,
    value: {
      updatedIds: data?.updated_ids ?? [],
      insertedIds: data?.inserted_ids ?? [],
      deletedIds: data?.deleted_ids ?? []
    }
  };
}

export function updateGroupResponse(result: Result<UpdateGroupOutcome, UpdateGroupError>): NextResponse {
  if (result.ok) {
    return NextResponse.json({
      ok: true,
      updated_ids: result.value.updatedIds,
      inserted_ids: result.value.insertedIds,
      deleted_ids: result.value.deletedIds
    });
  }
  const { error } = result;
  switch (error.code) {
    case "group_not_found":
      return NextResponse.json({ error: "Group not found.", code: error.code }, { status: 404 });
    case "group_changed":
      return NextResponse.json(
        {
          error: "The transactions in this group changed since you opened the editor. Refresh and try again.",
          code: error.code,
          member_ids: error.memberIds
        },
        { status: 409 }
      );
    case "settlement_rows_in_removal":
      return NextResponse.json(
        {
          error:
            'Some removed transactions are part of a credit/debt settlement. Use "Undo settlement" or "Delete record" on them instead of removing them from the group.',
          code: error.code,
          ids: error.ids
        },
        { status: 409 }
      );
    case "entry_not_in_group":
      return NextResponse.json(
        { error: "Some entries do not belong to this group.", code: error.code, ids: error.ids },
        { status: 400 }
      );
    case "settlement_locked":
      return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    case "invalid_command":
      return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    case "not_admin":
      return NextResponse.json({ error: "Admin access required.", code: error.code }, { status: 403 });
    case "database":
      return NextResponse.json({ error: error.message, code: error.code }, { status: 500 });
  }
}
