import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireFinanceApi } from "@/lib/auth-api";
import { subcategoryInputSchema } from "@/lib/validation/expense";
import { hasTrustedOrigin } from "@/lib/security/origin";

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const authCheck = await requireFinanceApi();
  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.message }, { status: authCheck.status });
  }

  const body = await request.json();
  const parsed = subcategoryInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("expense_subcategories")
    .insert({
      category_id: parsed.data.category_id,
      name: parsed.data.name,
      is_active: true
    })
    .select("id, category_id, name, is_active")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}

export async function PATCH(request: Request) {
  if (!hasTrustedOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const authCheck = await requireFinanceApi();
  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.message }, { status: authCheck.status });
  }

  const body = await request.json();
  const { id, name, is_active } = body;

  if (!id) {
    return NextResponse.json({ error: "Sub-category ID is required." }, { status: 400 });
  }

  const supabase = await createClient();
  const updatePayload: { name?: string; is_active?: boolean } = {};
  if (typeof name === "string" && name.trim().length >= 2) {
    updatePayload.name = name.trim();
  }
  if (typeof is_active === "boolean") {
    updatePayload.is_active = is_active;
  }

  const { error } = await supabase.from("expense_subcategories").update(updatePayload).eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
