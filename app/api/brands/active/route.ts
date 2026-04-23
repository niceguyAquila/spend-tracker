import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAllowedApi } from "@/lib/auth-api";
import { createAdminClient } from "@/lib/supabase/admin";
import { ACTIVE_BRAND_COOKIE } from "@/lib/auth";
import { hasTrustedOrigin } from "@/lib/security/origin";

const schema = z.object({
  brand_id: z.string().uuid()
});

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const authCheck = await requireAllowedApi();
  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.message }, { status: authCheck.status });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const adminClient = createAdminClient();
  const { data: membership, error } = await adminClient
    .from("user_brand_roles")
    .select("brand_id, is_active")
    .eq("allowed_user_id", authCheck.allowedUserId)
    .eq("brand_id", parsed.data.brand_id)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !membership) {
    return NextResponse.json({ error: "Brand not accessible for this user." }, { status: 403 });
  }

  const response = NextResponse.json({ ok: true, brand_id: parsed.data.brand_id });
  response.cookies.set({
    name: ACTIVE_BRAND_COOKIE,
    value: parsed.data.brand_id,
    sameSite: "lax",
    path: "/"
  });
  return response;
}
