import { createAdminClient } from "@/lib/supabase/admin";
import type { AppRole } from "@/lib/types";
import { perfStart } from "@/lib/perf";

export type AccessRecord = {
  allowedUserId: string;
  globalRole: AppRole;
};

export type AccessResult = { kind: "ok"; record: AccessRecord } | { kind: "not-allowed" };

const ACCESS_SELECT = "id, role, is_active";

const CACHE_TTL_MS = (() => {
  if (process.env.NODE_ENV === "test" || process.env.VITEST) return 0;
  const raw = Number(process.env.ACCESS_CACHE_TTL_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : 30_000;
})();

type CacheEntry = { result: AccessResult; expiresAt: number };

const accessCache = new Map<string, CacheEntry>();

export function invalidateAccessCache(email?: string | null): void {
  if (!email) {
    accessCache.clear();
    return;
  }
  accessCache.delete(email.trim().toLowerCase());
}

type RawAllowedUser = {
  id: string;
  role: string;
  is_active: boolean;
};

async function fetchAccessResult(email: string): Promise<AccessResult> {
  const end = perfStart("loadAccessRecord");
  try {
    const adminClient = createAdminClient();

    let { data, error } = await adminClient
      .from("allowed_users")
      .select(ACCESS_SELECT)
      .eq("normalized_email", email)
      .maybeSingle();

    if (!data || error) {
      const fallback = await adminClient
        .from("allowed_users")
        .select(ACCESS_SELECT)
        .ilike("email", email)
        .maybeSingle();
      data = fallback.data ?? null;
      error = fallback.error ?? null;
    }

    if (error || !data) return { kind: "not-allowed" };

    const row = data as unknown as RawAllowedUser;
    if (!row.is_active) return { kind: "not-allowed" };

    return {
      kind: "ok",
      record: { allowedUserId: row.id, globalRole: row.role as AppRole }
    };
  } finally {
    end();
  }
}

export async function loadAccessResult(email: string): Promise<AccessResult> {
  const key = email.trim().toLowerCase();
  if (!key) return { kind: "not-allowed" };

  if (CACHE_TTL_MS > 0) {
    const hit = accessCache.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.result;
  }

  const result = await fetchAccessResult(key);

  if (CACHE_TTL_MS > 0) {
    accessCache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
  }
  return result;
}
