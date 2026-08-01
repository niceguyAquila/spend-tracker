// Membership writes shared by the admin invite and user-update routes.

import type { createAdminClient } from "@/lib/supabase/admin";
import type { AppRole } from "@/lib/types";

type AdminClient = ReturnType<typeof createAdminClient>;

export type BrandRoleInput = {
  brand_id: string;
  role: AppRole;
  is_active?: boolean;
};

export type ReplaceBrandRolesResult = { ok: true } | { ok: false; message: string };

export function validateBrandRoles(brandRoles: BrandRoleInput[]): string | null {
  if (!brandRoles.length) {
    // An empty set resolves to "no-brand-access" at sign-in, and loadAccessResult
    // then re-seeds ZENPLAY, so the revoke silently half-applies.
    return "A user needs access to at least one brand. Deactivate the user instead of removing every brand.";
  }

  const seen = new Set<string>();
  for (const row of brandRoles) {
    if (seen.has(row.brand_id)) {
      return "Each brand can only be listed once.";
    }
    seen.add(row.brand_id);
  }

  return null;
}

/**
 * Makes `brandRoles` the user's complete membership set.
 *
 * Grants are written before stale rows are pruned. The reverse order (delete
 * everything, then insert) leaves the user with no memberships whenever the
 * insert fails, which reads as "no-brand-access" and locks them out of the app
 * until an admin happens to notice.
 *
 * Callers must send the full intended set: any brand omitted here is revoked.
 */
export async function replaceUserBrandRoles(
  adminClient: AdminClient,
  allowedUserId: string,
  brandRoles: BrandRoleInput[]
): Promise<ReplaceBrandRolesResult> {
  const validationError = validateBrandRoles(brandRoles);
  if (validationError) {
    return { ok: false, message: validationError };
  }

  const { error: upsertError } = await adminClient.from("user_brand_roles").upsert(
    brandRoles.map((item) => ({
      allowed_user_id: allowedUserId,
      brand_id: item.brand_id,
      role: item.role,
      is_active: item.is_active ?? true
    })),
    { onConflict: "allowed_user_id,brand_id" }
  );
  if (upsertError) {
    return { ok: false, message: upsertError.message };
  }

  const keptBrandIds = brandRoles.map((item) => item.brand_id);
  const { error: pruneError } = await adminClient
    .from("user_brand_roles")
    .delete()
    .eq("allowed_user_id", allowedUserId)
    .not("brand_id", "in", `("${keptBrandIds.join('","')}")`);
  if (pruneError) {
    return { ok: false, message: pruneError.message };
  }

  return { ok: true };
}
