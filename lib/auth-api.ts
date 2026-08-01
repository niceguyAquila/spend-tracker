import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { ACTIVE_BRAND_COOKIE } from "@/lib/auth";
import type { AppRole } from "@/lib/auth";
import { loadAccessResult, preferActiveBrands } from "@/lib/auth-access";
import { perfStart } from "@/lib/perf";

type ApiAccessContext = {
  user: { id: string; email?: string | null };
  allowedUserId: string;
  globalRole: AppRole;
  activeBrandId: string;
  activeBrandRole: AppRole;
};

type ClaimsCapableAuth = {
  getClaims?: () => Promise<{
    data: { claims?: Record<string, unknown> | null } | null;
    error: unknown;
  }>;
};

/**
 * getClaims() verifies the session JWT locally against the project's JWKS when
 * the project uses asymmetric signing keys, which avoids a network round trip
 * to Supabase Auth on every API call. It is feature-detected and falls back to
 * getUser() on older clients or projects still on the legacy shared secret.
 */
async function resolveSessionUser(): Promise<{ id: string; email: string } | null> {
  const supabase = await createClient();
  const auth = supabase.auth as typeof supabase.auth & ClaimsCapableAuth;

  if (typeof auth.getClaims === "function") {
    try {
      const { data, error } = await auth.getClaims();
      const claims = data?.claims;
      const id = typeof claims?.sub === "string" ? claims.sub : null;
      const email = typeof claims?.email === "string" ? claims.email : null;
      if (!error && id && email) return { id, email };
    } catch {
      // Fall through to the network check below.
    }
  }

  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user?.email) return null;
  return { id: user.id, email: user.email };
}

/**
 * Note: not wrapped in React cache(). Route-handler tests and some Node
 * runners lack a request boundary, so cache() would sticky-memoize across
 * calls. loadAccessRecord() already carries its own short-TTL cache.
 */
async function resolveApiAccess(): Promise<
  { ok: true; context: ApiAccessContext } | { ok: false; status: number; message: string }
> {
  const end = perfStart("resolveApiAccess");
  try {
    const user = await resolveSessionUser();
    if (!user) {
      return { ok: false as const, status: 401, message: "Unauthorized" };
    }

    const access = await loadAccessResult(user.email);
    if (access.kind === "not-allowed") {
      return { ok: false as const, status: 403, message: "Access denied" };
    }
    if (access.kind === "no-brand-access") {
      return { ok: false as const, status: 403, message: "No brand access assigned" };
    }

    const memberships = preferActiveBrands(access.record.memberships);
    if (!memberships.length) {
      return { ok: false as const, status: 403, message: "No active brand access assigned" };
    }

    const cookieStore = await cookies();
    const requestedBrandId = cookieStore.get(ACTIVE_BRAND_COOKIE)?.value ?? null;
    const activeMembership =
      memberships.find((row) => row.brand_id === requestedBrandId) ?? memberships[0];

    return {
      ok: true as const,
      context: {
        user,
        allowedUserId: access.record.allowedUserId,
        globalRole: access.record.globalRole,
        activeBrandId: activeMembership.brand_id,
        activeBrandRole: activeMembership.role
      }
    };
  } finally {
    end();
  }
}

export async function requireAllowedApi() {
  const access = await resolveApiAccess();
  if (!access.ok) {
    return access;
  }
  return { ok: true as const, ...access.context };
}

export async function requireAdminApi() {
  const access = await resolveApiAccess();
  if (!access.ok) {
    return access;
  }

  if (access.context.globalRole !== "admin") {
    return { ok: false as const, status: 403, message: "Admin access required" };
  }

  return { ok: true as const, ...access.context };
}

export async function requireFinanceApi() {
  const access = await resolveApiAccess();
  if (!access.ok) {
    return access;
  }

  if (!["admin", "finance"].includes(access.context.activeBrandRole)) {
    return { ok: false as const, status: 403, message: "Finance or admin access required" };
  }

  return { ok: true as const, ...access.context };
}
