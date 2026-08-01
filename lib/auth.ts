import { cache } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { loadAccessResult, preferActiveBrands } from "@/lib/auth-access";
import { AppRole, UserBrandRole } from "@/lib/types";
import { perfStart } from "@/lib/perf";

export const ACTIVE_BRAND_COOKIE = "active_brand_id";
export type { AppRole } from "@/lib/types";

export const requireUser = cache(async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return user;
});

export function getUserRole(user: { user_metadata?: Record<string, unknown> }): AppRole {
  const raw = user.user_metadata?.role;
  if (raw === "admin" || raw === "finance" || raw === "viewer") {
    return raw;
  }
  return "viewer";
}

export async function requireRole(allowed: AppRole[]) {
  return requireAllowedRole(allowed);
}

/**
 * Request-scoped via React cache() so nested layouts (dashboard + big-book)
 * share one resolution, on top of the cross-request cache in auth-access.
 */
export const requireAllowedUser = cache(async function requireAllowedUser() {
  const end = perfStart("requireAllowedUser");
  try {
    const user = await requireUser();
    const email = user.email?.trim().toLowerCase();

    if (!email) {
      redirect("/login");
    }

    const access = await loadAccessResult(email);
    if (access.kind === "not-allowed") {
      redirect("/login?error=not-allowed");
    }
    if (access.kind === "no-brand-access") {
      redirect("/login?error=no-brand-access");
    }

    const { allowedUserId, globalRole } = access.record;
    // Must match resolveApiAccess(): if a page offers a brand the API layer
    // filters out, the switcher and the mutation it triggers disagree on which
    // brand is active and writes land on the wrong one.
    const brandRoles: UserBrandRole[] = preferActiveBrands(access.record.memberships);
    if (!brandRoles.length) {
      redirect("/login?error=no-brand-access");
    }

    const cookieStore = await cookies();
    const requestedBrandId = cookieStore.get(ACTIVE_BRAND_COOKIE)?.value ?? null;
    const activeBrandRole =
      brandRoles.find((row) => row.brand_id === requestedBrandId) ?? brandRoles[0];

    return {
      user,
      allowedUserId,
      globalRole,
      role: activeBrandRole.role,
      activeBrandId: activeBrandRole.brand_id,
      activeBrand: activeBrandRole.brand,
      brandRoles
    };
  } finally {
    end();
  }
});

export async function requireAllowedRole(allowed: AppRole[]) {
  const result = await requireAllowedUser();
  if (!allowed.includes(result.role)) {
    redirect("/dashboard");
  }
  return result;
}
