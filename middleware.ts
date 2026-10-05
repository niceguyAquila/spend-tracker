import { type NextRequest, NextResponse } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";
import { sanitizeNextPath } from "@/lib/auth/redirect";
import {
  CSRF_COOKIE,
  SESSION_META_COOKIE,
  clearCookieOptions,
  csrfCookieOptions,
  metaCookieOptions
} from "@/lib/security/cookies";
import {
  ABSOLUTE_MS,
  ABSOLUTE_RM_MS,
  evaluate,
  rolled
} from "@/lib/security/session-meta";
import { generateCsrfToken } from "@/lib/security/csrf";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/api/admin",
  "/api/big-book",
  "/api/auth/debug"
];

// Paths that must remain reachable while logged out (login, OAuth callback,
// post-sign-in init, password recovery flows, server-side logout endpoint).
const PUBLIC_AUTH_PATHS = [
  "/auth/callback",
  "/auth/init-session",
  "/auth/logout"
];

function pathMatchesPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

function isProtected(path: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathMatchesPrefix(path, prefix));
}

function isPublicAuthPath(path: string): boolean {
  return PUBLIC_AUTH_PATHS.some((prefix) => pathMatchesPrefix(path, prefix));
}

function buildLoginRedirect(request: NextRequest, error?: string): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  if (error) {
    url.searchParams.set("error", error);
  }
  const nextPath = sanitizeNextPath(`${request.nextUrl.pathname}${request.nextUrl.search}`);
  if (nextPath !== "/dashboard") {
    url.searchParams.set("next", nextPath);
  }
  const response = NextResponse.redirect(url);
  response.cookies.set(SESSION_META_COOKIE, "", clearCookieOptions());
  return response;
}

/** API callers expect JSON (or CSV), not an HTML login redirect that fetch would follow. */
function buildUnauthorizedApiResponse(error?: string): NextResponse {
  const message = error === "session-expired" ? "Session expired" : "Unauthorized";
  const response = NextResponse.json({ error: message }, { status: 401 });
  response.cookies.set(SESSION_META_COOKIE, "", clearCookieOptions());
  return response;
}

function denyProtectedRequest(request: NextRequest, error?: string): NextResponse {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return buildUnauthorizedApiResponse(error);
  }
  return buildLoginRedirect(request, error);
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // updateSession() makes a network round trip to Supabase Auth, so it must not
  // run for paths that are never gated.
  if (!isProtected(path) || isPublicAuthPath(path)) {
    return NextResponse.next();
  }

  const { response, user } = await updateSession(request);

  if (!user) {
    return denyProtectedRequest(request);
  }

  const metaCookie = request.cookies.get(SESSION_META_COOKIE)?.value;
  const status = await evaluate(metaCookie, user.id);

  if (
    status.kind === "missing" ||
    status.kind === "invalid" ||
    status.kind === "idle-expired" ||
    status.kind === "absolute-expired"
  ) {
    return denyProtectedRequest(request, "session-expired");
  }

  const next = await rolled(status.meta);
  response.cookies.set(SESSION_META_COOKIE, next.value, metaCookieOptions(next.maxAge));

  if (!request.cookies.get(CSRF_COOKIE)) {
    const cap = status.meta.rm ? ABSOLUTE_RM_MS : ABSOLUTE_MS;
    const remaining = Math.max(60, Math.floor((status.meta.iat + cap - Date.now()) / 1000));
    response.cookies.set(CSRF_COOKIE, generateCsrfToken(), csrfCookieOptions(remaining));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff|woff2|ttf|otf)$).*)"
  ]
};
