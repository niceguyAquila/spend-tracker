import { AsyncLocalStorage } from "node:async_hooks";
import type { NextResponse } from "next/server";

import { authCookieOverrides } from "@/lib/security/cookies";

export type PendingAuthCookie = {
  name: string;
  value: string;
  options?: {
    domain?: string;
    expires?: Date;
    httpOnly?: boolean;
    maxAge?: number;
    path?: string;
    sameSite?: boolean | "lax" | "strict" | "none";
    secure?: boolean;
  };
};

const pendingAuthCookies = new AsyncLocalStorage<PendingAuthCookie[]>();

export function runWithPendingAuthCookies<T>(fn: () => Promise<T>): Promise<T> {
  return pendingAuthCookies.run([], fn);
}

export function recordPendingAuthCookies(cookies: PendingAuthCookie[]): void {
  const jar = pendingAuthCookies.getStore();
  if (!jar || cookies.length === 0) {
    return;
  }
  jar.push(...cookies);
}

/** Copy Supabase auth cookies from this request onto a Route Handler response. */
export function applyPendingAuthCookies(response: NextResponse): void {
  const jar = pendingAuthCookies.getStore();
  if (!jar) {
    return;
  }
  const overrides = authCookieOverrides();
  for (const cookie of jar) {
    response.cookies.set(cookie.name, cookie.value, {
      ...cookie.options,
      ...overrides
    });
  }
}
