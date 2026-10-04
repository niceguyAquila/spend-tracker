import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdminApi } from "@/lib/auth-api";
import { assertCsrfAndOrigin } from "@/lib/security/origin";
import { bigBookCreditActualizeSchema } from "@/lib/validation/big-book";
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
  const parsed = bigBookCreditActualizeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id, actualized, expected_updated_at } = parsed.data;
  const supabase = await createClient();

  const { data: entry, error: lookupError } = await supabase
    .from("business_ledger_entries")
    .select("id, is_credit, is_future_credit, is_debt, credit_settled_at, updated_at")
    .eq("id", id)
    .maybeSingle();

  if (lookupError) {
    return NextResponse.json({ error: lookupError.message }, { status: 400 });
  }
  if (!entry) {
    return NextResponse.json({ error: "Entry not found." }, { status: 404 });
  }
  if (!entry.is_credit) {
    return NextResponse.json({ error: "Only credit entries can be actualized." }, { status: 400 });
  }
  if (entry.is_debt) {
    return NextResponse.json({ error: "Entry cannot be both credit and debt." }, { status: 400 });
  }
  if (entry.credit_settled_at) {
    return NextResponse.json(
      { error: "Settled credits cannot change Future Credit status." },
      { status: 400 }
    );
  }

  const currentlyFuture = Boolean(entry.is_future_credit);
  const wantFuture = !actualized;
  if (currentlyFuture === wantFuture) {
    return NextResponse.json({
      ok: true,
      actualized,
      updated_at: entry.updated_at,
      unchanged: true
    });
  }

  const { data: updated, error } = await supabase
    .from("business_ledger_entries")
    .update({
      is_future_credit: wantFuture,
      updated_by: authCheck.user.id
    })
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
    actualized,
    updated_at: updated.updated_at
  });
}
