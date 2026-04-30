import { verifyCsrfToken } from "./csrf";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function hasTrustedOrigin(request: Request): boolean {
  if (SAFE_METHODS.has(request.method.toUpperCase())) {
    return true;
  }

  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");

  if (!origin || !host) {
    return false;
  }

  try {
    const originUrl = new URL(origin);
    return originUrl.host === host;
  } catch {
    return false;
  }
}

// Layered protection for state-changing requests:
//  - Origin must align with Host (defense against simple cross-origin POSTs).
//  - Submitted CSRF token (header X-CSRF-Token or form field csrf_token) must
//    match the value stored in the CSRF cookie (double-submit pattern).
export async function assertCsrfAndOrigin(request: Request): Promise<boolean> {
  if (SAFE_METHODS.has(request.method.toUpperCase())) {
    return true;
  }
  if (!hasTrustedOrigin(request)) {
    return false;
  }
  return verifyCsrfToken(request);
}
