import { CSRF_COOKIE } from "./cookies";

const CSRF_TOKEN_BYTES = 32;
const CSRF_HEADER_LOWER = "x-csrf-token";
const CSRF_FORM_FIELD = "csrf_token";

export const CSRF_HEADER = "X-CSRF-Token";
export const CSRF_FORM_FIELD_NAME = CSRF_FORM_FIELD;

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/=+$/u, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export function generateCsrfToken(): string {
  const bytes = new Uint8Array(CSRF_TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

function readCookieValue(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) {
    return undefined;
  }
  const parts = header.split(/;\s*/);
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    if (part.slice(0, eq) === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1));
      } catch {
        return part.slice(eq + 1);
      }
    }
  }
  return undefined;
}

async function readSubmittedToken(request: Request): Promise<string | undefined> {
  const headerToken = request.headers.get(CSRF_HEADER_LOWER);
  if (headerToken) {
    return headerToken;
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (
    contentType.startsWith("application/x-www-form-urlencoded") ||
    contentType.startsWith("multipart/form-data")
  ) {
    try {
      const form = await request.clone().formData();
      const value = form.get(CSRF_FORM_FIELD);
      if (typeof value === "string") {
        return value;
      }
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function constantTimeEqual(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  if (aBytes.length !== bBytes.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < aBytes.length; i += 1) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}

export async function verifyCsrfToken(request: Request): Promise<boolean> {
  const cookieValue = readCookieValue(request, CSRF_COOKIE);
  if (!cookieValue) {
    return false;
  }
  const submitted = await readSubmittedToken(request);
  if (!submitted) {
    return false;
  }
  return constantTimeEqual(cookieValue, submitted);
}
