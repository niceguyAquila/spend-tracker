import { createClient } from "@/lib/supabase/server";
import {
  BigBookActor,
  BigBookAllowedUserOption,
  BigBookActorCurrencyMetrics,
  BigBookAttachment,
  BigBookEntry,
  BigBookLedgerSubType,
  BigBookLedgerType,
  BigBookTypeCashflowByCurrency,
  BigBookTypeCashflowRow,
  BigBookMonthlyCurrencyRow,
  CreditBookActor,
  CreditBookAllowedUserOption,
  CreditBookActorCurrencyMetrics,
  CreditBookActorOutstandingMetrics,
  CreditBookAttachment,
  CreditBookEntry,
  CreditBookEntryStatus,
  CreditBookLedgerSubType,
  CreditBookLedgerType,
  CreditBookSettlement,
  CreditBookSettlementAttachment,
  CreditBookTypeCashflowByCurrency,
  CreditBookTypeCashflowRow,
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

export async function getBigBookLedgerTypeByCode(
  code: string,
  options?: { includeInactive?: boolean }
): Promise<BigBookLedgerType | null> {
  const normalized = code.trim();
  if (!normalized) return null;

  const supabase = await createClient();
  let query = supabase
    .from("business_ledger_types")
    .select("id, code, name, is_active, sort_order, created_at, updated_at")
    .eq("code", normalized);

  if (!options?.includeInactive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return {
    ...data,
    sort_order: Number(data.sort_order)
  };
}

export async function getBigBookLedgerSubTypes(options?: {
  typeId?: string;
  includeInactive?: boolean;
}): Promise<BigBookLedgerSubType[]> {
  const supabase = await createClient();
  let query = supabase
    .from("business_ledger_sub_types")
    .select("id, entry_type_id, code, name, is_active, sort_order, created_at, updated_at")
    .order("entry_type_id", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (options?.typeId) {
    query = query.eq("entry_type_id", options.typeId);
  }
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

export type BigBookEntryFilters = {
  typeId?: string[];
  currencyCode?: string[];
  direction?: Array<"spending" | "profit">;
  actorId?: string[];
  dateFrom?: string;
  dateTo?: string;
  query?: string;
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function sanitizeBigBookSearchQuery(value: string): string {
  // Strip characters that have special meaning for Supabase `.or()` / `.ilike()`
  // so user input cannot break the filter expression or inject wildcards.
  return value.replace(/[,()%]/g, " ").trim();
}

// Defensive: callers occasionally pass a single id instead of an array. Without
// this, supabase-js's `.in()` would iterate the string's characters and send
// each one as a UUID, producing `invalid input syntax for type uuid: "<char>"`.
function toFilterArray<T>(value: T | T[] | undefined | null): T[] | undefined {
  if (value === undefined || value === null) return undefined;
  return Array.isArray(value) ? value : [value];
}

export async function getBigBookEntries(filters?: BigBookEntryFilters & { limit?: number }): Promise<BigBookEntry[]> {
  const supabase = await createClient();
  let query = supabase
    .from("business_ledger_entries")
    .select(
      `
      id, entry_date, entry_direction, entry_type_id, entry_sub_type_id, explanation, amount, currency_code, remark, responsible_actor_id, created_by, updated_by, created_at, updated_at,
      business_ledger_types(id, code, name),
      business_ledger_sub_types(id, code, name),
      big_book_actors(id, actor_code, display_name),
      business_ledger_attachments(id, ledger_entry_id, storage_path, file_name, mime_type, file_size, uploaded_by, created_at)
    `
    )
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false });

  const filterTypeIds = toFilterArray(filters?.typeId);
  const filterCurrencyCodes = toFilterArray(filters?.currencyCode);
  const filterDirections = toFilterArray(filters?.direction);
  const filterActorIds = toFilterArray(filters?.actorId);
  if (filterTypeIds?.length) query = query.in("entry_type_id", filterTypeIds);
  if (filterCurrencyCodes?.length) query = query.in("currency_code", filterCurrencyCodes);
  if (filterDirections?.length) query = query.in("entry_direction", filterDirections);
  if (filterActorIds?.length) query = query.in("responsible_actor_id", filterActorIds);
  if (filters?.dateFrom) query = query.gte("entry_date", filters.dateFrom);
  if (filters?.dateTo) query = query.lte("entry_date", filters.dateTo);
  if (filters?.query) {
    const sanitized = sanitizeBigBookSearchQuery(filters.query);
    if (sanitized) {
      query = query.or(`explanation.ilike.%${sanitized}%,remark.ilike.%${sanitized}%`);
    }
  }
  query = query.limit(filters?.limit ?? 500);

  const { data, error } = await query;
  if (error) throw error;

  const actorIds = new Set<string>();
  for (const row of data ?? []) {
    if (row.created_by && isUuid(row.created_by)) actorIds.add(row.created_by);
    if (row.updated_by && isUuid(row.updated_by)) actorIds.add(row.updated_by);
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
    const subType = Array.isArray(row.business_ledger_sub_types)
      ? row.business_ledger_sub_types[0]
      : row.business_ledger_sub_types;
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
      entry_date: row.entry_date,
      entry_direction: row.entry_direction as "spending" | "profit",
      entry_type_id: row.entry_type_id,
      entry_sub_type_id: row.entry_sub_type_id ?? null,
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
      sub_type_name: subType?.name ?? null,
      sub_type_code: subType?.code ?? null,
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

export type BigBookEntriesPagedResult = {
  rows: BigBookEntry[];
  totalCount: number;
};

export async function getBigBookEntriesPaged(
  filters: BigBookEntryFilters & { page: number; pageSize: number }
): Promise<BigBookEntriesPagedResult> {
  const supabase = await createClient();
  const page = Math.max(0, Math.floor(filters.page));
  const pageSize = Math.max(1, Math.floor(filters.pageSize));
  const fromIndex = page * pageSize;
  const toIndex = fromIndex + pageSize - 1;

  let query = supabase
    .from("business_ledger_entries")
    .select(
      `
      id, entry_date, entry_direction, entry_type_id, entry_sub_type_id, explanation, amount, currency_code, remark, responsible_actor_id, created_by, updated_by, created_at, updated_at,
      business_ledger_types(id, code, name),
      business_ledger_sub_types(id, code, name),
      big_book_actors(id, actor_code, display_name),
      business_ledger_attachments(id, ledger_entry_id, storage_path, file_name, mime_type, file_size, uploaded_by, created_at)
    `,
      { count: "exact" }
    )
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false });

  const filterTypeIds = toFilterArray(filters.typeId);
  const filterCurrencyCodes = toFilterArray(filters.currencyCode);
  const filterDirections = toFilterArray(filters.direction);
  const filterActorIds = toFilterArray(filters.actorId);
  if (filterTypeIds?.length) query = query.in("entry_type_id", filterTypeIds);
  if (filterCurrencyCodes?.length) query = query.in("currency_code", filterCurrencyCodes);
  if (filterDirections?.length) query = query.in("entry_direction", filterDirections);
  if (filterActorIds?.length) query = query.in("responsible_actor_id", filterActorIds);
  if (filters.dateFrom) query = query.gte("entry_date", filters.dateFrom);
  if (filters.dateTo) query = query.lte("entry_date", filters.dateTo);
  if (filters.query) {
    const sanitized = sanitizeBigBookSearchQuery(filters.query);
    if (sanitized) {
      query = query.or(`explanation.ilike.%${sanitized}%,remark.ilike.%${sanitized}%`);
    }
  }

  query = query.range(fromIndex, toIndex);

  const { data, error, count } = await query;
  if (error) throw error;

  const totalCount = count ?? 0;

  const actorIds = new Set<string>();
  for (const row of data ?? []) {
    if (row.created_by && isUuid(row.created_by)) actorIds.add(row.created_by);
    if (row.updated_by && isUuid(row.updated_by)) actorIds.add(row.updated_by);
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

  const rows: BigBookEntry[] = (data ?? []).map((row) => {
    const type = Array.isArray(row.business_ledger_types)
      ? row.business_ledger_types[0]
      : row.business_ledger_types;
    const subType = Array.isArray(row.business_ledger_sub_types)
      ? row.business_ledger_sub_types[0]
      : row.business_ledger_sub_types;
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
      entry_date: row.entry_date,
      entry_direction: row.entry_direction as "spending" | "profit",
      entry_type_id: row.entry_type_id,
      entry_sub_type_id: row.entry_sub_type_id ?? null,
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
      sub_type_name: subType?.name ?? null,
      sub_type_code: subType?.code ?? null,
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

  return { rows, totalCount };
}

export async function getBigBookActorCurrencyMetrics(): Promise<BigBookActorCurrencyMetrics[]> {
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

export async function getBigBookTypeCashflowByCurrency(filters?: {
  actorId?: string[];
  typeId?: string[];
  currencyCode?: Array<BigBookTypeCashflowByCurrency["currency"]>;
  dateFrom?: string;
  dateTo?: string;
}): Promise<BigBookTypeCashflowByCurrency[]> {
  const activeTypes = await getBigBookLedgerTypes({ includeInactive: true });
  const allCurrencies: Array<BigBookTypeCashflowByCurrency["currency"]> = ["IDR", "MYR", "USDT", "TRX"];
  const currencies = filters?.currencyCode?.length
    ? allCurrencies.filter((currency) => filters.currencyCode!.includes(currency))
    : allCurrencies;
  const entries = await getBigBookEntries({
    actorId: filters?.actorId,
    typeId: filters?.typeId,
    currencyCode: filters?.currencyCode,
    dateFrom: filters?.dateFrom,
    dateTo: filters?.dateTo,
    limit: 5000
  });
  const typeMap = new Map(activeTypes.map((type) => [type.id, type]));

  const totalsMap = new Map<string, { inflow: number; outflow: number; net: number }>();
  for (const entry of entries) {
    const amount = Math.abs(Number(entry.amount));
    const key = `${entry.currency_code}:${entry.responsible_actor_id}:${entry.entry_type_id}`;
    const existing = totalsMap.get(key) ?? { inflow: 0, outflow: 0, net: 0 };

    if (entry.entry_direction === "profit") {
      existing.inflow += amount;
      existing.net += amount;
    } else {
      existing.outflow += amount;
      existing.net -= amount;
    }

    totalsMap.set(key, existing);
  }

  return currencies.map((currency) => {
    const rowMap = entries
      .filter((entry) => entry.currency_code === currency)
      .reduce<Map<string, BigBookTypeCashflowRow>>((acc, entry) => {
        const rowKey = `${entry.responsible_actor_id}:${entry.entry_type_id}`;
        if (acc.has(rowKey)) return acc;
        const type = typeMap.get(entry.entry_type_id);
        acc.set(rowKey, {
          row_key: rowKey,
          actor_id: entry.responsible_actor_id,
          actor_display_name: entry.actor_display_name,
          type_id: entry.entry_type_id,
          type_code: type?.code ?? entry.type_code,
          type_name: type?.name ?? entry.type_name,
          inflow: 0,
          outflow: 0,
          net: 0
        });
        return acc;
      }, new Map<string, BigBookTypeCashflowRow>());
    const rows: BigBookTypeCashflowRow[] = Array.from(rowMap.values());

    for (const row of rows) {
      const totals =
        totalsMap.get(`${currency}:${row.actor_id}:${row.type_id}`) ?? {
          inflow: 0,
          outflow: 0,
          net: 0
        };
      row.inflow = totals.inflow;
      row.outflow = totals.outflow;
      row.net = totals.net;
    }

    rows.sort((a, b) => {
      if (a.actor_display_name !== b.actor_display_name) {
        return a.actor_display_name.localeCompare(b.actor_display_name);
      }
      return a.type_name.localeCompare(b.type_name);
    });

    const combined = rows.reduce(
      (acc, row) => ({
        inflow: acc.inflow + row.inflow,
        outflow: acc.outflow + row.outflow,
        net: acc.net + row.net
      }),
      { inflow: 0, outflow: 0, net: 0 }
    );

    return { currency, rows, combined };
  });
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
  typeId: string,
  year: number
): Promise<BigBookMonthlyCurrencyRow[]> {
  const supabase = await createClient();
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;
  const { data, error } = await supabase
    .from("business_ledger_entries")
    .select("entry_date, entry_direction, currency_code, amount")
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

export async function getCreditBookLedgerTypes(options?: {
  includeInactive?: boolean;
}): Promise<CreditBookLedgerType[]> {
  const supabase = await createClient();
  let query = supabase
    .from("credit_ledger_types")
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

export async function getCreditBookLedgerTypeByCode(
  code: string,
  options?: { includeInactive?: boolean }
): Promise<CreditBookLedgerType | null> {
  const normalized = code.trim();
  if (!normalized) return null;

  const supabase = await createClient();
  let query = supabase
    .from("credit_ledger_types")
    .select("id, code, name, is_active, sort_order, created_at, updated_at")
    .eq("code", normalized);

  if (!options?.includeInactive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return {
    ...data,
    sort_order: Number(data.sort_order)
  };
}

export async function getCreditBookLedgerSubTypes(options?: {
  typeId?: string;
  includeInactive?: boolean;
}): Promise<CreditBookLedgerSubType[]> {
  const supabase = await createClient();
  let query = supabase
    .from("credit_ledger_sub_types")
    .select("id, entry_type_id, code, name, is_active, sort_order, created_at, updated_at")
    .order("entry_type_id", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (options?.typeId) {
    query = query.eq("entry_type_id", options.typeId);
  }
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

export async function getCreditBookActors(): Promise<CreditBookActor[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("credit_book_actors")
    .select("id, actor_code, display_name, user_id")
    .order("actor_code", { ascending: true });

  if (error) throw error;
  return (data ?? []) as CreditBookActor[];
}

export async function getCreditBookAllowedUsers(): Promise<CreditBookAllowedUserOption[]> {
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

export type CreditBookEntryFilters = {
  typeId?: string[];
  currencyCode?: string[];
  direction?: Array<"credit" | "debt">;
  actorId?: string[];
  status?: CreditBookEntryStatus[];
  dateFrom?: string;
  dateTo?: string;
  query?: string;
};

function isCreditBookUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function sanitizeCreditBookSearchQuery(value: string): string {
  return value.replace(/[,()%]/g, " ").trim();
}

function toCreditBookFilterArray<T>(value: T | T[] | undefined | null): T[] | undefined {
  if (value === undefined || value === null) return undefined;
  return Array.isArray(value) ? value : [value];
}

const CREDIT_BOOK_SETTLEMENT_EPSILON = 0.0001;

function computeCreditBookEntryStatus(amount: number, totalSettled: number): CreditBookEntryStatus {
  if (totalSettled <= CREDIT_BOOK_SETTLEMENT_EPSILON) return "open";
  if (totalSettled + CREDIT_BOOK_SETTLEMENT_EPSILON >= amount) return "settled";
  return "partial";
}

type RawCreditBookSettlementRow = {
  id: string;
  entry_id: string;
  settlement_date: string;
  amount: number;
  settlement_currency_code: "IDR" | "MYR" | "USDT" | "TRX";
  conversion_rate: number;
  amount_in_entry_currency: number;
  note: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  credit_ledger_settlement_attachments?:
    | Array<{
        id: string;
        settlement_id: string;
        storage_path: string;
        file_name: string;
        mime_type: string;
        file_size: number;
        uploaded_by: string | null;
        created_at: string;
      }>
    | {
        id: string;
        settlement_id: string;
        storage_path: string;
        file_name: string;
        mime_type: string;
        file_size: number;
        uploaded_by: string | null;
        created_at: string;
      }
    | null;
};

async function fetchCreditBookSettlementsForEntries(
  supabase: Awaited<ReturnType<typeof createClient>>,
  entryIds: string[]
): Promise<Map<string, RawCreditBookSettlementRow[]>> {
  const result = new Map<string, RawCreditBookSettlementRow[]>();
  if (!entryIds.length) return result;

  const { data, error } = await supabase
    .from("credit_ledger_settlements")
    .select(
      `
      id, entry_id, settlement_date, amount, settlement_currency_code, conversion_rate, amount_in_entry_currency, note, created_by, updated_by, created_at, updated_at,
      credit_ledger_settlement_attachments(id, settlement_id, storage_path, file_name, mime_type, file_size, uploaded_by, created_at)
    `
    )
    .in("entry_id", entryIds)
    .order("settlement_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;

  for (const row of (data ?? []) as RawCreditBookSettlementRow[]) {
    const existing = result.get(row.entry_id) ?? [];
    existing.push(row);
    result.set(row.entry_id, existing);
  }
  return result;
}

function mapCreditBookSettlementRow(
  row: RawCreditBookSettlementRow,
  actorMap: Map<string, string>
): CreditBookSettlement {
  const attachments = (Array.isArray(row.credit_ledger_settlement_attachments)
    ? row.credit_ledger_settlement_attachments
    : row.credit_ledger_settlement_attachments
      ? [row.credit_ledger_settlement_attachments]
      : []) as CreditBookSettlementAttachment[];
  return {
    id: row.id,
    entry_id: row.entry_id,
    settlement_date: row.settlement_date,
    amount: Number(row.amount),
    settlement_currency_code: row.settlement_currency_code,
    conversion_rate: Number(row.conversion_rate),
    amount_in_entry_currency: Number(row.amount_in_entry_currency),
    note: row.note,
    created_by: row.created_by,
    updated_by: row.updated_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    creator_display_name: row.created_by ? (actorMap.get(row.created_by) ?? row.created_by) : "-",
    updater_display_name: row.updated_by ? (actorMap.get(row.updated_by) ?? row.updated_by) : "-",
    attachments: attachments.map((attachment) => ({
      ...attachment,
      file_size: Number(attachment.file_size)
    }))
  };
}

export async function getCreditBookEntries(
  filters?: CreditBookEntryFilters & { limit?: number }
): Promise<CreditBookEntry[]> {
  const supabase = await createClient();
  let query = supabase
    .from("credit_ledger_entries")
    .select(
      `
      id, entry_date, entry_direction, entry_type_id, entry_sub_type_id, explanation, amount, currency_code, remark, responsible_actor_id, created_by, updated_by, created_at, updated_at,
      credit_ledger_types(id, code, name),
      credit_ledger_sub_types(id, code, name),
      credit_book_actors(id, actor_code, display_name),
      credit_ledger_attachments(id, ledger_entry_id, storage_path, file_name, mime_type, file_size, uploaded_by, created_at)
    `
    )
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false });

  const filterTypeIds = toCreditBookFilterArray(filters?.typeId);
  const filterCurrencyCodes = toCreditBookFilterArray(filters?.currencyCode);
  const filterDirections = toCreditBookFilterArray(filters?.direction);
  const filterActorIds = toCreditBookFilterArray(filters?.actorId);
  const filterStatuses = toCreditBookFilterArray(filters?.status);
  if (filterTypeIds?.length) query = query.in("entry_type_id", filterTypeIds);
  if (filterCurrencyCodes?.length) query = query.in("currency_code", filterCurrencyCodes);
  if (filterDirections?.length) query = query.in("entry_direction", filterDirections);
  if (filterActorIds?.length) query = query.in("responsible_actor_id", filterActorIds);
  if (filters?.dateFrom) query = query.gte("entry_date", filters.dateFrom);
  if (filters?.dateTo) query = query.lte("entry_date", filters.dateTo);
  if (filters?.query) {
    const sanitized = sanitizeCreditBookSearchQuery(filters.query);
    if (sanitized) {
      query = query.or(`explanation.ilike.%${sanitized}%,remark.ilike.%${sanitized}%`);
    }
  }
  query = query.limit(filters?.limit ?? 500);

  const { data, error } = await query;
  if (error) throw error;

  const actorIds = new Set<string>();
  for (const row of data ?? []) {
    if (row.created_by && isCreditBookUuid(row.created_by)) actorIds.add(row.created_by);
    if (row.updated_by && isCreditBookUuid(row.updated_by)) actorIds.add(row.updated_by);
  }

  const settlementsByEntry = await fetchCreditBookSettlementsForEntries(
    supabase,
    (data ?? []).map((row) => row.id as string)
  );
  for (const settlements of settlementsByEntry.values()) {
    for (const s of settlements) {
      if (s.created_by && isCreditBookUuid(s.created_by)) actorIds.add(s.created_by);
      if (s.updated_by && isCreditBookUuid(s.updated_by)) actorIds.add(s.updated_by);
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
      actorMap.set(actor.auth_user_id, actor.display_name?.trim() || actor.email || actor.auth_user_id);
    }
  }

  const mapped = (data ?? []).map((row) => {
    const type = Array.isArray(row.credit_ledger_types)
      ? row.credit_ledger_types[0]
      : row.credit_ledger_types;
    const subType = Array.isArray(row.credit_ledger_sub_types)
      ? row.credit_ledger_sub_types[0]
      : row.credit_ledger_sub_types;
    const actor = Array.isArray(row.credit_book_actors)
      ? row.credit_book_actors[0]
      : row.credit_book_actors;
    const attachments = (Array.isArray(row.credit_ledger_attachments)
      ? row.credit_ledger_attachments
      : row.credit_ledger_attachments
        ? [row.credit_ledger_attachments]
        : []) as CreditBookAttachment[];

    const settlementsRaw = settlementsByEntry.get(row.id as string) ?? [];
    const settlements: CreditBookSettlement[] = settlementsRaw.map((s) =>
      mapCreditBookSettlementRow(s, actorMap)
    );
    const amount = Number(row.amount);
    const totalSettled = settlements.reduce((sum, s) => sum + s.amount_in_entry_currency, 0);
    const outstanding = Math.max(0, amount - totalSettled);
    const status = computeCreditBookEntryStatus(amount, totalSettled);

    return {
      id: row.id,
      entry_date: row.entry_date,
      entry_direction: row.entry_direction as "credit" | "debt",
      entry_type_id: row.entry_type_id,
      entry_sub_type_id: row.entry_sub_type_id ?? null,
      explanation: row.explanation,
      amount,
      currency_code: row.currency_code,
      remark: row.remark,
      responsible_actor_id: row.responsible_actor_id,
      created_by: row.created_by,
      updated_by: row.updated_by,
      created_at: row.created_at,
      updated_at: row.updated_at,
      type_name: type?.name ?? "-",
      type_code: type?.code ?? "-",
      sub_type_name: subType?.name ?? null,
      sub_type_code: subType?.code ?? null,
      actor_code: (actor?.actor_code ?? "A") as "A" | "B",
      actor_display_name: actor?.display_name ?? "-",
      creator_display_name: row.created_by ? (actorMap.get(row.created_by) ?? row.created_by) : "-",
      updater_display_name: row.updated_by ? (actorMap.get(row.updated_by) ?? row.updated_by) : "-",
      attachments: attachments.map((attachment) => ({
        ...attachment,
        file_size: Number(attachment.file_size)
      })),
      total_settled: totalSettled,
      outstanding,
      status,
      settlements
    } as CreditBookEntry;
  });

  if (filterStatuses?.length) {
    return mapped.filter((entry) => filterStatuses.includes(entry.status));
  }
  return mapped;
}

export type CreditBookEntriesPagedResult = {
  rows: CreditBookEntry[];
  totalCount: number;
};

export async function getCreditBookEntriesPaged(
  filters: CreditBookEntryFilters & { page: number; pageSize: number }
): Promise<CreditBookEntriesPagedResult> {
  const page = Math.max(0, Math.floor(filters.page));
  const pageSize = Math.max(1, Math.floor(filters.pageSize));

  const filterStatuses = toCreditBookFilterArray(filters.status);

  if (filterStatuses?.length) {
    const all = await getCreditBookEntries({
      typeId: filters.typeId,
      currencyCode: filters.currencyCode,
      direction: filters.direction,
      actorId: filters.actorId,
      status: filters.status,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      query: filters.query,
      limit: 5000
    });
    const totalCount = all.length;
    const fromIndex = page * pageSize;
    const rows = all.slice(fromIndex, fromIndex + pageSize);
    return { rows, totalCount };
  }

  const supabase = await createClient();
  const fromIndex = page * pageSize;
  const toIndex = fromIndex + pageSize - 1;

  let query = supabase
    .from("credit_ledger_entries")
    .select(
      `
      id, entry_date, entry_direction, entry_type_id, entry_sub_type_id, explanation, amount, currency_code, remark, responsible_actor_id, created_by, updated_by, created_at, updated_at,
      credit_ledger_types(id, code, name),
      credit_ledger_sub_types(id, code, name),
      credit_book_actors(id, actor_code, display_name),
      credit_ledger_attachments(id, ledger_entry_id, storage_path, file_name, mime_type, file_size, uploaded_by, created_at)
    `,
      { count: "exact" }
    )
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false });

  const filterTypeIds = toCreditBookFilterArray(filters.typeId);
  const filterCurrencyCodes = toCreditBookFilterArray(filters.currencyCode);
  const filterDirections = toCreditBookFilterArray(filters.direction);
  const filterActorIds = toCreditBookFilterArray(filters.actorId);
  if (filterTypeIds?.length) query = query.in("entry_type_id", filterTypeIds);
  if (filterCurrencyCodes?.length) query = query.in("currency_code", filterCurrencyCodes);
  if (filterDirections?.length) query = query.in("entry_direction", filterDirections);
  if (filterActorIds?.length) query = query.in("responsible_actor_id", filterActorIds);
  if (filters.dateFrom) query = query.gte("entry_date", filters.dateFrom);
  if (filters.dateTo) query = query.lte("entry_date", filters.dateTo);
  if (filters.query) {
    const sanitized = sanitizeCreditBookSearchQuery(filters.query);
    if (sanitized) {
      query = query.or(`explanation.ilike.%${sanitized}%,remark.ilike.%${sanitized}%`);
    }
  }

  query = query.range(fromIndex, toIndex);

  const { data, error, count } = await query;
  if (error) throw error;

  const totalCount = count ?? 0;

  const actorIds = new Set<string>();
  for (const row of data ?? []) {
    if (row.created_by && isCreditBookUuid(row.created_by)) actorIds.add(row.created_by);
    if (row.updated_by && isCreditBookUuid(row.updated_by)) actorIds.add(row.updated_by);
  }

  const settlementsByEntry = await fetchCreditBookSettlementsForEntries(
    supabase,
    (data ?? []).map((row) => row.id as string)
  );
  for (const settlements of settlementsByEntry.values()) {
    for (const s of settlements) {
      if (s.created_by && isCreditBookUuid(s.created_by)) actorIds.add(s.created_by);
      if (s.updated_by && isCreditBookUuid(s.updated_by)) actorIds.add(s.updated_by);
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
      actorMap.set(actor.auth_user_id, actor.display_name?.trim() || actor.email || actor.auth_user_id);
    }
  }

  const rows: CreditBookEntry[] = (data ?? []).map((row) => {
    const type = Array.isArray(row.credit_ledger_types)
      ? row.credit_ledger_types[0]
      : row.credit_ledger_types;
    const subType = Array.isArray(row.credit_ledger_sub_types)
      ? row.credit_ledger_sub_types[0]
      : row.credit_ledger_sub_types;
    const actor = Array.isArray(row.credit_book_actors)
      ? row.credit_book_actors[0]
      : row.credit_book_actors;
    const attachments = (Array.isArray(row.credit_ledger_attachments)
      ? row.credit_ledger_attachments
      : row.credit_ledger_attachments
        ? [row.credit_ledger_attachments]
        : []) as CreditBookAttachment[];

    const settlementsRaw = settlementsByEntry.get(row.id as string) ?? [];
    const settlements: CreditBookSettlement[] = settlementsRaw.map((s) =>
      mapCreditBookSettlementRow(s, actorMap)
    );
    const amount = Number(row.amount);
    const totalSettled = settlements.reduce((sum, s) => sum + s.amount_in_entry_currency, 0);
    const outstanding = Math.max(0, amount - totalSettled);
    const status = computeCreditBookEntryStatus(amount, totalSettled);

    return {
      id: row.id,
      entry_date: row.entry_date,
      entry_direction: row.entry_direction as "credit" | "debt",
      entry_type_id: row.entry_type_id,
      entry_sub_type_id: row.entry_sub_type_id ?? null,
      explanation: row.explanation,
      amount,
      currency_code: row.currency_code,
      remark: row.remark,
      responsible_actor_id: row.responsible_actor_id,
      created_by: row.created_by,
      updated_by: row.updated_by,
      created_at: row.created_at,
      updated_at: row.updated_at,
      type_name: type?.name ?? "-",
      type_code: type?.code ?? "-",
      sub_type_name: subType?.name ?? null,
      sub_type_code: subType?.code ?? null,
      actor_code: (actor?.actor_code ?? "A") as "A" | "B",
      actor_display_name: actor?.display_name ?? "-",
      creator_display_name: row.created_by ? (actorMap.get(row.created_by) ?? row.created_by) : "-",
      updater_display_name: row.updated_by ? (actorMap.get(row.updated_by) ?? row.updated_by) : "-",
      attachments: attachments.map((attachment) => ({
        ...attachment,
        file_size: Number(attachment.file_size)
      })),
      total_settled: totalSettled,
      outstanding,
      status,
      settlements
    };
  });

  return { rows, totalCount };
}

export async function getCreditBookActorCurrencyMetrics(): Promise<CreditBookActorCurrencyMetrics[]> {
  const supabase = await createClient();
  const pageSize = 1000;
  let offset = 0;
  const rows: Array<{
    responsible_actor_id: string;
    entry_direction: "credit" | "debt";
    currency_code: "IDR" | "MYR" | "USDT" | "TRX";
    amount: number;
    credit_book_actors: { actor_code: "A" | "B"; display_name: string } | { actor_code: "A" | "B"; display_name: string }[] | null;
  }> = [];

  while (true) {
    const { data, error } = await supabase
      .from("credit_ledger_entries")
      .select(
        `
        responsible_actor_id, entry_direction, currency_code, amount,
        credit_book_actors(actor_code, display_name)
      `
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;
    const batch = (data ?? []) as typeof rows;
    rows.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }

  const byActor = new Map<string, CreditBookActorCurrencyMetrics>();
  for (const row of rows) {
    const actor = Array.isArray(row.credit_book_actors) ? row.credit_book_actors[0] : row.credit_book_actors;
    const actorId = row.responsible_actor_id;
    const existing =
      byActor.get(actorId) ??
      ({
        actor_id: actorId,
        actor_code: (actor?.actor_code ?? "A") as "A" | "B",
        actor_display_name: actor?.display_name ?? "Unknown Actor",
        totals: { IDR: 0, MYR: 0, USDT: 0, TRX: 0 }
      } as CreditBookActorCurrencyMetrics);
    const signedAmount = row.entry_direction === "debt" ? -Math.abs(Number(row.amount)) : Math.abs(Number(row.amount));
    existing.totals[row.currency_code] += signedAmount;
    byActor.set(actorId, existing);
  }

  // Net Grand Total per currency: start from ledger face amounts, then apply
  // every settlement's entry-currency equivalent (reduces credit exposure /
  // moves debt toward zero). Cross-currency settlements additionally record the
  // cash movement in the settlement currency so nothing is double-counted.
  type SettlementJoinRow = {
    amount: number;
    amount_in_entry_currency: number;
    settlement_currency_code: "IDR" | "MYR" | "USDT" | "TRX";
    credit_ledger_entries:
      | {
          responsible_actor_id: string;
          entry_direction: "credit" | "debt";
          currency_code: "IDR" | "MYR" | "USDT" | "TRX";
          credit_book_actors:
            | { actor_code: "A" | "B"; display_name: string }
            | { actor_code: "A" | "B"; display_name: string }[]
            | null;
        }
      | {
          responsible_actor_id: string;
          entry_direction: "credit" | "debt";
          currency_code: "IDR" | "MYR" | "USDT" | "TRX";
          credit_book_actors:
            | { actor_code: "A" | "B"; display_name: string }
            | { actor_code: "A" | "B"; display_name: string }[]
            | null;
        }[]
      | null;
  };
  const settlementRows: SettlementJoinRow[] = [];
  let settlementOffset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("credit_ledger_settlements")
      .select(
        `
        amount, amount_in_entry_currency, settlement_currency_code,
        credit_ledger_entries!inner(
          responsible_actor_id, entry_direction, currency_code,
          credit_book_actors(actor_code, display_name)
        )
      `
      )
      .order("created_at", { ascending: false })
      .range(settlementOffset, settlementOffset + pageSize - 1);
    if (error) throw error;
    const batch = (data ?? []) as SettlementJoinRow[];
    settlementRows.push(...batch);
    if (batch.length < pageSize) break;
    settlementOffset += pageSize;
  }

  for (const s of settlementRows) {
    const e = Array.isArray(s.credit_ledger_entries)
      ? s.credit_ledger_entries[0]
      : s.credit_ledger_entries;
    if (!e) continue;

    const actor = Array.isArray(e.credit_book_actors)
      ? e.credit_book_actors[0]
      : e.credit_book_actors;
    const actorId = e.responsible_actor_id;
    const existing =
      byActor.get(actorId) ??
      ({
        actor_id: actorId,
        actor_code: (actor?.actor_code ?? "A") as "A" | "B",
        actor_display_name: actor?.display_name ?? "Unknown Actor",
        totals: { IDR: 0, MYR: 0, USDT: 0, TRX: 0 }
      } as CreditBookActorCurrencyMetrics);

    const equiv = Math.abs(Number(s.amount_in_entry_currency));
    const directionSign = e.entry_direction === "debt" ? -1 : 1;

    // Entry currency bucket: settle credit receivable -> subtract equiv;
    // settle debt payable -> add equiv (toward zero).
    existing.totals[e.currency_code] += directionSign === 1 ? -equiv : equiv;

    if (s.settlement_currency_code !== e.currency_code) {
      existing.totals[s.settlement_currency_code] += directionSign * Math.abs(Number(s.amount));
    }

    byActor.set(actorId, existing);
  }

  return [...byActor.values()].sort((a, b) => a.actor_code.localeCompare(b.actor_code));
}

export async function getCreditBookTypeCashflowByCurrency(filters?: {
  actorId?: string[];
  typeId?: string[];
  currencyCode?: Array<CreditBookTypeCashflowByCurrency["currency"]>;
  dateFrom?: string;
  dateTo?: string;
}): Promise<CreditBookTypeCashflowByCurrency[]> {
  const activeTypes = await getCreditBookLedgerTypes({ includeInactive: true });
  const allCurrencies: Array<CreditBookTypeCashflowByCurrency["currency"]> = ["IDR", "MYR", "USDT", "TRX"];
  const currencies = filters?.currencyCode?.length
    ? allCurrencies.filter((currency) => filters.currencyCode!.includes(currency))
    : allCurrencies;
  const entries = await getCreditBookEntries({
    actorId: filters?.actorId,
    typeId: filters?.typeId,
    currencyCode: filters?.currencyCode,
    dateFrom: filters?.dateFrom,
    dateTo: filters?.dateTo,
    limit: 5000
  });
  const typeMap = new Map(activeTypes.map((type) => [type.id, type]));

  const totalsMap = new Map<
    string,
    { inflow: number; outflow: number; net: number; outstanding: number }
  >();
  for (const entry of entries) {
    const amount = Math.abs(Number(entry.amount));
    const outstandingAmount = Math.abs(Number(entry.outstanding));
    const key = `${entry.currency_code}:${entry.responsible_actor_id}:${entry.entry_type_id}`;
    const existing =
      totalsMap.get(key) ?? { inflow: 0, outflow: 0, net: 0, outstanding: 0 };

    if (entry.entry_direction === "credit") {
      existing.inflow += amount;
      existing.net += amount;
      existing.outstanding += outstandingAmount;
    } else {
      existing.outflow += amount;
      existing.net -= amount;
      existing.outstanding -= outstandingAmount;
    }

    totalsMap.set(key, existing);
  }

  return currencies.map((currency) => {
    const rowMap = entries
      .filter((entry) => entry.currency_code === currency)
      .reduce<Map<string, CreditBookTypeCashflowRow>>((acc, entry) => {
        const rowKey = `${entry.responsible_actor_id}:${entry.entry_type_id}`;
        if (acc.has(rowKey)) return acc;
        const type = typeMap.get(entry.entry_type_id);
        acc.set(rowKey, {
          row_key: rowKey,
          actor_id: entry.responsible_actor_id,
          actor_display_name: entry.actor_display_name,
          type_id: entry.entry_type_id,
          type_code: type?.code ?? entry.type_code,
          type_name: type?.name ?? entry.type_name,
          inflow: 0,
          outflow: 0,
          net: 0,
          outstanding: 0
        });
        return acc;
      }, new Map<string, CreditBookTypeCashflowRow>());
    const rows: CreditBookTypeCashflowRow[] = Array.from(rowMap.values());

    for (const row of rows) {
      const totals =
        totalsMap.get(`${currency}:${row.actor_id}:${row.type_id}`) ?? {
          inflow: 0,
          outflow: 0,
          net: 0,
          outstanding: 0
        };
      row.inflow = totals.inflow;
      row.outflow = totals.outflow;
      row.net = totals.net;
      row.outstanding = totals.outstanding;
    }

    rows.sort((a, b) => {
      if (a.actor_display_name !== b.actor_display_name) {
        return a.actor_display_name.localeCompare(b.actor_display_name);
      }
      return a.type_name.localeCompare(b.type_name);
    });

    const combined = rows.reduce(
      (acc, row) => ({
        inflow: acc.inflow + row.inflow,
        outflow: acc.outflow + row.outflow,
        net: acc.net + row.net,
        outstanding: acc.outstanding + row.outstanding
      }),
      { inflow: 0, outflow: 0, net: 0, outstanding: 0 }
    );

    return { currency, rows, combined };
  });
}

export async function getCreditBookActorOutstandingMetrics(): Promise<CreditBookActorOutstandingMetrics[]> {
  const supabase = await createClient();
  const pageSize = 1000;
  let offset = 0;
  type EntryRow = {
    id: string;
    responsible_actor_id: string;
    entry_direction: "credit" | "debt";
    currency_code: "IDR" | "MYR" | "USDT" | "TRX";
    amount: number;
    credit_book_actors:
      | { actor_code: "A" | "B"; display_name: string }
      | { actor_code: "A" | "B"; display_name: string }[]
      | null;
  };
  const rows: EntryRow[] = [];

  while (true) {
    const { data, error } = await supabase
      .from("credit_ledger_entries")
      .select(
        `
        id, responsible_actor_id, entry_direction, currency_code, amount,
        credit_book_actors(actor_code, display_name)
      `
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;
    const batch = (data ?? []) as EntryRow[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }

  const settledByEntry = new Map<string, number>();
  if (rows.length) {
    const { data: settlementRows, error: settlementError } = await supabase
      .from("credit_ledger_settlements")
      .select("entry_id, amount_in_entry_currency")
      .in(
        "entry_id",
        rows.map((row) => row.id)
      );
    if (settlementError) throw settlementError;
    for (const s of (settlementRows ?? []) as Array<{
      entry_id: string;
      amount_in_entry_currency: number;
    }>) {
      const prev = settledByEntry.get(s.entry_id) ?? 0;
      settledByEntry.set(s.entry_id, prev + Number(s.amount_in_entry_currency));
    }
  }

  const byActor = new Map<string, CreditBookActorOutstandingMetrics>();
  for (const row of rows) {
    const actor = Array.isArray(row.credit_book_actors)
      ? row.credit_book_actors[0]
      : row.credit_book_actors;
    const actorId = row.responsible_actor_id;
    const existing =
      byActor.get(actorId) ??
      ({
        actor_id: actorId,
        actor_code: (actor?.actor_code ?? "A") as "A" | "B",
        actor_display_name: actor?.display_name ?? "Unknown Actor",
        totals: { IDR: 0, MYR: 0, USDT: 0, TRX: 0 }
      } as CreditBookActorOutstandingMetrics);
    const amount = Math.abs(Number(row.amount));
    const settled = settledByEntry.get(row.id) ?? 0;
    const outstanding = Math.max(0, amount - settled);
    if (outstanding > 0) {
      const signed =
        row.entry_direction === "debt" ? -outstanding : outstanding;
      existing.totals[row.currency_code] += signed;
    }
    byActor.set(actorId, existing);
  }

  return [...byActor.values()].sort((a, b) => a.actor_code.localeCompare(b.actor_code));
}

export async function getCreditBookSettlementsForEntry(
  entryId: string
): Promise<CreditBookSettlement[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("credit_ledger_settlements")
    .select(
      `
      id, entry_id, settlement_date, amount, settlement_currency_code, conversion_rate, amount_in_entry_currency, note, created_by, updated_by, created_at, updated_at,
      credit_ledger_settlement_attachments(id, settlement_id, storage_path, file_name, mime_type, file_size, uploaded_by, created_at)
    `
    )
    .eq("entry_id", entryId)
    .order("settlement_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rawRows = (data ?? []) as RawCreditBookSettlementRow[];
  const actorIds = new Set<string>();
  for (const row of rawRows) {
    if (row.created_by && isCreditBookUuid(row.created_by)) actorIds.add(row.created_by);
    if (row.updated_by && isCreditBookUuid(row.updated_by)) actorIds.add(row.updated_by);
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

  return rawRows.map((row) => mapCreditBookSettlementRow(row, actorMap));
}

const CREDIT_BOOK_MONTH_LABELS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export function buildCreditBookTypeMonthlyCurrencySummary(
  rows: Array<{
    entry_date: string;
    entry_direction: "credit" | "debt";
    currency_code: "IDR" | "MYR" | "USDT" | "TRX";
    amount: number;
  }>
): BigBookMonthlyCurrencyRow[] {
  const summary = CREDIT_BOOK_MONTH_LABELS.map((monthLabel, index) => ({
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
    const signedAmount = row.entry_direction === "debt" ? -Math.abs(Number(row.amount)) : Math.abs(Number(row.amount));
    summary[monthIndex].totals[row.currency_code] += signedAmount;
  }

  return summary;
}

export async function getCreditBookTypeMonthlyCurrencySummary(
  typeId: string,
  year: number
): Promise<BigBookMonthlyCurrencyRow[]> {
  const supabase = await createClient();
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;
  const { data, error } = await supabase
    .from("credit_ledger_entries")
    .select("entry_date, entry_direction, currency_code, amount")
    .eq("entry_type_id", typeId)
    .gte("entry_date", startDate)
    .lte("entry_date", endDate);

  if (error) throw error;

  return buildCreditBookTypeMonthlyCurrencySummary(
    ((data ?? []) as Array<{
      entry_date: string;
      entry_direction: "credit" | "debt";
      currency_code: "IDR" | "MYR" | "USDT" | "TRX";
      amount: number;
    }>).map((row) => ({
      ...row,
      amount: Number(row.amount)
    }))
  );
}
