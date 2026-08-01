/**
 * Lazily provision a per-brand "Uncategorized" category and a per-category
 * "Uncategorized" sub-category. Used by the spending CSV import when a row's
 * category_name / subcategory_name is blank or does not match an existing name.
 */

import type { createClient } from "@/lib/supabase/server";

export type SpendingDbClient = Awaited<ReturnType<typeof createClient>>;

export const UNCATEGORIZED_CATEGORY_CODE = "UNCATEGORIZED";
export const UNCATEGORIZED_NAME = "Uncategorized";

export async function ensureUncategorizedCategory(
  client: SpendingDbClient,
  brandId: string
): Promise<{ id: string; name: string }> {
  const { data: existing, error: lookupError } = await client
    .from("expense_categories")
    .select("id, code, name")
    .eq("brand_id", brandId)
    .eq("code", UNCATEGORIZED_CATEGORY_CODE)
    .maybeSingle();

  if (lookupError) {
    throw new Error(lookupError.message ?? "Failed to look up Uncategorized category.");
  }
  if (existing?.id) {
    return { id: existing.id as string, name: existing.name as string };
  }

  const { data: inserted, error: insertError } = await client
    .from("expense_categories")
    .insert({
      brand_id: brandId,
      code: UNCATEGORIZED_CATEGORY_CODE,
      name: UNCATEGORIZED_NAME,
      is_active: true
    })
    .select("id, code, name")
    .single();

  if (inserted?.id) {
    return { id: inserted.id as string, name: inserted.name as string };
  }

  // Concurrent import raced the unique (brand_id, code) index.
  if (insertError?.code === "23505") {
    const { data: raced } = await client
      .from("expense_categories")
      .select("id, code, name")
      .eq("brand_id", brandId)
      .eq("code", UNCATEGORIZED_CATEGORY_CODE)
      .maybeSingle();
    if (raced?.id) {
      return { id: raced.id as string, name: raced.name as string };
    }
  }

  throw new Error(insertError?.message ?? "Failed to create Uncategorized category.");
}

export async function ensureUncategorizedSubcategory(
  client: SpendingDbClient,
  brandId: string,
  categoryId: string
): Promise<{ id: string; name: string }> {
  const { data: existing, error: lookupError } = await client
    .from("expense_subcategories")
    .select("id, category_id, name")
    .eq("category_id", categoryId)
    .eq("name", UNCATEGORIZED_NAME)
    .maybeSingle();

  if (lookupError) {
    throw new Error(lookupError.message ?? "Failed to look up Uncategorized sub-category.");
  }
  if (existing?.id) {
    return { id: existing.id as string, name: existing.name as string };
  }

  const { data: inserted, error: insertError } = await client
    .from("expense_subcategories")
    .insert({
      brand_id: brandId,
      category_id: categoryId,
      name: UNCATEGORIZED_NAME,
      is_active: true
    })
    .select("id, category_id, name")
    .single();

  if (inserted?.id) {
    return { id: inserted.id as string, name: inserted.name as string };
  }

  if (insertError?.code === "23505") {
    const { data: raced } = await client
      .from("expense_subcategories")
      .select("id, category_id, name")
      .eq("category_id", categoryId)
      .eq("name", UNCATEGORIZED_NAME)
      .maybeSingle();
    if (raced?.id) {
      return { id: raced.id as string, name: raced.name as string };
    }
  }

  throw new Error(insertError?.message ?? "Failed to create Uncategorized sub-category.");
}
