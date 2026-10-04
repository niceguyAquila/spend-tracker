import { buildGasFeeGroupLabel } from "@/lib/big-book/gas-fee-entry";
import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type CreditGroupTarget = {
  id: string;
  group_id: string | null;
  explanation: string;
};

/**
 * Resolve the group that should hold a credit / Future Credit settlement:
 * reuse the credit's group, or create one and attach the standalone credit.
 */
export async function ensureCreditSettlementGroup(
  supabase: SupabaseClient,
  credit: CreditGroupTarget,
  actorId: string
): Promise<
  | { ok: true; groupId: string; createdGroupId: string | null; attachedCreditId: string | null }
  | { ok: false; error: string }
> {
  if (credit.group_id) {
    return { ok: true, groupId: credit.group_id, createdGroupId: null, attachedCreditId: null };
  }

  const { data: group, error: groupError } = await supabase
    .from("business_ledger_entry_groups")
    .insert({
      label: buildGasFeeGroupLabel(credit.explanation),
      remark: null,
      created_by: actorId,
      updated_by: actorId
    })
    .select("id")
    .single();

  if (groupError || !group) {
    return {
      ok: false,
      error: groupError?.message ?? "Failed to create credit settlement group."
    };
  }

  const { data: attached, error: attachError } = await supabase
    .from("business_ledger_entries")
    .update({ group_id: group.id, updated_by: actorId })
    .eq("id", credit.id)
    .is("group_id", null)
    .select("id");

  if (attachError || !attached?.length) {
    await supabase.from("business_ledger_entry_groups").delete().eq("id", group.id);
    return {
      ok: false,
      error:
        attachError?.message ??
        "Could not attach the credit to a settlement group. Refresh and try again."
    };
  }

  return {
    ok: true,
    groupId: group.id,
    createdGroupId: group.id,
    attachedCreditId: credit.id
  };
}

/**
 * Resolve one group for bulk credit settle: reuse when every credit already
 * shares the same group, otherwise create a group and attach all selected credits.
 */
export async function ensureBulkCreditSettlementGroup(
  supabase: SupabaseClient,
  credits: CreditGroupTarget[],
  labelSource: string,
  actorId: string
): Promise<
  | {
      ok: true;
      groupId: string;
      createdGroupId: string | null;
      attachedCreditIds: string[];
    }
  | { ok: false; error: string }
> {
  if (credits.length === 0) {
    return { ok: false, error: "No credits selected for settlement grouping." };
  }

  const sharedGroupId = credits[0]?.group_id ?? null;
  const allShareSameGroup =
    sharedGroupId != null && credits.every((credit) => credit.group_id === sharedGroupId);

  if (allShareSameGroup && sharedGroupId) {
    return {
      ok: true,
      groupId: sharedGroupId,
      createdGroupId: null,
      attachedCreditIds: []
    };
  }

  const { data: group, error: groupError } = await supabase
    .from("business_ledger_entry_groups")
    .insert({
      label: buildGasFeeGroupLabel(labelSource),
      remark: null,
      created_by: actorId,
      updated_by: actorId
    })
    .select("id")
    .single();

  if (groupError || !group) {
    return {
      ok: false,
      error: groupError?.message ?? "Failed to create credit settlement group."
    };
  }

  const creditIds = credits.map((credit) => credit.id);
  const { data: attached, error: attachError } = await supabase
    .from("business_ledger_entries")
    .update({ group_id: group.id, updated_by: actorId })
    .in("id", creditIds)
    .select("id");

  if (attachError || !attached?.length || attached.length !== creditIds.length) {
    await supabase.from("business_ledger_entry_groups").delete().eq("id", group.id);
    return {
      ok: false,
      error:
        attachError?.message ??
        "Could not attach credits to a settlement group. Refresh and try again."
    };
  }

  return {
    ok: true,
    groupId: group.id,
    createdGroupId: group.id,
    attachedCreditIds: attached.map((row) => row.id as string)
  };
}

/**
 * Roll back a group created only to pair a credit with its settlement.
 * Detach attached credits first — `group_id` is ON DELETE CASCADE.
 */
export async function rollbackCreditSettlementGroup(
  supabase: SupabaseClient,
  createdGroupId: string | null,
  attachedCreditIds: string[] | string | null,
  actorId: string
) {
  if (!createdGroupId) return;
  const ids = Array.isArray(attachedCreditIds)
    ? attachedCreditIds
    : attachedCreditIds
      ? [attachedCreditIds]
      : [];
  if (ids.length) {
    await supabase
      .from("business_ledger_entries")
      .update({ group_id: null, updated_by: actorId })
      .in("id", ids);
  }
  await supabase.from("business_ledger_entry_groups").delete().eq("id", createdGroupId);
}
