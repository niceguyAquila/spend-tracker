import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdminApi } from "@/lib/auth-api";
import { assertCsrfAndOrigin } from "@/lib/security/origin";
import { describeWriteError, findLabelConflict, nextSortOrder } from "@/lib/db/entity-writes";
import {
  bigBookVendorTypeCreateSchema,
  bigBookVendorTypeUpdateSchema
} from "@/lib/validation/big-book";

const ENTITY_LABEL = "Vendor Type";

export async function GET() {
  const authCheck = await requireAdminApi();
  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.message }, { status: authCheck.status });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("business_ledger_vendor_types")
    .select("id, code, name, is_active, sort_order, created_at, updated_at")
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

  const authCheck = await requireAdminApi();
  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.message }, { status: authCheck.status });
  }

  const body = await request.json();
  const parsed = bigBookVendorTypeCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: existingVendorTypes, error: existingError } = await supabase
    .from("business_ledger_vendor_types")
    .select("code, name, is_active, sort_order");

  if (existingError) {
    return NextResponse.json({ error: describeWriteError(existingError, ENTITY_LABEL) }, { status: 400 });
  }

  const conflict = findLabelConflict(existingVendorTypes, parsed.data, ENTITY_LABEL);
  if (conflict) {
    return NextResponse.json({ error: conflict }, { status: 409 });
  }

  const sortOrder =
    typeof parsed.data.sort_order === "number"
      ? parsed.data.sort_order
      : nextSortOrder(existingVendorTypes);

  const { data, error } = await supabase
    .from("business_ledger_vendor_types")
    .insert({
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

  const authCheck = await requireAdminApi();
  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.message }, { status: authCheck.status });
  }

  const body = await request.json();
  const parsed = bigBookVendorTypeUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id, ...payload } = parsed.data;
  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ error: "No fields provided to update." }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase.from("business_ledger_vendor_types").update(payload).eq("id", id);
  if (error) {
    return NextResponse.json({ error: describeWriteError(error, ENTITY_LABEL) }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
