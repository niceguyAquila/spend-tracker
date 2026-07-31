import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdminApi } from "@/lib/auth-api";
import { assertCsrfAndOrigin } from "@/lib/security/origin";
import { bigBookGroupAssignSchema } from "@/lib/validation/big-book";

export async function POST(request: Request) {
  if (!(await assertCsrfAndOrigin(request))) {
    return NextResponse.json({ error: "Invalid request origin or CSRF token." }, { status: 403 });
  }

  const authCheck = await requireAdminApi();
  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.message }, { status: authCheck.status });
  }

  const body = await request.json();
  const parsed = bigBookGroupAssignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createClient();
  const actorId = authCheck.user.id;
  const { label, remark, entry_ids: entryIds } = parsed.data;

  const { data: existingEntries, error: existingError } = await supabase
    .from("business_ledger_entries")
    .select("id, group_id")
    .in("id", entryIds);

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 400 });
  }

  const found = existingEntries ?? [];
  if (found.length !== entryIds.length) {
    return NextResponse.json(
      { error: "Some selected transactions no longer exist. Refresh and try again." },
      { status: 400 }
    );
  }

  const alreadyGrouped = found.filter((row) => row.group_id);
  if (alreadyGrouped.length) {
    return NextResponse.json(
      {
        error: `${alreadyGrouped.length} of the selected transactions already belong to a group. Ungroup them first.`
      },
      { status: 400 }
    );
  }

  const { data: group, error: groupError } = await supabase
    .from("business_ledger_entry_groups")
    .insert({
      label,
      remark: remark || null,
      created_by: actorId,
      updated_by: actorId
    })
    .select("id")
    .single();

  if (groupError || !group) {
    return NextResponse.json({ error: groupError?.message ?? "Failed to create group." }, { status: 400 });
  }

  // `is("group_id", null)` keeps this safe against a concurrent grouping of the
  // same rows: anything already claimed is skipped and the count check below
  // then rolls the new group back.
  const { data: assigned, error: assignError } = await supabase
    .from("business_ledger_entries")
    .update({ group_id: group.id, updated_by: actorId })
    .in("id", entryIds)
    .is("group_id", null)
    .select("id");

  if (assignError || (assigned ?? []).length !== entryIds.length) {
    // Detach first, then delete. `business_ledger_entries.group_id` is
    // ON DELETE CASCADE, so deleting the group while rows still point at it
    // would destroy pre-existing transactions rather than just undoing the link.
    await supabase
      .from("business_ledger_entries")
      .update({ group_id: null, updated_by: actorId })
      .eq("group_id", group.id);
    await supabase.from("business_ledger_entry_groups").delete().eq("id", group.id);
    return NextResponse.json(
      {
        error:
          assignError?.message ??
          "Some selected transactions were grouped by someone else. Refresh and try again."
      },
      { status: 400 }
    );
  }

  return NextResponse.json({ id: group.id, assigned: (assigned ?? []).length });
}
