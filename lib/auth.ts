import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type AppRole = "admin" | "finance" | "viewer";

export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

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

export async function requireAllowedUser() {
  const user = await requireUser();
  const email = user.email?.trim().toLowerCase();

  if (!email) {
    redirect("/login");
  }

  const adminClient = createAdminClient();
  let { data, error } = await adminClient
    .from("allowed_users")
    .select("id, role, is_active")
    .eq("normalized_email", email)
    .maybeSingle();

  // Fallback for legacy rows where normalized_email might not be populated as expected.
  if ((!data || error) && email) {
    const fallback = await adminClient
      .from("allowed_users")
      .select("id, role, is_active")
      .ilike("email", email)
      .maybeSingle();
    data = fallback.data ?? null;
    error = fallback.error ?? null;
  }

  if (error || !data || !data.is_active) {
    redirect("/login?error=not-allowed");
  }

  return { user, role: data.role as AppRole };
}

export async function requireAllowedRole(allowed: AppRole[]) {
  const result = await requireAllowedUser();
  if (!allowed.includes(result.role)) {
    redirect("/dashboard");
  }
  return result;
}
