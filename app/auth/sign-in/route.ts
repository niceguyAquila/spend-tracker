import { NextResponse } from "next/server";

import { sanitizeNextPath } from "@/lib/auth/redirect";
import { applyPendingAuthCookies, runWithPendingAuthCookies } from "@/lib/supabase/pending-auth-cookies";
import { createClient } from "@/lib/supabase/server";
import {
  CSRF_COOKIE,
  SESSION_META_COOKIE,
  csrfCookieOptions,
  metaCookieOptions
} from "@/lib/security/cookies";
import { generateCsrfToken } from "@/lib/security/csrf";
import { hasTrustedOrigin } from "@/lib/security/origin";
import { issue } from "@/lib/security/session-meta";

type SignInInput = {
  email: string;
  password: string;
  remember: boolean;
  next: string;
};

export async function POST(request: Request) {
  return runWithPendingAuthCookies(() => completeSignIn(request));
}

async function completeSignIn(request: Request) {
  if (!hasTrustedOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid sign-in request." }, { status: 400 });
  }

  const input = parseSignInInput(raw);
  if (!input) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password
  });

  if (error || !data.user) {
    return NextResponse.json({ error: error?.message ?? "Unable to start login." }, { status: 401 });
  }

  const minted = await issue(data.user.id, input.remember);
  const response = NextResponse.json({ redirect: input.next });
  applyPendingAuthCookies(response);
  response.cookies.set(SESSION_META_COOKIE, minted.value, metaCookieOptions(minted.maxAge));
  response.cookies.set(CSRF_COOKIE, generateCsrfToken(), csrfCookieOptions(minted.maxAge));
  return response;
}

function parseSignInInput(raw: unknown): SignInInput | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const body = raw as Record<string, unknown>;
  if (typeof body.email !== "string" || typeof body.password !== "string") {
    return null;
  }
  const email = body.email.trim();
  if (!email || body.password.length === 0) {
    return null;
  }
  return {
    email,
    password: body.password,
    remember: body.remember === true,
    next: sanitizeNextPath(typeof body.next === "string" ? body.next : null)
  };
}
