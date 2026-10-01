import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadAccessResult } from "@/lib/auth-access";
import { AppRole } from "@/lib/types";
import { perfStart } from "@/lib/perf";

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

    const { allowedUserId, globalRole } = access.record;

    return {
      user,
      allowedUserId,
      globalRole,
      role: globalRole
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
