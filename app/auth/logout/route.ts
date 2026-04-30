import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { assertCsrfAndOrigin } from "@/lib/security/origin";
import {
  CSRF_COOKIE,
  SESSION_META_COOKIE,
  clearCookieOptions
} from "@/lib/security/cookies";
import { ACTIVE_BRAND_COOKIE } from "@/lib/auth";

export async function POST(request: Request) {
  if (!(await assertCsrfAndOrigin(request))) {
    return NextResponse.json({ error: "Invalid request origin or CSRF token." }, { status: 403 });
  }

  const requestUrl = new URL(request.url);
  const supabase = await createClient();
  // scope: "global" revokes refresh tokens for this user across all devices,
  // not just the current browser. This makes the logout action equivalent to
  // a "sign out everywhere" so a stolen device can't keep the session alive.
  await supabase.auth.signOut({ scope: "global" });

  const response = NextResponse.redirect(new URL("/login", requestUrl.origin));
  const cleared = clearCookieOptions();
  response.cookies.set(SESSION_META_COOKIE, "", cleared);
  response.cookies.set(CSRF_COOKIE, "", cleared);
  response.cookies.set(ACTIVE_BRAND_COOKIE, "", cleared);
  return response;
}
