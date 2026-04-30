// Client-side helpers for authenticated API calls.
// Mirrors the names defined in `lib/security/cookies.ts` (production uses the
// `__Host-` prefix; dev uses the bare names).

const CSRF_COOKIE_PROD = "__Host-csrf";
const CSRF_COOKIE_DEV = "csrf";

export function readCsrfCookie(): string | null {
  if (typeof document === "undefined") {
    return null;
  }
  const parts = document.cookie.split(/;\s*/);
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const name = part.slice(0, eq);
    if (name === CSRF_COOKIE_PROD || name === CSRF_COOKIE_DEV) {
      const raw = part.slice(eq + 1);
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
  }
  return null;
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Drop-in replacement for `fetch` that automatically attaches the CSRF token
// header for state-changing requests. Use this for any client-side call that
// hits a same-origin API route guarded by `assertCsrfAndOrigin`.
export async function secureFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  if (SAFE_METHODS.has(method)) {
    return fetch(input, init);
  }
  const headers = new Headers(init.headers ?? {});
  if (!headers.has("X-CSRF-Token")) {
    const token = readCsrfCookie();
    if (token) {
      headers.set("X-CSRF-Token", token);
    }
  }
  return fetch(input, { ...init, method, headers });
}

export function handleUnauthorizedResponse(response: Response): boolean {
  if (response.status !== 401 && response.status !== 403) {
    return false;
  }

  const loginUrl = new URL("/login", window.location.origin);
  const currentPath = `${window.location.pathname}${window.location.search}`;
  loginUrl.searchParams.set("next", currentPath);
  loginUrl.searchParams.set("error", "session-expired");
  window.location.href = loginUrl.toString();
  return true;
}
