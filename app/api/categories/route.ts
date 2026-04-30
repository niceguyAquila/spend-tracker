import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireFinanceApi } from "@/lib/auth-api";
import { categoryInputSchema } from "@/lib/validation/expense";
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
  const parsed = categoryInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("expense_categories")
    .insert({
      brand_id: authCheck.activeBrandId,
      code: parsed.data.code,
      name: parsed.data.name,
      is_active: true
    })
    .select("id, brand_id, code, name, is_active")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
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
  const { id, name, code, is_active } = body as {
    id?: string;
    name?: string;
    code?: string;
    is_active?: boolean;
  };

  if (!id) {
    return NextResponse.json({ error: "Category ID is required." }, { status: 400 });
  }

  const updatePayload: { name?: string; code?: string; is_active?: boolean } = {};
  if (typeof name === "string" && name.trim().length >= 2) {
    updatePayload.name = name.trim();
  }
  if (typeof code === "string" && code.trim().length >= 2) {
    const normalizedCode = code.trim().toUpperCase();
    if (!/^[A-Z0-9_]+$/.test(normalizedCode)) {
      return NextResponse.json(
        { error: "Code must use uppercase letters, numbers, and underscores." },
        { status: 400 }
      );
    }
    updatePayload.code = normalizedCode;
  }
  if (typeof is_active === "boolean") {
    updatePayload.is_active = is_active;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("expense_categories")
    .update(updatePayload)
    .eq("id", id)
    .eq("brand_id", authCheck.activeBrandId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
