import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireFinanceApi } from "@/lib/auth-api";
import { expenseInputSchema } from "@/lib/validation/expense";
import { assertCsrfAndOrigin } from "@/lib/security/origin";

export async function POST(request: Request) {
  if (!(await assertCsrfAndOrigin(request))) {
    return NextResponse.json({ error: "Invalid request origin or CSRF token." }, { status: 403 });
  }

  const authCheck = await requireFinanceApi();
  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.message }, { status: authCheck.status });
  }

  const body = await request.json();
  const parsed = expenseInputSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createClient();
  const actorId = authCheck.user.id;
  const activeBrandId = authCheck.activeBrandId;
  const payload = parsed.data;

  const { data, error } = await supabase
    .from("expenses")
    .insert({
      expense_date: payload.expense_date,
      brand_id: activeBrandId,
      category_id: payload.category_id,
      subcategory_id: payload.subcategory_id,
      amount: payload.amount,
      note: payload.note || null,
      reference: payload.reference || null,
      source: "manual",
      created_by: actorId,
      updated_by: actorId
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ id: data.id });
}

export async function PATCH(request: Request) {
  if (!(await assertCsrfAndOrigin(request))) {
    return NextResponse.json({ error: "Invalid request origin or CSRF token." }, { status: 403 });
  }

  const authCheck = await requireFinanceApi();
  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.message }, { status: authCheck.status });
  }

  const body = await request.json();
  const { id, ...raw } = body;

  if (!id) {
    return NextResponse.json({ error: "Expense ID is required." }, { status: 400 });
  }

  const parsed = expenseInputSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createClient();
  const actorId = authCheck.user.id;
  const activeBrandId = authCheck.activeBrandId;
  const payload = parsed.data;
  const { error } = await supabase
    .from("expenses")
    .update({
      expense_date: payload.expense_date,
      brand_id: activeBrandId,
      category_id: payload.category_id,
      subcategory_id: payload.subcategory_id,
      amount: payload.amount,
      note: payload.note || null,
      reference: payload.reference || null,
      updated_by: actorId
    })
    .eq("id", id)
    .eq("brand_id", activeBrandId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  if (!(await assertCsrfAndOrigin(request))) {
    return NextResponse.json({ error: "Invalid request origin or CSRF token." }, { status: 403 });
  }

  const authCheck = await requireFinanceApi();
  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.message }, { status: authCheck.status });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Expense ID is required." }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("expenses")
    .delete()
    .eq("id", id)
    .eq("brand_id", authCheck.activeBrandId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
