import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdminApi } from "@/lib/auth-api";
import { assertCsrfAndOrigin } from "@/lib/security/origin";
import {
  bigBookGroupCreateSchema,
  bigBookGroupDeleteSchema,
  bigBookGroupUpdateSchema
} from "@/lib/validation/big-book";

type EntryPayload = {
  entry_date: string;
  entry_direction: "spending" | "profit";
  entry_type_id: string;
  entry_sub_type_id?: string | null;
  vendor_type_id?: string | null;
  vendor_id?: string | null;
  pocket_id?: string | null;
  action_by_id?: string | null;
  explanation: string;
  amount: number;
  currency_code: "IDR" | "MYR" | "USDT" | "TRX";
  remark?: string;
  responsible_actor_id: string;
};

function toEntryInsertRow(payload: EntryPayload, groupId: string, actorId: string) {
  return {
    group_id: groupId,
    entry_date: payload.entry_date,
    entry_direction: payload.entry_direction,
    entry_type_id: payload.entry_type_id,
    entry_sub_type_id: payload.entry_sub_type_id ?? null,
    vendor_type_id: payload.vendor_type_id ?? null,
    vendor_id: payload.vendor_id ?? null,
    pocket_id: payload.pocket_id ?? null,
    action_by_id: payload.action_by_id ?? null,
    explanation: payload.explanation,
    amount: payload.amount,
    currency_code: payload.currency_code,
    remark: payload.remark || null,
    responsible_actor_id: payload.responsible_actor_id,
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
  const parsed = bigBookGroupCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createClient();
  const actorId = authCheck.user.id;
  const payload = parsed.data;

  const { data: group, error: groupError } = await supabase
    .from("business_ledger_entry_groups")
    .insert({
      label: payload.label,
      remark: payload.remark || null,
      created_by: actorId,
      updated_by: actorId
    })
    .select("id")
    .single();

  if (groupError || !group) {
    return NextResponse.json({ error: groupError?.message ?? "Failed to create group." }, { status: 400 });
  }

  const { error: entriesError } = await supabase.from("business_ledger_entries").insert(
    payload.entries.map((entry) => toEntryInsertRow(entry, group.id, actorId))
  );

  if (entriesError) {
    await supabase.from("business_ledger_entry_groups").delete().eq("id", group.id);
    return NextResponse.json({ error: entriesError.message }, { status: 400 });
  }

  return NextResponse.json({ id: group.id });
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
  const parsed = bigBookGroupUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createClient();
  const actorId = authCheck.user.id;
  const { id: groupId, label, remark, entries } = parsed.data;

  const { data: existingGroup, error: existingGroupError } = await supabase
    .from("business_ledger_entry_groups")
    .select("id")
    .eq("id", groupId)
    .maybeSingle();

  if (existingGroupError) {
    return NextResponse.json({ error: existingGroupError.message }, { status: 400 });
  }
  if (!existingGroup) {
    return NextResponse.json({ error: "Group not found." }, { status: 404 });
  }

  const { error: groupUpdateError } = await supabase
    .from("business_ledger_entry_groups")
    .update({
      label,
      remark: remark || null,
      updated_by: actorId
    })
    .eq("id", groupId);

  if (groupUpdateError) {
    return NextResponse.json({ error: groupUpdateError.message }, { status: 400 });
  }

  const { data: existingEntries, error: existingEntriesError } = await supabase
    .from("business_ledger_entries")
    .select("id")
    .eq("group_id", groupId);

  if (existingEntriesError) {
    return NextResponse.json({ error: existingEntriesError.message }, { status: 400 });
  }

  const existingIds = new Set((existingEntries ?? []).map((row) => row.id as string));
  const keepIds = new Set(entries.filter((entry) => entry.id).map((entry) => entry.id as string));

  const removeIds = [...existingIds].filter((id) => !keepIds.has(id));
  if (removeIds.length) {
    const { error: deleteError } = await supabase.from("business_ledger_entries").delete().in("id", removeIds);
    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 400 });
    }
  }

  for (const entry of entries) {
    if (entry.id) {
      if (!existingIds.has(entry.id)) {
        return NextResponse.json({ error: `Entry ${entry.id} does not belong to this group.` }, { status: 400 });
      }
      const { id: entryId, ...payload } = entry;
      const { error: updateError } = await supabase
        .from("business_ledger_entries")
        .update({
          entry_date: payload.entry_date,
          entry_direction: payload.entry_direction,
          entry_type_id: payload.entry_type_id,
          entry_sub_type_id: payload.entry_sub_type_id ?? null,
          vendor_type_id: payload.vendor_type_id ?? null,
          vendor_id: payload.vendor_id ?? null,
          pocket_id: payload.pocket_id ?? null,
          action_by_id: payload.action_by_id ?? null,
          explanation: payload.explanation,
          amount: payload.amount,
          currency_code: payload.currency_code,
          remark: payload.remark || null,
          responsible_actor_id: payload.responsible_actor_id,
          updated_by: actorId
        })
        .eq("id", entryId)
        .eq("group_id", groupId);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 400 });
      }
      continue;
    }

    const { error: insertError } = await supabase
      .from("business_ledger_entries")
      .insert(toEntryInsertRow(entry, groupId, actorId));

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true });
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
  const parsed = bigBookGroupDeleteSchema.safeParse({
    id: searchParams.get("id"),
    mode: searchParams.get("mode") ?? "cascade"
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createClient();
  const { id, mode } = parsed.data;

  const { data: existingGroup, error: existingGroupError } = await supabase
    .from("business_ledger_entry_groups")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (existingGroupError) {
    return NextResponse.json({ error: existingGroupError.message }, { status: 400 });
  }
  if (!existingGroup) {
    return NextResponse.json({ error: "Group not found." }, { status: 404 });
  }

  if (mode === "ungroup") {
    const { error: ungroupError } = await supabase
      .from("business_ledger_entries")
      .update({ group_id: null, updated_by: authCheck.user.id })
      .eq("group_id", id);

    if (ungroupError) {
      return NextResponse.json({ error: ungroupError.message }, { status: 400 });
    }
  }

  const { error: deleteError } = await supabase.from("business_ledger_entry_groups").delete().eq("id", id);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
