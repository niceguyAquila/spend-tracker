// Centralized cookie option helpers and name constants.
// Production uses `__Host-` prefix which requires Path=/, Secure, no Domain.
// Dev uses bare names so cookies still work over http://localhost.

const isProd = process.env.NODE_ENV === "production";

export const SESSION_META_COOKIE = isProd ? "__Host-session-meta" : "session-meta";
export const CSRF_COOKIE = isProd ? "__Host-csrf" : "csrf";

type SameSite = "lax" | "strict" | "none";

type BaseOptions = {
  path: "/";
  secure: boolean;
  sameSite: SameSite;
};

const baseOptions: BaseOptions = {
  path: "/",
  secure: isProd,
  sameSite: "lax"
};

export type WrittenCookieOptions = BaseOptions & {
  httpOnly: boolean;
  maxAge?: number;
};

export function authCookieOverrides(): { httpOnly: true; secure: boolean; sameSite: SameSite; path: "/" } {
  return {
    ...baseOptions,
    httpOnly: true
  };
}

export function metaCookieOptions(maxAgeSeconds: number): WrittenCookieOptions {
  return {
    ...baseOptions,
    httpOnly: true,
    maxAge: maxAgeSeconds
  };
}

export function csrfCookieOptions(maxAgeSeconds: number): WrittenCookieOptions {
  return {
    ...baseOptions,
    httpOnly: false,
    maxAge: maxAgeSeconds
  };
}

export function appCookieOptions(opts?: { maxAge?: number; httpOnly?: boolean }): WrittenCookieOptions {
  return {
    ...baseOptions,
    httpOnly: opts?.httpOnly ?? true,
    maxAge: opts?.maxAge
  };
}

export function clearCookieOptions(): WrittenCookieOptions {
  return {
    ...baseOptions,
    httpOnly: true,
    maxAge: 0
  };
}
