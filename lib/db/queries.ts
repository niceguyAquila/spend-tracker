import { createClient } from "@/lib/supabase/server";
import {
  BigBookActor,
  BigBookAllowedUserOption,
  BigBookActorCurrencyMetrics,
  BigBookAttachment,
  BigBookEntry,
  BigBookLedgerType,
  BigBookMonthlyCurrencyRow,
  DashboardReportRow,
  ExpenseCategory,
  ExpenseSubcategory,
  ExpenseWithNames,
  WebTransactionComparisonMetrics,
  WebTransactionComparisonResult,
  WebTransactionComparisonRow,
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

export async function getBigBookLedgerTypes(options?: {
  includeInactive?: boolean;
}): Promise<BigBookLedgerType[]> {
  const supabase = await createClient();
  let query = supabase
    .from("business_ledger_types")
    .select("id, code, name, is_active, sort_order, created_at, updated_at")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (!options?.includeInactive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((row) => ({
    ...row,
    sort_order: Number(row.sort_order)
  }));
}

export async function getBigBookActors(): Promise<BigBookActor[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("big_book_actors")
    .select("id, actor_code, display_name, user_id")
    .order("actor_code", { ascending: true });

  if (error) throw error;
  return (data ?? []) as BigBookActor[];
}

export async function getBigBookAllowedUsers(): Promise<BigBookAllowedUserOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("allowed_users")
    .select("id, email, display_name")
    .eq("is_active", true)
    .order("display_name", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    email: row.email,
    display_name: row.display_name?.trim() || row.email
  }));
}

export async function getBigBookEntries(brandId: string, filters?: {
  typeId?: string;
  currencyCode?: string;
  direction?: "spending" | "profit";
  dateFrom?: string;
  dateTo?: string;
  query?: string;
  limit?: number;
}): Promise<BigBookEntry[]> {
  const supabase = await createClient();
  let query = supabase
    .from("business_ledger_entries")
    .select(
      `
      id, brand_id, entry_date, entry_direction, entry_type_id, explanation, amount, currency_code, remark, responsible_actor_id, created_by, updated_by, created_at, updated_at,
      business_ledger_types(id, code, name),
      big_book_actors(id, actor_code, display_name),
      business_ledger_attachments(id, ledger_entry_id, storage_path, file_name, mime_type, file_size, uploaded_by, created_at)
    `
    )
    .eq("brand_id", brandId)
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (filters?.typeId) query = query.eq("entry_type_id", filters.typeId);
  if (filters?.currencyCode) query = query.eq("currency_code", filters.currencyCode);
  if (filters?.direction) query = query.eq("entry_direction", filters.direction);
  if (filters?.dateFrom) query = query.gte("entry_date", filters.dateFrom);
  if (filters?.dateTo) query = query.lte("entry_date", filters.dateTo);
  if (filters?.query) query = query.ilike("explanation", `%${filters.query}%`);
  query = query.limit(filters?.limit ?? 500);

  const { data, error } = await query;
  if (error) throw error;

  const actorIds = new Set<string>();
  for (const row of data ?? []) {
    if (row.created_by) actorIds.add(row.created_by);
    if (row.updated_by) actorIds.add(row.updated_by);
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
      actorMap.set(actor.auth_user_id, actor.display_name?.trim() || actor.email || actor.auth_user_id);
    }
  }

  return (data ?? []).map((row) => {
    const type = Array.isArray(row.business_ledger_types)
      ? row.business_ledger_types[0]
      : row.business_ledger_types;
    const actor = Array.isArray(row.big_book_actors)
      ? row.big_book_actors[0]
      : row.big_book_actors;
    const attachments = (Array.isArray(row.business_ledger_attachments)
      ? row.business_ledger_attachments
      : row.business_ledger_attachments
        ? [row.business_ledger_attachments]
        : []) as BigBookAttachment[];

    return {
      id: row.id,
      brand_id: row.brand_id,
      entry_date: row.entry_date,
      entry_direction: row.entry_direction as "spending" | "profit",
      entry_type_id: row.entry_type_id,
      explanation: row.explanation,
      amount: Number(row.amount),
      currency_code: row.currency_code,
      remark: row.remark,
      responsible_actor_id: row.responsible_actor_id,
      created_by: row.created_by,
      updated_by: row.updated_by,
      created_at: row.created_at,
      updated_at: row.updated_at,
      type_name: type?.name ?? "-",
      type_code: type?.code ?? "-",
      actor_code: (actor?.actor_code ?? "A") as "A" | "B",
      actor_display_name: actor?.display_name ?? "-",
      creator_display_name: row.created_by ? (actorMap.get(row.created_by) ?? row.created_by) : "-",
      updater_display_name: row.updated_by ? (actorMap.get(row.updated_by) ?? row.updated_by) : "-",
      attachments: attachments.map((attachment) => ({
        ...attachment,
        file_size: Number(attachment.file_size)
      }))
    };
  });
}

