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

// Called immediately after a successful sign-in (password or OAuth) so the
// server can mint the signed session-meta and CSRF cookies. The browser-side
// auth client cannot do this because the HMAC secret lives only on the server.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const remember = url.searchParams.get("remember") === "1";
  const next = sanitizeNextPath(url.searchParams.get("next"));

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = new URL("/login", url.origin);
    loginUrl.searchParams.set("error", "session-expired");
    return NextResponse.redirect(loginUrl);
  }

  const minted = await issue(user.id, remember);
  const response = NextResponse.redirect(new URL(next, url.origin));
  response.cookies.set(SESSION_META_COOKIE, minted.value, metaCookieOptions(minted.maxAge));
  response.cookies.set(CSRF_COOKIE, generateCsrfToken(), csrfCookieOptions(minted.maxAge));
  return response;
}
