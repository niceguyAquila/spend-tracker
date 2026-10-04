import { buildGasFeeGroupLabel } from "@/lib/big-book/gas-fee-entry";
import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type DebtGroupTarget = {
  id: string;
  group_id: string | null;
  explanation: string;
};

/**
 * Resolve the group that should hold a debt payment:
 * reuse the debt's group, or create one and attach the standalone debt.
 */
export async function ensureDebtPaymentGroup(
  supabase: SupabaseClient,
  debt: DebtGroupTarget,
  actorId: string
): Promise<
  | { ok: true; groupId: string; createdGroupId: string | null; attachedDebtId: string | null }
  | { ok: false; error: string }
> {
  if (debt.group_id) {
    return { ok: true, groupId: debt.group_id, createdGroupId: null, attachedDebtId: null };
  }

  const { data: group, error: groupError } = await supabase
    .from("business_ledger_entry_groups")
    .insert({
      label: buildGasFeeGroupLabel(debt.explanation),
      remark: null,
      created_by: actorId,
      updated_by: actorId
    })
    .select("id")
    .single();

  if (groupError || !group) {
    return { ok: false, error: groupError?.message ?? "Failed to create debt payment group." };
  }

  const { data: attached, error: attachError } = await supabase
    .from("business_ledger_entries")
    .update({ group_id: group.id, updated_by: actorId })
    .eq("id", debt.id)
    .is("group_id", null)
    .select("id");

  if (attachError || !attached?.length) {
    await supabase.from("business_ledger_entry_groups").delete().eq("id", group.id);
    return {
      ok: false,
      error:
        attachError?.message ??
        "Could not attach the debt to a payment group. Refresh and try again."
    };
  }

  return {
    ok: true,
    groupId: group.id,
    createdGroupId: group.id,
    attachedDebtId: debt.id
  };
}

/**
 * Roll back a group created only to pair a debt with its payment.
 * Detach the debt first — `group_id` is ON DELETE CASCADE.
 */
export async function rollbackDebtPaymentGroup(
  supabase: SupabaseClient,
  createdGroupId: string | null,
  attachedDebtId: string | null,
  actorId: string
) {
  if (!createdGroupId) return;
  if (attachedDebtId) {
    await supabase
      .from("business_ledger_entries")
      .update({ group_id: null, updated_by: actorId })
      .eq("id", attachedDebtId);
  }
  await supabase.from("business_ledger_entry_groups").delete().eq("id", createdGroupId);
}
