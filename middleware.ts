import { type NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";
import { sanitizeNextPath } from "@/lib/auth/redirect";

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const path = request.nextUrl.pathname;

  const protectedPath =
    path.startsWith("/dashboard") ||
    path.startsWith("/api/expenses") ||
    path.startsWith("/api/categories") ||
    path.startsWith("/api/subcategories") ||
    path.startsWith("/api/brands") ||
    path.startsWith("/api/admin");

  if (!protectedPath) {
    return response;
  }

  if (!user && !path.startsWith("/login") && !path.startsWith("/auth")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    const nextPath = sanitizeNextPath(`${request.nextUrl.pathname}${request.nextUrl.search}`);
    url.searchParams.set("next", nextPath);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
