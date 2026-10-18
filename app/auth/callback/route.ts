import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { applyPendingAuthCookies, runWithPendingAuthCookies } from "@/lib/supabase/pending-auth-cookies";
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
  return runWithPendingAuthCookies(() => completeCallback(request));
}

async function completeCallback(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const remember = requestUrl.searchParams.get("remember") === "1";
  const nextPath = sanitizeNextPath(requestUrl.searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(new URL(nextPath, requestUrl.origin));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data?.user) {
    const loginUrl = new URL("/login", requestUrl.origin);
    loginUrl.searchParams.set("error", "session-expired");
    return NextResponse.redirect(loginUrl);
  }

  const minted = await issue(data.user.id, remember);
  const response = NextResponse.redirect(new URL(nextPath, requestUrl.origin));
  applyPendingAuthCookies(response);
  response.cookies.set(SESSION_META_COOKIE, minted.value, metaCookieOptions(minted.maxAge));
  response.cookies.set(CSRF_COOKIE, generateCsrfToken(), csrfCookieOptions(minted.maxAge));
  return response;
}
