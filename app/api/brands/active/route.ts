import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAllowedApi } from "@/lib/auth-api";
import { createAdminClient } from "@/lib/supabase/admin";
import { ACTIVE_BRAND_COOKIE } from "@/lib/auth";
import { assertCsrfAndOrigin } from "@/lib/security/origin";
import { appCookieOptions } from "@/lib/security/cookies";

const schema = z.object({
  brand_id: z.string().uuid()
});

const ACTIVE_BRAND_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export async function POST(request: Request) {
  if (!(await assertCsrfAndOrigin(request))) {
    return NextResponse.json({ error: "Invalid request origin or CSRF token." }, { status: 403 });
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
  response.cookies.set(
    ACTIVE_BRAND_COOKIE,
    parsed.data.brand_id,
    appCookieOptions({ maxAge: ACTIVE_BRAND_MAX_AGE_SECONDS })
  );
  return response;
}
