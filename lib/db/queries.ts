import { createClient } from "@/lib/supabase/server";
import {
  DashboardReportRow,
  ExpenseCategory,
  ExpenseSubcategory,
  ExpenseWithNames,
  WebTransaction,
  WebTransactionMetrics
} from "@/lib/types";

export async function getCategories(brandId: string, options?: { includeInactive?: boolean }): Promise<ExpenseCategory[]> {
  const supabase = await createClient();
  let query = supabase
    .from("expense_categories")
    .select("id, brand_id, code, name, is_active")
    .eq("brand_id", brandId)
    .order("name");

  if (!options?.includeInactive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data ?? [];
}

export async function getSubcategories(brandId: string, categoryId?: string): Promise<ExpenseSubcategory[]> {
  const supabase = await createClient();
  let query = supabase
    .from("expense_subcategories")
    .select("id, brand_id, category_id, name, is_active")
    .eq("brand_id", brandId)
    .eq("is_active", true)
    .order("name");

  if (categoryId) {
    query = query.eq("category_id", categoryId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getExpenses(params: {
  brandId: string;
  month?: string;
  categoryId?: string;
  limit?: number;
}): Promise<ExpenseWithNames[]> {
  const supabase = await createClient();
  let query = supabase
    .from("expenses")
    .select(
      `
      id, brand_id, expense_date, month_key, amount, category_id, subcategory_id, note, reference, source, created_by, updated_by, created_at, updated_at,
      expense_categories(name),
      expense_subcategories(name)
    `
    )
    .eq("brand_id", params.brandId)
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (params?.month) {
    query = query.eq("month_key", params.month);
  }
  if (params?.categoryId) {
    query = query.eq("category_id", params.categoryId);
  }
  if (params?.limit) {
    query = query.limit(params.limit);
  }

  const { data, error } = await query;
  if (error) throw error;

  const actorIds = new Set<string>();
  for (const row of data ?? []) {
    if (typeof row.created_by === "string" && row.created_by.length) {
      actorIds.add(row.created_by);
    }
    if (typeof row.updated_by === "string" && row.updated_by.length) {
      actorIds.add(row.updated_by);
    }
  }

  const actorMap = new Map<string, string>();
  if (actorIds.size > 0) {
    const { data: actorRows, error: actorError } = await supabase
      .from("allowed_users")
      .select("auth_user_id, display_name, email")
      .in("auth_user_id", [...actorIds]);
    if (actorError) throw actorError;

    for (const actor of actorRows ?? []) {
      if (!actor.auth_user_id) continue;
      const resolvedName = actor.display_name?.trim() || actor.email || actor.auth_user_id;
      actorMap.set(actor.auth_user_id, resolvedName);
    }
  }

  return (data ?? []).map((row) => {
    const category = Array.isArray(row.expense_categories)
      ? row.expense_categories[0]
      : row.expense_categories;
    const subcategory = Array.isArray(row.expense_subcategories)
      ? row.expense_subcategories[0]
      : row.expense_subcategories;

    return {
      id: row.id,
      brand_id: row.brand_id,
      expense_date: row.expense_date,
      month_key: row.month_key,
      amount: Number(row.amount),
      category_id: row.category_id,
      subcategory_id: row.subcategory_id,
      note: row.note,
      reference: row.reference,
      source: row.source,
      created_by: row.created_by,
      updated_by: row.updated_by,
      created_at: row.created_at,
      updated_at: row.updated_at,
      category_name: category?.name ?? "-",
      subcategory_name: subcategory?.name ?? "-",
      creator_display_name: row.created_by ? (actorMap.get(row.created_by) ?? row.created_by) : "-",
      updater_display_name: row.updated_by ? (actorMap.get(row.updated_by) ?? row.updated_by) : "-"
    };
  });
}

export async function getExpenseMonthKeys(brandId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("expenses")
    .select("month_key")
    .eq("brand_id", brandId)
    .order("month_key", { ascending: false });

  if (error) throw error;

  const monthKeySet = new Set<string>();
  for (const row of data ?? []) {
    if (typeof row.month_key === "string" && row.month_key.trim().length > 0) {
      monthKeySet.add(row.month_key);
    }
  }

  return [...monthKeySet];
}

export async function getMonthlySummary(brandId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_expense_monthly_summary", {
    input_brand_id: brandId
  });
  if (error) throw error;
  return data ?? [];
}

export async function getCategorySplit(brandId: string, month?: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_expense_category_split", {
    input_brand_id: brandId,
    input_month: month ?? null
  });
  if (error) throw error;
  return data ?? [];
}