export async function getBigBookActorCurrencyMetrics(
  brandId: string
): Promise<BigBookActorCurrencyMetrics[]> {
  const supabase = await createClient();
  const pageSize = 1000;
  let offset = 0;
  const rows: Array<{
    responsible_actor_id: string;
    entry_direction: "spending" | "profit";
    currency_code: "IDR" | "MYR" | "USDT" | "TRX";
    amount: number;
    big_book_actors: { actor_code: "A" | "B"; display_name: string } | { actor_code: "A" | "B"; display_name: string }[] | null;
  }> = [];

  while (true) {
    const { data, error } = await supabase
      .from("business_ledger_entries")
      .select(
        `
        responsible_actor_id, entry_direction, currency_code, amount,
        big_book_actors(actor_code, display_name)
      `
      )
      .eq("brand_id", brandId)
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;
    const batch = (data ?? []) as typeof rows;
    rows.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }

  const byActor = new Map<string, BigBookActorCurrencyMetrics>();
  for (const row of rows) {
    const actor = Array.isArray(row.big_book_actors) ? row.big_book_actors[0] : row.big_book_actors;
    const actorId = row.responsible_actor_id;
    const existing =
      byActor.get(actorId) ??
      ({
        actor_id: actorId,
        actor_code: (actor?.actor_code ?? "A") as "A" | "B",
        actor_display_name: actor?.display_name ?? "Unknown Actor",
        totals: { IDR: 0, MYR: 0, USDT: 0, TRX: 0 }
      } as BigBookActorCurrencyMetrics);
    const signedAmount = row.entry_direction === "spending" ? -Math.abs(Number(row.amount)) : Math.abs(Number(row.amount));
    existing.totals[row.currency_code] += signedAmount;
    byActor.set(actorId, existing);
  }

  return [...byActor.values()].sort((a, b) => a.actor_code.localeCompare(b.actor_code));
}

