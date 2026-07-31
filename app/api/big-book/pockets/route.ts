import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdminApi } from "@/lib/auth-api";
import { assertCsrfAndOrigin } from "@/lib/security/origin";
import { describeWriteError, findLabelConflict, nextSortOrder } from "@/lib/db/entity-writes";
import { bigBookPocketCreateSchema, bigBookPocketUpdateSchema } from "@/lib/validation/big-book";

const ENTITY_LABEL = "Pocket";

export async function GET(request: Request) {
  const authCheck = await requireAdminApi();
  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.message }, { status: authCheck.status });
  }

  const { searchParams } = new URL(request.url);
  const actorId = searchParams.get("actorId");

  const supabase = await createClient();
  let query = supabase
    .from("big_book_actor_pockets")
    .select("id, actor_id, code, name, currency_code, is_active, sort_order, created_at, updated_at")
    .order("actor_id", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (actorId) {
    query = query.eq("actor_id", actorId);
  }

  const { data, error } = await query;

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
  const parsed = bigBookPocketCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: siblings, error: siblingsError } = await supabase
    .from("big_book_actor_pockets")
    .select("code, name, is_active, sort_order")
    .eq("actor_id", parsed.data.actor_id);

  if (siblingsError) {
    return NextResponse.json({ error: describeWriteError(siblingsError, ENTITY_LABEL) }, { status: 400 });
  }

  const conflict = findLabelConflict(siblings, parsed.data, ENTITY_LABEL);
  if (conflict) {
    return NextResponse.json({ error: conflict }, { status: 409 });
  }

  const sortOrder =
    typeof parsed.data.sort_order === "number" ? parsed.data.sort_order : nextSortOrder(siblings);

  const { data, error } = await supabase
    .from("big_book_actor_pockets")
    .insert({
      actor_id: parsed.data.actor_id,
      code: parsed.data.code,
      name: parsed.data.name,
      currency_code: parsed.data.currency_code,
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
  const parsed = bigBookPocketUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id, ...payload } = parsed.data;
  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ error: "No fields provided to update." }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase.from("big_book_actor_pockets").update(payload).eq("id", id);
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
    return NextResponse.json({ error: "Pocket ID is required." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("big_book_actor_pockets")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: describeWriteError(error, ENTITY_LABEL) }, { status: 400 });
  }
  if (!data) {
    return NextResponse.json({ error: "Pocket not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
