import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppRole, UserBrandRole } from "@/lib/types";

export const ACTIVE_BRAND_COOKIE = "active_brand_id";
export type { AppRole } from "@/lib/types";

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
  const allowedUserId = data.id;
  const globalRole = data.role as AppRole;

  async function fetchBrandRows() {
    return adminClient
      .from("user_brand_roles")
      .select("brand_id, role, is_active")
      .eq("allowed_user_id", allowedUserId)
      .eq("is_active", true)
      .order("created_at", { ascending: true });
  }

  let { data: brandRows, error: brandError } = await fetchBrandRows();

  // Backward compatibility: if user has no brand assignment yet, attach to seeded ZENPLAY.
  if (!brandError && (!brandRows || brandRows.length === 0)) {
    const { data: zenplayBrand } = await adminClient
      .from("brands")
      .select("id")
      .eq("code", "ZENPLAY")
      .maybeSingle();
    if (zenplayBrand?.id) {
      await adminClient.from("user_brand_roles").upsert(
        {
          allowed_user_id: allowedUserId,
          brand_id: zenplayBrand.id,
          role: globalRole,
          is_active: true
        },
        { onConflict: "allowed_user_id,brand_id" }
      );
      const refetched = await fetchBrandRows();
      brandRows = refetched.data ?? null;
      brandError = refetched.error ?? null;
    }
  }

  if (brandError || !brandRows || brandRows.length === 0) {
    redirect("/login?error=no-brand-access");
  }

  const brandIds = Array.from(new Set((brandRows ?? []).map((row) => row.brand_id)));
  const { data: brands, error: brandsError } = await adminClient
    .from("brands")
    .select("id, code, name, is_active")
    .in("id", brandIds);
  if (brandsError) {
    redirect("/login?error=no-brand-access");
  }

  const brandById = new Map((brands ?? []).map((brand) => [brand.id, brand]));
  const brandRoles: UserBrandRole[] = (brandRows ?? [])
    .map((row) => {
      const brand =
        brandById.get(row.brand_id) ??
        ({
          id: row.brand_id,
          code: "UNKNOWN",
          name: "Unknown Brand",
          is_active: true
        } as const);
      return {
        brand_id: row.brand_id,
        role: row.role as AppRole,
        is_active: row.is_active,
        brand
      };
    })
    .filter((row): row is UserBrandRole => Boolean(row));

  if (!brandRoles.length) {
    redirect("/login?error=no-brand-access");
  }

  const cookieStore = await cookies();
  const requestedBrandId = cookieStore.get(ACTIVE_BRAND_COOKIE)?.value ?? null;
  const activeBrandRole =
    brandRoles.find((row) => row.brand_id === requestedBrandId) ??
    brandRoles[0];

  return {
    user,
    allowedUserId,
    globalRole,
    role: activeBrandRole.role,
    activeBrandId: activeBrandRole.brand_id,
    activeBrand: activeBrandRole.brand,
    brandRoles
  };
}

export async function requireAllowedRole(allowed: AppRole[]) {
  const result = await requireAllowedUser();
  if (!allowed.includes(result.role)) {
    redirect("/dashboard");
  }
  return result;
}