export async function getSubcategoryMovement(brandId: string, month?: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_subcategory_movement", {
    input_brand_id: brandId,
    input_month: month ?? null
  });
  if (error) throw error;
  return data ?? [];
}

export async function getDashboardReportRows(params: {
  brandId: string;
  categoryIds?: string[];
  subcategoryIds?: string[];
  monthKeys?: string[];
}): Promise<DashboardReportRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("expenses")
    .select(
      `
      category_id,
      subcategory_id,
      month_key,
      amount,
      expense_categories(name),
      expense_subcategories(name)
    `
    )
    .eq("brand_id", params.brandId)
    .order("month_key", { ascending: true });

  if (params?.categoryIds?.length) {
    query = query.in("category_id", params.categoryIds);
  }
  if (params?.subcategoryIds?.length) {
    query = query.in("subcategory_id", params.subcategoryIds);
  }
  if (params?.monthKeys?.length) {
    query = query.in("month_key", params.monthKeys);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((row) => {
    const category = Array.isArray(row.expense_categories)
      ? row.expense_categories[0]
      : row.expense_categories;
    const subcategory = Array.isArray(row.expense_subcategories)
      ? row.expense_subcategories[0]
      : row.expense_subcategories;

    return {
      category_id: row.category_id,
      category_name: category?.name ?? "-",
      subcategory_id: row.subcategory_id,
      subcategory_name: subcategory?.name ?? "-",
      month_key: row.month_key,
      amount: Number(row.amount)
    };
  });
}

type WebTransactionFilters = {
  sourceSystem?: "backoffice" | "payment_gateway";
  status?: string;
  canonicalType?: string;
  merchantName?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
};

export async function getWebTransactions(
  brandId: string,
  filters: WebTransactionFilters = {}
): Promise<WebTransaction[]> {
  const supabase = await createClient();
  let query = supabase
    .from("web_transactions")
    .select(
      `id, brand_id, source_system, create_time, last_update_time, external_txn_no, client_order_no, aggregator_order_no, raw_status, canonical_status, raw_type, canonical_type, product_type, currency_code, original_amount, amount, crypto_currency_code, crypto_amount, merchant_name, merchant_rate, merchant_fee, raw_payload, source_file_name, imported_at`
    )
    .eq("brand_id", brandId)
    .order("create_time", { ascending: false });

  if (filters.sourceSystem) {
    query = query.eq("source_system", filters.sourceSystem);
  }
  if (filters.status) {
    query = query.eq("canonical_status", filters.status);
  }
  if (filters.canonicalType) {
    query = query.eq("canonical_type", filters.canonicalType);
  }
  if (filters.merchantName) {
    query = query.eq("merchant_name", filters.merchantName);
  }
  if (filters.dateFrom) {
    query = query.gte("create_time", `${filters.dateFrom}T00:00:00+07:00`);
  }
  if (filters.dateTo) {
    query = query.lte("create_time", `${filters.dateTo}T23:59:59+07:00`);
  }
  query = query.limit(filters.limit ?? 500);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((row) => ({
    ...row,
    original_amount: Number(row.original_amount),
    amount: Number(row.amount),
    crypto_amount: row.crypto_amount === null ? null : Number(row.crypto_amount),
    merchant_rate: row.merchant_rate === null ? null : Number(row.merchant_rate),
    merchant_fee: row.merchant_fee === null ? null : Number(row.merchant_fee)
  }));
}

export function buildWebTransactionMetrics(rows: WebTransaction[]): WebTransactionMetrics {
  return rows.reduce<WebTransactionMetrics>(
    (acc, row) => {
      acc.total_count += 1;
      if (row.canonical_status.toLowerCase() === "successful") {
        acc.successful_count += 1;
      }
      acc.gross_amount += row.amount;
      acc.fee_amount += row.merchant_fee ?? 0;
      acc.net_amount += row.amount - Math.abs(row.merchant_fee ?? 0);
      return acc;
    },
    {
      total_count: 0,
      successful_count: 0,
      gross_amount: 0,
      fee_amount: 0,
      net_amount: 0
    }
  );
}
