import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { sanitizeNextPath } from "@/lib/auth/redirect";
import { evaluate } from "@/lib/security/session-meta";
import { SESSION_META_COOKIE, clearCookieOptions } from "@/lib/security/cookies";

// Password grants mint the app session in POST /auth/sign-in. This GET stays
// reachable so a remembered URL cannot start a new absolute window or flip
// remember-me while the Supabase login is still alive.
export async function GET(request: Request) {
  const url = new URL(request.url);
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

  const status = await evaluate(readCookie(request, SESSION_META_COOKIE), user.id);
  if (status.kind === "ok") {
    return NextResponse.redirect(new URL(next, url.origin));
  }

  const loginUrl = new URL("/login", url.origin);
  loginUrl.searchParams.set("error", "session-expired");
  const response = NextResponse.redirect(loginUrl);
  response.cookies.set(SESSION_META_COOKIE, "", clearCookieOptions());
  return response;
}

function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) {
    return undefined;
  }
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    if (trimmed.slice(0, eq) !== name) {
      continue;
    }
    try {
      return decodeURIComponent(trimmed.slice(eq + 1));
    } catch {
      return undefined;
    }
  }
  return undefined;
}
