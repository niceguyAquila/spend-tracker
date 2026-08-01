import { createAdminClient } from "@/lib/supabase/admin";
import type { AppRole } from "@/lib/types";
import { perfStart } from "@/lib/perf";

/**
 * Single source of truth for "who is this user and what brands can they see".
 *
 * Resolving access used to cost three sequential Supabase round trips
 * (allowed_users -> user_brand_roles -> brands). Each round trip is dominated
 * by network latency rather than query time, so they are collapsed into one
 * embedded PostgREST select and memoized per warm server instance.
 */

export type AccessBrand = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
};

export type AccessMembership = {
  brand_id: string;
  role: AppRole;
  is_active: boolean;
  brand: AccessBrand;
};

export type AccessRecord = {
  allowedUserId: string;
  globalRole: AppRole;
  /** Active memberships, oldest first. Brand-level filtering is left to callers. */
  memberships: AccessMembership[];
};

export type AccessResult =
  | { kind: "ok"; record: AccessRecord }
  | { kind: "not-allowed" }
  | { kind: "no-brand-access" };

const ACCESS_SELECT = `
  id, role, is_active,
  user_brand_roles(
    brand_id, role, is_active, created_at,
    brands(id, code, name, is_active)
  )
`;

/**
 * Serverless instances are reused across requests, so a short TTL removes the
 * auth round trip entirely from most invocations. Disabled under test runners,
 * where a sticky cache would leak state between cases.
 */
const CACHE_TTL_MS = (() => {
  if (process.env.NODE_ENV === "test" || process.env.VITEST) return 0;
  const raw = Number(process.env.ACCESS_CACHE_TTL_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : 30_000;
})();

type CacheEntry = { result: AccessResult; expiresAt: number };

const accessCache = new Map<string, CacheEntry>();

/**
 * Call after any mutation to allowed_users, user_brand_roles or brands so role
 * changes take effect immediately instead of after the TTL.
 */
export function invalidateAccessCache(email?: string | null): void {
  if (!email) {
    accessCache.clear();
    return;
  }
  accessCache.delete(email.trim().toLowerCase());
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

type RawBrand = { id: string; code: string; name: string; is_active: boolean };

type RawMembership = {
  brand_id: string;
  role: string;
  is_active: boolean;
  created_at: string | null;
  brands: RawBrand | RawBrand[] | null;
};

type RawAllowedUser = {
  id: string;
  role: string;
  is_active: boolean;
  user_brand_roles: RawMembership[] | null;
};

function firstBrand(value: RawMembership["brands"]): RawBrand | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function normalizeMemberships(rows: RawMembership[] | null): AccessMembership[] {
  return (rows ?? [])
    .filter((row) => row.is_active && typeof row.brand_id === "string" && isUuid(row.brand_id))
    .sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""))
    .map((row) => {
      const brand = firstBrand(row.brands);
      return {
        brand_id: row.brand_id,
        role: row.role as AppRole,
        is_active: row.is_active,
        brand: brand ?? {
          id: row.brand_id,
          code: "UNKNOWN",
          name: "Unknown Brand",
          is_active: true
        }
      };
    });
}

type AdminClient = ReturnType<typeof createAdminClient>;

async function seedDefaultMembership(
  adminClient: AdminClient,
  allowedUserId: string,
  role: AppRole
): Promise<AccessMembership[]> {
  const { data: zenplay } = await adminClient
    .from("brands")
    .select("id, code, name, is_active")
    .eq("code", "ZENPLAY")
    .maybeSingle();

  if (!zenplay?.id) return [];

  const { error } = await adminClient.from("user_brand_roles").upsert(
    {
      allowed_user_id: allowedUserId,
      brand_id: zenplay.id,
      role,
      is_active: true
    },
    { onConflict: "allowed_user_id,brand_id" }
  );
  if (error) return [];

  // Return what we just wrote instead of paying another round trip to read it back.
  return [
    {
      brand_id: zenplay.id,
      role,
      is_active: true,
      brand: {
        id: zenplay.id,
        code: zenplay.code,
        name: zenplay.name,
        is_active: zenplay.is_active
      }
    }
  ];
}

async function fetchAccessResult(email: string): Promise<AccessResult> {
  const end = perfStart("loadAccessRecord");
  try {
    const adminClient = createAdminClient();

    let { data, error } = await adminClient
      .from("allowed_users")
      .select(ACCESS_SELECT)
      .eq("normalized_email", email)
      .maybeSingle();

    // Cold path only: allowlist rows predating the normalized_email column.
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

    const globalRole = row.role as AppRole;
    let memberships = normalizeMemberships(row.user_brand_roles);

    // Cold path: seed a ZENPLAY membership only when the user has none yet.
    if (!memberships.length) {
      memberships = await seedDefaultMembership(adminClient, row.id, globalRole);
    }
    if (!memberships.length) return { kind: "no-brand-access" };

    return { kind: "ok", record: { allowedUserId: row.id, globalRole, memberships } };
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

/**
 * Prefers memberships whose brand is still active, but falls back to the full
 * list so a deactivated brand never locks an otherwise valid user out.
 */
export function preferActiveBrands(memberships: AccessMembership[]): AccessMembership[] {
  const active = memberships.filter((row) => row.brand.is_active);
  return active.length ? active : memberships;
}
