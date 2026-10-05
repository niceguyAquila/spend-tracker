import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdminApi } from "@/lib/auth-api";
import { assertCsrfAndOrigin } from "@/lib/security/origin";
import { bigBookCreditSettleSchema } from "@/lib/validation/big-book";
import { resolveOptimisticMiss } from "@/lib/db/optimistic-lock";

export async function PATCH(request: Request) {
  if (!(await assertCsrfAndOrigin(request))) {
    return NextResponse.json({ error: "Invalid request origin or CSRF token." }, { status: 403 });
  }

  const authCheck = await requireAdminApi();
  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.message }, { status: authCheck.status });
  }

  const body = await request.json();
  const parsed = bigBookCreditSettleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id, settled, note, expected_updated_at } = parsed.data;
  const supabase = await createClient();

  const { data: entry, error: lookupError } = await supabase
    .from("business_ledger_entries")
    .select("id, is_credit, is_debt, updated_at")
    .eq("id", id)
    .maybeSingle();

  if (lookupError) {
    return NextResponse.json({ error: lookupError.message }, { status: 400 });
  }
  if (!entry) {
    return NextResponse.json({ error: "Entry not found." }, { status: 404 });
  }

  const isCredit = Boolean(entry.is_credit);
  const isDebt = Boolean(entry.is_debt);
  if (!isCredit && !isDebt) {
    return NextResponse.json(
      { error: "Only credit or debt entries can be marked settled." },
      { status: 400 }
    );
  }
  if (isCredit && isDebt) {
    return NextResponse.json(
      { error: "Entry cannot be both credit and debt." },
      { status: 400 }
    );
  }

  const actorId = authCheck.user.id;
  const closureFields = isDebt
    ? settled
      ? {
          debt_settled_at: new Date().toISOString(),
          debt_settled_by: actorId,
          debt_settlement_note: note ?? null,
          updated_by: actorId
        }
      : {
          debt_settled_at: null,
          debt_settled_by: null,
          debt_settlement_note: null,
          updated_by: actorId
        }
    : settled
      ? {
          credit_settled_at: new Date().toISOString(),
          credit_settled_by: actorId,
          credit_settlement_note: note ?? null,
          updated_by: actorId
        }
      : {
          credit_settled_at: null,
          credit_settled_by: null,
          credit_settlement_note: null,
          updated_by: actorId
        };

  const { data: updated, error } = await supabase
    .from("business_ledger_entries")
    .update(closureFields)
    .eq("id", id)
    .eq("updated_at", expected_updated_at)
    .select("id, updated_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!updated) {
    return resolveOptimisticMiss({ existing: entry });
  }

  return NextResponse.json({
    ok: true,
    settled,
    kind: isDebt ? "debt" : "credit",
    updated_at: updated.updated_at
  });
}
