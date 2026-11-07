import { NextResponse } from "next/server";
import { purgeQueuedAttachmentFiles } from "@/lib/big-book/attachment-purge";
import { createClient } from "@/lib/supabase/server";
import { requireAdminApi } from "@/lib/auth-api";
import { assertCsrfAndOrigin } from "@/lib/security/origin";
import {
  bigBookSettlementRevertPreviewSchema,
  bigBookSettlementRevertSchema
} from "@/lib/validation/big-book";
import {
  planSettlementRevert,
  revertErrorResponse,
  revertSettlement,
  type SettlementRef
} from "@/lib/big-book/ledger-undo";

function toRef(input: { request_id?: string; payment_id?: string }): SettlementRef {
  return input.request_id ? { requestId: input.request_id } : { paymentId: input.payment_id as string };
}

/** Preview: what undoing the settlement would remove, reopen and regroup. */
export async function GET(request: Request) {
  const authCheck = await requireAdminApi();
  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.message }, { status: authCheck.status });
  }

  const { searchParams } = new URL(request.url);
  const parsed = bigBookSettlementRevertPreviewSchema.safeParse({
    request_id: searchParams.get("request_id") ?? undefined,
    payment_id: searchParams.get("payment_id") ?? undefined
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createClient();
  const result = await planSettlementRevert(supabase, toRef(parsed.data));
  if (!result.ok) return revertErrorResponse(result.error);
  return NextResponse.json({ ok: true, plan: result.value });
}

/** Undo: removes the settlement's payments and companions, reopens and regroups obligations. */
export async function POST(request: Request) {
  if (!(await assertCsrfAndOrigin(request))) {
    return NextResponse.json({ error: "Invalid request origin or CSRF token." }, { status: 403 });
  }

  const authCheck = await requireAdminApi();
  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.message }, { status: authCheck.status });
  }

  const body = await request.json().catch(() => null);
  const parsed = bigBookSettlementRevertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createClient();
  const result = await revertSettlement(supabase, {
    ref: toRef(parsed.data),
    expectedEntryIds: parsed.data.expected_entry_ids,
    reason: parsed.data.reason || null
  });
  if (!result.ok) return revertErrorResponse(result.error);
  // Payments / companions may have had attachments.
  await purgeQueuedAttachmentFiles();

  const outcome = result.value;
  return NextResponse.json({
    ok: true,
    request_id: outcome.requestId,
    deleted_ids: outcome.deletedIds,
    reopened_ids: outcome.reopenedIds,
    regrouped_ids: outcome.regroupedIds,
    group_id: outcome.groupId,
    group_deleted: outcome.groupDeleted
  });
}
