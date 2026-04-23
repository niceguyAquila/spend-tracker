import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function requireAdminApi() {
  const supabase = await createClient();
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user?.email) {
    return { ok: false as const, status: 401, message: "Unauthorized" };
  }

  const email = user.email.toLowerCase();
  const adminClient = createAdminClient();
  const { data: accessRow, error: accessError } = await adminClient
    .from("allowed_users")
    .select("role, is_active")
    .eq("normalized_email", email)
    .maybeSingle();

  if (accessError || !accessRow || !accessRow.is_active || accessRow.role !== "admin") {
    return { ok: false as const, status: 403, message: "Admin access required" };
  }

  return { ok: true as const, user };
}

export async function requireFinanceApi() {
  const supabase = await createClient();
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user?.email) {
    return { ok: false as const, status: 401, message: "Unauthorized" };
  }

  const email = user.email.toLowerCase();
  const adminClient = createAdminClient();
  const { data: accessRow, error: accessError } = await adminClient
    .from("allowed_users")
    .select("role, is_active")
    .eq("normalized_email", email)
    .maybeSingle();

  if (accessError || !accessRow || !accessRow.is_active) {
    return { ok: false as const, status: 403, message: "Access denied" };
  }

  if (!["admin", "finance"].includes(accessRow.role)) {
    return { ok: false as const, status: 403, message: "Finance or admin access required" };
  }

  return { ok: true as const, user };
}
