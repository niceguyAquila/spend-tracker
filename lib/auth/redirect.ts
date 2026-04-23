export const DEFAULT_AUTH_REDIRECT = "/dashboard";

export function sanitizeNextPath(nextValue: string | null | undefined): string {
  if (!nextValue) {
    return DEFAULT_AUTH_REDIRECT;
  }

  const normalized = nextValue.trim();
  if (!normalized.startsWith("/") || normalized.startsWith("//")) {
    return DEFAULT_AUTH_REDIRECT;
  }

  return normalized;
}
