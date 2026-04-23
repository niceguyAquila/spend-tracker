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
