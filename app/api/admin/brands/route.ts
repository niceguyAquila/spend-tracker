import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth-api";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasTrustedOrigin } from "@/lib/security/origin";

const createSchema = z.object({
  code: z.string().trim().min(2).max(40),
  name: z.string().trim().min(2).max(120)
});

const updateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2).max(120).optional(),
  is_active: z.boolean().optional()
});

export async function GET() {
  const adminCheck = await requireAdminApi();
  if (!adminCheck.ok) {
    return NextResponse.json({ error: adminCheck.message }, { status: adminCheck.status });
  }

  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("brands")
    .select("id, code, name, is_active, created_at, updated_at")
    .order("created_at", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ brands: data ?? [] });
}

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const adminCheck = await requireAdminApi();
  if (!adminCheck.ok) {
    return NextResponse.json({ error: adminCheck.message }, { status: adminCheck.status });
  }

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const adminClient = createAdminClient();
  const code = parsed.data.code.toUpperCase().replace(/\s+/g, "_");
  const { data, error } = await adminClient
    .from("brands")
    .insert({
      code,
      name: parsed.data.name,
      is_active: true
    })
    .select("id, code, name, is_active")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ brand: data });
}

export async function PATCH(request: Request) {
  if (!hasTrustedOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const adminCheck = await requireAdminApi();
  if (!adminCheck.ok) {
    return NextResponse.json({ error: adminCheck.message }, { status: adminCheck.status });
  }

  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const payload: { name?: string; is_active?: boolean } = {};
  if (parsed.data.name !== undefined) payload.name = parsed.data.name;
  if (typeof parsed.data.is_active === "boolean") payload.is_active = parsed.data.is_active;

  const adminClient = createAdminClient();
  const { error } = await adminClient.from("brands").update(payload).eq("id", parsed.data.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
