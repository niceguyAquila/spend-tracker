import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdminApi } from "@/lib/auth-api";
import { assertCsrfAndOrigin } from "@/lib/security/origin";
import { describeWriteError } from "@/lib/db/entity-writes";
import {
  bigBookTypeVendorTypeMapCreateSchema,
  bigBookTypeVendorTypeMapDeleteSchema,
  bigBookTypeVendorTypeMapUpdateSchema
} from "@/lib/validation/big-book";

const ENTITY_LABEL = "Type → Vendor Type mapping";

export async function GET() {
  const authCheck = await requireAdminApi();
  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.message }, { status: authCheck.status });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("business_ledger_type_vendor_type_maps")
    .select(
      `
      id, entry_type_id, vendor_type_id, created_at, updated_at,
      business_ledger_types(code, name),
      business_ledger_vendor_types(code, name)
    `
    )
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const rows = (data ?? []).map((row) => {
    const type = Array.isArray(row.business_ledger_types)
      ? row.business_ledger_types[0]
      : row.business_ledger_types;
    const vendorType = Array.isArray(row.business_ledger_vendor_types)
      ? row.business_ledger_vendor_types[0]
      : row.business_ledger_vendor_types;
    return {
      id: row.id,
      entry_type_id: row.entry_type_id,
      vendor_type_id: row.vendor_type_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      type_code: type?.code ?? null,
      type_name: type?.name ?? null,
      vendor_type_code: vendorType?.code ?? null,
      vendor_type_name: vendorType?.name ?? null
    };
  });

  return NextResponse.json({ rows });
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
  const parsed = bigBookTypeVendorTypeMapCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: existingType } = await supabase
    .from("business_ledger_types")
    .select("id")
    .eq("id", parsed.data.entry_type_id)
    .maybeSingle();
  if (!existingType) {
    return NextResponse.json({ error: "Selected type was not found." }, { status: 400 });
  }

  const { data: existingVendorType } = await supabase
    .from("business_ledger_vendor_types")
    .select("id")
    .eq("id", parsed.data.vendor_type_id)
    .maybeSingle();
  if (!existingVendorType) {
    return NextResponse.json({ error: "Selected vendor type was not found." }, { status: 400 });
  }

  const { data: conflict } = await supabase
    .from("business_ledger_type_vendor_type_maps")
    .select("id")
    .eq("entry_type_id", parsed.data.entry_type_id)
    .maybeSingle();
  if (conflict) {
    return NextResponse.json(
      { error: "This type already has a Vendor Type mapping. Edit or remove it first." },
      { status: 409 }
    );
  }

  const { data, error } = await supabase
    .from("business_ledger_type_vendor_type_maps")
    .insert({
      entry_type_id: parsed.data.entry_type_id,
      vendor_type_id: parsed.data.vendor_type_id
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
  const parsed = bigBookTypeVendorTypeMapUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id, ...payload } = parsed.data;
  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ error: "No fields provided to update." }, { status: 400 });
  }

  const supabase = await createClient();

  if (payload.entry_type_id) {
    const { data: conflict } = await supabase
      .from("business_ledger_type_vendor_type_maps")
      .select("id")
      .eq("entry_type_id", payload.entry_type_id)
      .neq("id", id)
      .maybeSingle();
    if (conflict) {
      return NextResponse.json(
        { error: "This type already has a Vendor Type mapping." },
        { status: 409 }
      );
    }
  }

  const { error } = await supabase
    .from("business_ledger_type_vendor_type_maps")
    .update(payload)
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: describeWriteError(error, ENTITY_LABEL) }, { status: 400 });
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

  const body = await request.json();
  const parsed = bigBookTypeVendorTypeMapDeleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("business_ledger_type_vendor_type_maps")
    .delete()
    .eq("id", parsed.data.id);

  if (error) {
    return NextResponse.json({ error: describeWriteError(error, ENTITY_LABEL) }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
