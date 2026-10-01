import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdminApi } from "@/lib/auth-api";
import { assertCsrfAndOrigin } from "@/lib/security/origin";
import { describeWriteError, nextSortOrder } from "@/lib/db/entity-writes";
import { bigBookWalletCreateSchema, bigBookWalletUpdateSchema } from "@/lib/validation/invoice";

const ENTITY_LABEL = "Wallet";
const TABLE = "big_book_invoice_wallets";

function normalizeLabel(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function findWalletNameConflict(
  rows: Array<{ name?: string | null; is_active?: boolean | null }> | null | undefined,
  name: string
): string | null {
  const needle = normalizeLabel(name);
  for (const row of rows ?? []) {
    if (normalizeLabel(row.name) === needle) {
      if (row.is_active === false) {
        return `An inactive ${ENTITY_LABEL} ("${(row.name ?? "").trim()}") already uses this name. Activate that one instead of adding a new one.`;
      }
      return `Another ${ENTITY_LABEL} already uses the name "${name.trim()}".`;
    }
  }
  return null;
}

export async function GET() {
  const authCheck = await requireAdminApi();
  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.message }, { status: authCheck.status });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select("id, name, network, address, is_active, sort_order, created_at, updated_at")
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
  const parsed = bigBookWalletCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: siblings, error: siblingsError } = await supabase
    .from(TABLE)
    .select("name, is_active, sort_order");

  if (siblingsError) {
    return NextResponse.json({ error: describeWriteError(siblingsError, ENTITY_LABEL) }, { status: 400 });
  }

  const conflict = findWalletNameConflict(siblings, parsed.data.name);
  if (conflict) {
    return NextResponse.json({ error: conflict }, { status: 409 });
  }

  const sortOrder =
    typeof parsed.data.sort_order === "number" ? parsed.data.sort_order : nextSortOrder(siblings);

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      name: parsed.data.name,
      network: parsed.data.network,
      address: parsed.data.address,
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
  const parsed = bigBookWalletUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id, ...payload } = parsed.data;
  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ error: "No fields provided to update." }, { status: 400 });
  }

  if (typeof payload.name === "string") {
    const supabaseForConflict = await createClient();
    const { data: siblings, error: siblingsError } = await supabaseForConflict
      .from(TABLE)
      .select("id, name, is_active");
    if (siblingsError) {
      return NextResponse.json({ error: describeWriteError(siblingsError, ENTITY_LABEL) }, { status: 400 });
    }
    const conflict = findWalletNameConflict(
      (siblings ?? []).filter((row) => row.id !== id),
      payload.name
    );
    if (conflict) {
      return NextResponse.json({ error: conflict }, { status: 409 });
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.from(TABLE).update(payload).eq("id", id);
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

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Wallet ID is required." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.from(TABLE).delete().eq("id", id).select("id").maybeSingle();

  if (error) {
    return NextResponse.json({ error: describeWriteError(error, ENTITY_LABEL) }, { status: 400 });
  }
  if (!data) {
    return NextResponse.json({ error: "Wallet not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
