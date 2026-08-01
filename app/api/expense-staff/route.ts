import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireFinanceApi } from "@/lib/auth-api";
import { assertCsrfAndOrigin } from "@/lib/security/origin";
import { describeWriteError, findLabelConflict, nextSortOrder } from "@/lib/db/entity-writes";
import { expenseStaffCreateSchema, expenseStaffUpdateSchema } from "@/lib/validation/expense";

const ENTITY_LABEL = "Staff";

export async function GET() {
  const authCheck = await requireFinanceApi();
  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.message }, { status: authCheck.status });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("expense_staff")
    .select("id, brand_id, code, name, is_active, sort_order, created_at, updated_at")
    .eq("brand_id", authCheck.activeBrandId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ rows: data ?? [] });
}

export async function POST(request: Request) {
  if (!(await assertCsrfAndOrigin(request))) {
    return NextResponse.json({ error: "Invalid request origin or CSRF token." }, { status: 403 });
  }

  const authCheck = await requireFinanceApi();
  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.message }, { status: authCheck.status });
  }

  const body = await request.json();
  const parsed = expenseStaffCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: existing, error: existingError } = await supabase
    .from("expense_staff")
    .select("code, name, is_active, sort_order")
    .eq("brand_id", authCheck.activeBrandId);

  if (existingError) {
    return NextResponse.json({ error: describeWriteError(existingError, ENTITY_LABEL) }, { status: 400 });
  }

  const conflict = findLabelConflict(existing, parsed.data, ENTITY_LABEL);
  if (conflict) {
    return NextResponse.json({ error: conflict }, { status: 409 });
  }

  const sortOrder =
    typeof parsed.data.sort_order === "number" ? parsed.data.sort_order : nextSortOrder(existing);

  const { data, error } = await supabase
    .from("expense_staff")
    .insert({
      brand_id: authCheck.activeBrandId,
      code: parsed.data.code,
      name: parsed.data.name,
      sort_order: sortOrder
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: describeWriteError(error, ENTITY_LABEL) }, { status: 400 });
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
  const parsed = expenseStaffUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id, ...payload } = parsed.data;
  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ error: "No fields provided to update." }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("expense_staff")
    .update(payload)
    .eq("id", id)
    .eq("brand_id", authCheck.activeBrandId);
  if (error) {
    return NextResponse.json({ error: describeWriteError(error, ENTITY_LABEL) }, { status: 400 });
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
    return NextResponse.json({ error: "Staff ID is required." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("expense_staff")
    .delete()
    .eq("id", id)
    .eq("brand_id", authCheck.activeBrandId)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: describeWriteError(error, ENTITY_LABEL) }, { status: 400 });
  }
  if (!data) {
    return NextResponse.json({ error: "Staff not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
