import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { sanitizeNextPath } from "@/lib/auth/redirect";
import { issue } from "@/lib/security/session-meta";
import { generateCsrfToken } from "@/lib/security/csrf";
import {
  CSRF_COOKIE,
  SESSION_META_COOKIE,
  csrfCookieOptions,
  metaCookieOptions
} from "@/lib/security/cookies";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const remember = requestUrl.searchParams.get("remember") === "1";
  const nextPath = sanitizeNextPath(requestUrl.searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(new URL(nextPath, requestUrl.origin));
  }

  const supabase = await createClient();
  await supabase.auth.exchangeCodeForSession(code);
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const response = NextResponse.redirect(new URL(nextPath, requestUrl.origin));
  if (user) {
    const minted = await issue(user.id, remember);
    response.cookies.set(SESSION_META_COOKIE, minted.value, metaCookieOptions(minted.maxAge));
    response.cookies.set(CSRF_COOKIE, generateCsrfToken(), csrfCookieOptions(minted.maxAge));
  }
  return response;
}