const BIG_BOOK_MONTH_LABELS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export function buildBigBookTypeMonthlyCurrencySummary(
  rows: Array<{
    entry_date: string;
    entry_direction: "spending" | "profit";
    currency_code: "IDR" | "MYR" | "USDT" | "TRX";
    amount: number;
  }>
): BigBookMonthlyCurrencyRow[] {
  const summary = BIG_BOOK_MONTH_LABELS.map((monthLabel, index) => ({
    month_index: index + 1,
    month_label: monthLabel,
    totals: {
      IDR: 0,
      MYR: 0,
      USDT: 0
    }
  }));

  for (const row of rows) {
    const date = new Date(`${row.entry_date}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) continue;
    const monthIndex = date.getUTCMonth();
    if (monthIndex < 0 || monthIndex > 11) continue;
    if (row.currency_code === "TRX") continue;
    const signedAmount = row.entry_direction === "spending" ? -Math.abs(Number(row.amount)) : Math.abs(Number(row.amount));
    summary[monthIndex].totals[row.currency_code] += signedAmount;
  }

  return summary;
}

export async function getBigBookTypeMonthlyCurrencySummary(
  brandId: string,
  typeId: string,
  year: number
): Promise<BigBookMonthlyCurrencyRow[]> {
  const supabase = await createClient();
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;
  const { data, error } = await supabase
    .from("business_ledger_entries")
    .select("entry_date, entry_direction, currency_code, amount")
    .eq("brand_id", brandId)
    .eq("entry_type_id", typeId)
    .gte("entry_date", startDate)
    .lte("entry_date", endDate);

  if (error) throw error;

  return buildBigBookTypeMonthlyCurrencySummary(
    ((data ?? []) as Array<{
      entry_date: string;
      entry_direction: "spending" | "profit";
      currency_code: "IDR" | "MYR" | "USDT" | "TRX";
      amount: number;
    }>).map((row) => ({
      ...row,
      amount: Number(row.amount)
    }))
  );
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
  transactionNo?: string;
  merchantName?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
};

type WebTransactionComparisonFilters = {
  status?: string;
  canonicalType?: string;
  transactionNo?: string;
  outcome?: "matched" | "mismatched" | "missing_in_backoffice" | "missing_in_gateway";
  dateFrom?: string;
  dateTo?: string;
  limitPerSource?: number;
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
  if (filters.transactionNo) {
    query = query.ilike("external_txn_no", `%${filters.transactionNo}%`);
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
      if (row.canonical_type === "Payin") {
        acc.payin_count += 1;
        acc.payin_amount += row.amount;
      } else if (row.canonical_type === "Payout") {
        acc.payout_count += 1;
        acc.payout_amount += row.amount;
      }
      return acc;
    },
    {
      total_count: 0,
      successful_count: 0,
      gross_amount: 0,
      fee_amount: 0,
      net_amount: 0,
      payin_count: 0,
      payin_amount: 0,
      payout_count: 0,
      payout_amount: 0
    }
  );
}

function buildComparisonKey(row: Pick<WebTransaction, "external_txn_no" | "canonical_type">): string {
  return `${row.external_txn_no}::${row.canonical_type.toLowerCase()}`;
}

function buildSourceMetrics(rows: WebTransaction[]) {
  return rows.reduce<WebTransactionComparisonMetrics["backoffice"]>(
    (acc, row) => {
      acc.total_count += 1;
      acc.total_amount += row.amount;
      if (row.canonical_type === "Payin") {
        acc.payin_count += 1;
        acc.payin_amount += row.amount;
      } else if (row.canonical_type === "Payout") {
        acc.payout_count += 1;
        acc.payout_amount += row.amount;
      }
      return acc;
    },
    {
      total_count: 0,
      total_amount: 0,
      payin_count: 0,
      payin_amount: 0,
      payout_count: 0,
      payout_amount: 0
    }
  );
}

function buildComparisonRows(
  backofficeRows: WebTransaction[],
  paymentGatewayRows: WebTransaction[]
): WebTransactionComparisonRow[] {
  const backofficeByKey = new Map<string, WebTransaction>();
  for (const row of backofficeRows) {
    backofficeByKey.set(buildComparisonKey(row), row);
  }

  const paymentGatewayByKey = new Map<string, WebTransaction>();
  for (const row of paymentGatewayRows) {
    paymentGatewayByKey.set(buildComparisonKey(row), row);
  }

  const keys = new Set<string>([...backofficeByKey.keys(), ...paymentGatewayByKey.keys()]);
  const comparisonRows: WebTransactionComparisonRow[] = [];

  for (const key of keys) {
    const backoffice = backofficeByKey.get(key) ?? null;
    const paymentGateway = paymentGatewayByKey.get(key) ?? null;
    let outcome: WebTransactionComparisonRow["outcome"];
    let statusMatches = false;
    let typeMatches = false;
    let amountMatches = false;

    if (backoffice && paymentGateway) {
      statusMatches = backoffice.canonical_status === paymentGateway.canonical_status;
      typeMatches = backoffice.canonical_type === paymentGateway.canonical_type;
      amountMatches = backoffice.amount === paymentGateway.amount;
      outcome = statusMatches && typeMatches && amountMatches ? "matched" : "mismatched";
    } else if (backoffice) {
      outcome = "missing_in_gateway";
    } else {
      outcome = "missing_in_backoffice";
    }

    comparisonRows.push({
      comparison_key: key,
      transaction_no: backoffice?.external_txn_no ?? paymentGateway?.external_txn_no ?? "-",
      canonical_type: backoffice?.canonical_type ?? paymentGateway?.canonical_type ?? "-",
      outcome,
      status_matches: statusMatches,
      type_matches: typeMatches,
      amount_matches: amountMatches,
      backoffice: backoffice
        ? {
            id: backoffice.id,
            create_time: backoffice.create_time,
            canonical_status: backoffice.canonical_status,
            canonical_type: backoffice.canonical_type,
            amount: backoffice.amount
          }
        : null,
      payment_gateway: paymentGateway
        ? {
            id: paymentGateway.id,
            create_time: paymentGateway.create_time,
            canonical_status: paymentGateway.canonical_status,
            canonical_type: paymentGateway.canonical_type,
            amount: paymentGateway.amount
          }
        : null
    });
  }

  return comparisonRows.sort((a, b) => {
    const aTime = Math.max(
      a.backoffice ? Date.parse(a.backoffice.create_time) : Number.NEGATIVE_INFINITY,
      a.payment_gateway ? Date.parse(a.payment_gateway.create_time) : Number.NEGATIVE_INFINITY
    );
    const bTime = Math.max(
      b.backoffice ? Date.parse(b.backoffice.create_time) : Number.NEGATIVE_INFINITY,
      b.payment_gateway ? Date.parse(b.payment_gateway.create_time) : Number.NEGATIVE_INFINITY
    );
    return bTime - aTime;
  });
}

export function buildWebTransactionComparison(
  backofficeRows: WebTransaction[],
  paymentGatewayRows: WebTransaction[]
): WebTransactionComparisonResult {
  const rows = buildComparisonRows(backofficeRows, paymentGatewayRows);
  const metrics: WebTransactionComparisonMetrics = {
    backoffice: buildSourceMetrics(backofficeRows),
    payment_gateway: buildSourceMetrics(paymentGatewayRows),
    matched_count: 0,
    mismatched_count: 0,
    missing_in_backoffice_count: 0,
    missing_in_gateway_count: 0
  };

  for (const row of rows) {
    if (row.outcome === "matched") {
      metrics.matched_count += 1;
    } else if (row.outcome === "mismatched") {
      metrics.mismatched_count += 1;
    } else if (row.outcome === "missing_in_backoffice") {
      metrics.missing_in_backoffice_count += 1;
    } else if (row.outcome === "missing_in_gateway") {
      metrics.missing_in_gateway_count += 1;
    }
  }

  return {
    rows,
    metrics
  };
}

export async function getWebTransactionComparison(
  brandId: string,
  filters: WebTransactionComparisonFilters = {}
): Promise<WebTransactionComparisonResult> {
  const sharedFilters = {
    status: filters.status,
    canonicalType: filters.canonicalType,
    transactionNo: filters.transactionNo,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    limit: filters.limitPerSource ?? 2_000
  };

  const [backofficeRows, paymentGatewayRows] = await Promise.all([
    getWebTransactions(brandId, {
      sourceSystem: "backoffice",
      ...sharedFilters
    }),
    getWebTransactions(brandId, {
      sourceSystem: "payment_gateway",
      ...sharedFilters
    })
  ]);

  const result = buildWebTransactionComparison(backofficeRows, paymentGatewayRows);
  if (!filters.outcome) {
    return result;
  }

  return {
    rows: result.rows.filter((row) => row.outcome === filters.outcome),
    metrics: result.metrics
  };
}
