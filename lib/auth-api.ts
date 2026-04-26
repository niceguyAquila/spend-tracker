import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cookies } from "next/headers";
import { ACTIVE_BRAND_COOKIE } from "@/lib/auth";
import type { AppRole } from "@/lib/auth";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

type ApiAccessContext = {
  user: { id: string; email?: string | null };
  allowedUserId: string;
  globalRole: AppRole;
  activeBrandId: string;
  activeBrandRole: AppRole;
};

async function resolveApiAccess(): Promise<
  { ok: true; context: ApiAccessContext } | { ok: false; status: number; message: string }
> {
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
  const { data: allowedUser, error: allowedError } = await adminClient
    .from("allowed_users")
    .select("id, role, is_active")
    .eq("normalized_email", email)
    .maybeSingle();

  if (allowedError || !allowedUser || !allowedUser.is_active) {
    return { ok: false as const, status: 403, message: "Access denied" };
  }

  const { data: memberships, error: membershipError } = await adminClient
    .from("user_brand_roles")
    .select("brand_id, role, is_active")
    .eq("allowed_user_id", allowedUser.id)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  let resolvedMemberships = memberships ?? [];
  if (!membershipError && resolvedMemberships.length === 0) {
    const { data: zenplayBrand } = await adminClient
      .from("brands")
      .select("id")
      .eq("code", "ZENPLAY")
      .maybeSingle();
    if (zenplayBrand?.id) {
      await adminClient.from("user_brand_roles").upsert(
        {
          allowed_user_id: allowedUser.id,
          brand_id: zenplayBrand.id,
          role: allowedUser.role,
          is_active: true
        },
        { onConflict: "allowed_user_id,brand_id" }
      );
      const refetch = await adminClient
        .from("user_brand_roles")
        .select("brand_id, role, is_active")
        .eq("allowed_user_id", allowedUser.id)
        .eq("is_active", true)
        .order("created_at", { ascending: true });
      resolvedMemberships = refetch.data ?? [];
    }
  }

  if (membershipError || !resolvedMemberships.length) {
    return { ok: false as const, status: 403, message: "No brand access assigned" };
  }

  const normalizedMemberships = resolvedMemberships.filter(
    (row) => typeof row.brand_id === "string" && isUuid(row.brand_id)
  );
  if (!normalizedMemberships.length) {
    return { ok: false as const, status: 403, message: "No valid brand access assigned" };
  }

  const brandIds = Array.from(new Set(normalizedMemberships.map((row) => row.brand_id)));
  const { data: brands, error: brandsError } = await adminClient
    .from("brands")
    .select("id, is_active")
    .in("id", brandIds);
  let activeMemberships = normalizedMemberships;
  if (!brandsError && brands && brands.length > 0) {
    const activeBrandSet = new Set(brands.filter((brand) => brand.is_active).map((brand) => brand.id));
    const filtered = normalizedMemberships.filter((row) => activeBrandSet.has(row.brand_id));
    if (filtered.length > 0) {
      activeMemberships = filtered;
    }
  }
  if (!activeMemberships.length) {
    return { ok: false as const, status: 403, message: "No active brand access assigned" };
  }

  const cookieStore = await cookies();
  const requestedBrandId = cookieStore.get(ACTIVE_BRAND_COOKIE)?.value ?? null;
  const activeMembership =
    activeMemberships.find((row) => row.brand_id === requestedBrandId) ??
    activeMemberships[0];

  return {
    ok: true as const,
    context: {
      user,
      allowedUserId: allowedUser.id,
      globalRole: allowedUser.role as AppRole,
      activeBrandId: activeMembership.brand_id,
      activeBrandRole: activeMembership.role as AppRole
    }
  };
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
