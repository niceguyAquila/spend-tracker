import { createClient } from "@/lib/supabase/server";
import {
  computeBigBookCreditStatus,
  computeOutstanding,
  aggregateVendorActorOutstanding
} from "@/lib/big-book/credit";
import {
  summarizeCurrencies,
  type BigBookCurrency,
  type BigBookCurrencyTotal
} from "@/lib/big-book/totals";
import {
  BigBookActor,
  BigBookActorPocket,
  BigBookActorPocketMetrics,
  BigBookAllowedUserOption,
  BigBookActorCurrencyMetrics,
  BigBookAttachment,
  BigBookCreditStatus,
  BigBookEntry,
  BigBookEntryGroup,
  BigBookLedgerRow,
  BigBookLedgerSubType,
  BigBookLedgerType,
  BigBookSettlementRef,
  BigBookSettlementTargetRef,
  BigBookVendor,
  BigBookVendorActorOutstandingRow,
  BigBookVendorType,
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

export async function getBigBookVendorTypes(options?: {
  includeInactive?: boolean;
}): Promise<BigBookVendorType[]> {
  const supabase = await createClient();
  let query = supabase
    .from("business_ledger_vendor_types")
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

export async function getBigBookVendors(options?: {
  vendorTypeId?: string;
  includeInactive?: boolean;
}): Promise<BigBookVendor[]> {
  const supabase = await createClient();
  let query = supabase
    .from("business_ledger_vendors")
    .select("id, vendor_type_id, code, name, is_active, sort_order, created_at, updated_at")
    .order("vendor_type_id", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (options?.vendorTypeId) {
    query = query.eq("vendor_type_id", options.vendorTypeId);
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

export async function getBigBookActorPockets(options?: {
  actorId?: string;
  includeInactive?: boolean;
}): Promise<BigBookActorPocket[]> {
  const supabase = await createClient();
  let query = supabase
    .from("big_book_actor_pockets")
    .select("id, actor_id, code, name, currency_code, is_active, sort_order, created_at, updated_at")
    .order("actor_id", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (options?.actorId) {
    query = query.eq("actor_id", options.actorId);
  }
  if (!options?.includeInactive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((row) => ({
    ...row,
    currency_code: row.currency_code as "IDR",
    sort_order: Number(row.sort_order)
  }));
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
  vendorTypeId?: string[];
  vendorId?: string[];
  pocketId?: string[];
  creditFlag?: Array<"credit" | "settlement" | "none">;
  creditStatus?: BigBookCreditStatus[];
  dateFrom?: string;
  dateTo?: string;
  query?: string;
};

const BIG_BOOK_ENTRY_SELECT = `
  id, group_id, entry_date, entry_direction, entry_type_id, entry_sub_type_id, vendor_type_id, vendor_id, pocket_id, explanation, amount, currency_code, remark, responsible_actor_id, is_credit, settles_entry_id, settlement_conversion_rate, settlement_amount_in_credit_currency, settlement_note, created_by, updated_by, created_at, updated_at,
  business_ledger_types(id, code, name),
  business_ledger_sub_types(id, code, name),
  business_ledger_vendor_types(id, code, name),
  business_ledger_vendors(id, code, name),
  big_book_actor_pockets(id, code, name),
  big_book_actors(id, actor_code, display_name),
  business_ledger_attachments(id, ledger_entry_id, storage_path, file_name, mime_type, file_size, uploaded_by, created_at)
`;

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

// Structural subset of the PostgREST filter builder used by the Big Book
// queries, so the shared filter chain can be applied to both the full entry
// select and the narrow id scan without widening either to `any`.
type BigBookFilterableQuery<T> = {
  in(column: string, values: readonly unknown[]): T;
  eq(column: string, value: unknown): T;
  is(column: string, value: unknown): T;
  not(column: string, operator: string, value: unknown): T;
  gte(column: string, value: unknown): T;
  lte(column: string, value: unknown): T;
  or(filters: string): T;
};

function applyBigBookEntryFilters<T extends BigBookFilterableQuery<T>>(
  query: T,
  filters?: BigBookEntryFilters
): T {
  const filterTypeIds = toFilterArray(filters?.typeId);
  const filterCurrencyCodes = toFilterArray(filters?.currencyCode);
  const filterDirections = toFilterArray(filters?.direction);
  const filterActorIds = toFilterArray(filters?.actorId);
  const filterVendorTypeIds = toFilterArray(filters?.vendorTypeId);
  const filterVendorIds = toFilterArray(filters?.vendorId);
  const filterPocketIds = toFilterArray(filters?.pocketId);
  const filterCreditFlags = toFilterArray(filters?.creditFlag);
  let next = query;
  if (filterTypeIds?.length) next = next.in("entry_type_id", filterTypeIds);
  if (filterCurrencyCodes?.length) next = next.in("currency_code", filterCurrencyCodes);
  if (filterDirections?.length) next = next.in("entry_direction", filterDirections);
  if (filterActorIds?.length) next = next.in("responsible_actor_id", filterActorIds);
  if (filterVendorTypeIds?.length) next = next.in("vendor_type_id", filterVendorTypeIds);
  if (filterVendorIds?.length) next = next.in("vendor_id", filterVendorIds);
  if (filterPocketIds?.length) next = next.in("pocket_id", filterPocketIds);
  if (filterCreditFlags?.length === 1) {
    // Single-flag shortcuts push to SQL; mixed selections are applied after hydration.
    const flag = filterCreditFlags[0];
    if (flag === "credit") next = next.eq("is_credit", true);
    else if (flag === "settlement") next = next.not("settles_entry_id", "is", null);
    else if (flag === "none") next = next.eq("is_credit", false).is("settles_entry_id", null);
  } else if (filterCreditFlags && filterCreditFlags.length > 1) {
    const clauses: string[] = [];
    if (filterCreditFlags.includes("credit")) clauses.push("is_credit.eq.true");
    if (filterCreditFlags.includes("settlement")) clauses.push("settles_entry_id.not.is.null");
    if (filterCreditFlags.includes("none")) {
      clauses.push("and(is_credit.eq.false,settles_entry_id.is.null)");
    }
    if (clauses.length) next = next.or(clauses.join(","));
  }
  if (filters?.dateFrom) next = next.gte("entry_date", filters.dateFrom);
  if (filters?.dateTo) next = next.lte("entry_date", filters.dateTo);
  if (filters?.query) {
    const sanitized = sanitizeBigBookSearchQuery(filters.query);
    if (sanitized) {
      next = next.or(`explanation.ilike.%${sanitized}%,remark.ilike.%${sanitized}%`);
    }
  }
  return next;
}

async function resolveDisplayNameMap(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userIds: string[]
): Promise<Map<string, string>> {
  const actorMap = new Map<string, string>();
  const uniqueIds = [...new Set(userIds.filter(isUuid))];
  if (!uniqueIds.length) return actorMap;

  const { data: actorRows, error: actorError } = await supabase
    .from("allowed_users")
    .select("auth_user_id, display_name, email")
    .in("auth_user_id", uniqueIds);
  if (actorError) throw actorError;
  for (const actor of actorRows ?? []) {
    if (!actor.auth_user_id) continue;
    actorMap.set(actor.auth_user_id, actor.display_name?.trim() || actor.email || actor.auth_user_id);
  }
  return actorMap;
}

type RawBigBookEntryRow = {
  id: string;
  group_id: string | null;
  entry_date: string;
  entry_direction: string;
  entry_type_id: string;
  entry_sub_type_id: string | null;
  vendor_type_id: string | null;
  vendor_id: string | null;
  pocket_id: string | null;
  explanation: string;
  amount: number | string;
  currency_code: "IDR" | "MYR" | "USDT" | "TRX";
  remark: string | null;
  responsible_actor_id: string;
  is_credit: boolean | null;
  settles_entry_id: string | null;
  settlement_conversion_rate: number | string | null;
  settlement_amount_in_credit_currency: number | string | null;
  settlement_note: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  business_ledger_types: { id: string; code: string; name: string } | { id: string; code: string; name: string }[] | null;
  business_ledger_sub_types: { id: string; code: string; name: string } | { id: string; code: string; name: string }[] | null;
  business_ledger_vendor_types: { id: string; code: string; name: string } | { id: string; code: string; name: string }[] | null;
  business_ledger_vendors: { id: string; code: string; name: string } | { id: string; code: string; name: string }[] | null;
  big_book_actor_pockets: { id: string; code: string; name: string } | { id: string; code: string; name: string }[] | null;
  big_book_actors: { id: string; actor_code: "A" | "B"; display_name: string } | { id: string; actor_code: "A" | "B"; display_name: string }[] | null;
  business_ledger_attachments: BigBookAttachment | BigBookAttachment[] | null;
};

function mapBigBookEntryRow(row: RawBigBookEntryRow, actorMap: Map<string, string>): BigBookEntry {
  const type = Array.isArray(row.business_ledger_types)
    ? row.business_ledger_types[0]
    : row.business_ledger_types;
  const subType = Array.isArray(row.business_ledger_sub_types)
    ? row.business_ledger_sub_types[0]
    : row.business_ledger_sub_types;
  const vendorType = Array.isArray(row.business_ledger_vendor_types)
    ? row.business_ledger_vendor_types[0]
    : row.business_ledger_vendor_types;
  const vendor = Array.isArray(row.business_ledger_vendors)
    ? row.business_ledger_vendors[0]
    : row.business_ledger_vendors;
  const pocket = Array.isArray(row.big_book_actor_pockets)
    ? row.big_book_actor_pockets[0]
    : row.big_book_actor_pockets;
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
    group_id: row.group_id ?? null,
    entry_date: row.entry_date,
    entry_direction: row.entry_direction as "spending" | "profit",
    entry_type_id: row.entry_type_id,
    entry_sub_type_id: row.entry_sub_type_id ?? null,
    vendor_type_id: row.vendor_type_id ?? null,
    vendor_id: row.vendor_id ?? null,
    pocket_id: row.pocket_id ?? null,
    explanation: row.explanation,
    amount: Number(row.amount),
    currency_code: row.currency_code,
    remark: row.remark,
    responsible_actor_id: row.responsible_actor_id,
    is_credit: Boolean(row.is_credit),
    settles_entry_id: row.settles_entry_id ?? null,
    settlement_conversion_rate:
      row.settlement_conversion_rate == null ? null : Number(row.settlement_conversion_rate),
    settlement_amount_in_credit_currency:
      row.settlement_amount_in_credit_currency == null
        ? null
        : Number(row.settlement_amount_in_credit_currency),
    settlement_note: row.settlement_note ?? null,
    created_by: row.created_by,
    updated_by: row.updated_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    type_name: type?.name ?? "-",
    type_code: type?.code ?? "-",
    sub_type_name: subType?.name ?? null,
    sub_type_code: subType?.code ?? null,
    vendor_type_name: vendorType?.name ?? null,
    vendor_name: vendor?.name ?? null,
    pocket_name: pocket?.name ?? null,
    actor_code: (actor?.actor_code ?? "A") as "A" | "B",
    actor_display_name: actor?.display_name ?? "-",
    creator_display_name: row.created_by ? (actorMap.get(row.created_by) ?? row.created_by) : "-",
    updater_display_name: row.updated_by ? (actorMap.get(row.updated_by) ?? row.updated_by) : "-",
    attachments: attachments.map((attachment) => ({
      ...attachment,
      file_size: Number(attachment.file_size)
    })),
    total_settled: 0,
    outstanding: 0,
    credit_status: null,
    settlements: [],
    settles_entry: null
  };
}

type RawBigBookSettlementChildRow = {
  id: string;
  settles_entry_id: string | null;
  entry_date: string;
  amount: number | string;
  currency_code: "IDR" | "MYR" | "USDT" | "TRX";
  settlement_conversion_rate: number | string | null;
  settlement_amount_in_credit_currency: number | string | null;
  settlement_note: string | null;
  explanation: string;
};

type RawBigBookSettlementParentRow = {
  id: string;
  entry_date: string;
  explanation: string;
  amount: number | string;
  currency_code: "IDR" | "MYR" | "USDT" | "TRX";
  vendor_id: string | null;
  business_ledger_vendors: { id: string; name: string } | { id: string; name: string }[] | null;
};

async function attachBigBookCreditSummaries(
  supabase: Awaited<ReturnType<typeof createClient>>,
  entries: BigBookEntry[]
): Promise<BigBookEntry[]> {
  if (!entries.length) return entries;

  const creditIds = entries.filter((entry) => entry.is_credit).map((entry) => entry.id);
  const parentIds = [
    ...new Set(
      entries
        .map((entry) => entry.settles_entry_id)
        .filter((id): id is string => Boolean(id))
    )
  ];

  const settlementsByCreditId = new Map<string, BigBookSettlementRef[]>();
  const settledSumByCreditId = new Map<string, number>();

  if (creditIds.length) {
    const { data, error } = await supabase
      .from("business_ledger_entries")
      .select(
        "id, settles_entry_id, entry_date, amount, currency_code, settlement_conversion_rate, settlement_amount_in_credit_currency, settlement_note, explanation"
      )
      .in("settles_entry_id", creditIds)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw error;

    for (const row of (data ?? []) as RawBigBookSettlementChildRow[]) {
      if (!row.settles_entry_id) continue;
      const amountInCredit = Number(row.settlement_amount_in_credit_currency ?? 0);
      settledSumByCreditId.set(
        row.settles_entry_id,
        (settledSumByCreditId.get(row.settles_entry_id) ?? 0) + amountInCredit
      );
      const list = settlementsByCreditId.get(row.settles_entry_id) ?? [];
      list.push({
        id: row.id,
        entry_date: row.entry_date,
        amount: Number(row.amount),
        currency_code: row.currency_code,
        settlement_conversion_rate: Number(row.settlement_conversion_rate ?? 1),
        settlement_amount_in_credit_currency: amountInCredit,
        settlement_note: row.settlement_note ?? null,
        explanation: row.explanation
      });
      settlementsByCreditId.set(row.settles_entry_id, list);
    }
  }

  // Parents of settlement rows on this page also need their own outstanding so
  // the back-link badge can show remaining balance.
  const parentSettledSumById = new Map<string, number>();
  const parentsById = new Map<string, BigBookSettlementTargetRef>();
  if (parentIds.length) {
    const [{ data: parentRows, error: parentError }, { data: parentSettlementRows, error: parentSettlementError }] =
      await Promise.all([
        supabase
          .from("business_ledger_entries")
          .select(
            "id, entry_date, explanation, amount, currency_code, vendor_id, business_ledger_vendors(id, name)"
          )
          .in("id", parentIds),
        supabase
          .from("business_ledger_entries")
          .select("settles_entry_id, settlement_amount_in_credit_currency")
          .in("settles_entry_id", parentIds)
      ]);
    if (parentError) throw parentError;
    if (parentSettlementError) throw parentSettlementError;

    for (const row of (parentSettlementRows ?? []) as Array<{
      settles_entry_id: string | null;
      settlement_amount_in_credit_currency: number | string | null;
    }>) {
      if (!row.settles_entry_id) continue;
      parentSettledSumById.set(
        row.settles_entry_id,
        (parentSettledSumById.get(row.settles_entry_id) ?? 0) +
          Number(row.settlement_amount_in_credit_currency ?? 0)
      );
    }

    for (const row of (parentRows ?? []) as RawBigBookSettlementParentRow[]) {
      const vendor = Array.isArray(row.business_ledger_vendors)
        ? row.business_ledger_vendors[0]
        : row.business_ledger_vendors;
      const amount = Number(row.amount);
      const totalSettled = parentSettledSumById.get(row.id) ?? 0;
      parentsById.set(row.id, {
        id: row.id,
        entry_date: row.entry_date,
        explanation: row.explanation,
        amount,
        currency_code: row.currency_code,
        vendor_name: vendor?.name ?? null,
        outstanding: computeOutstanding(amount, totalSettled)
      });
    }
  }

  return entries.map((entry) => {
    if (entry.is_credit) {
      const settlements = settlementsByCreditId.get(entry.id) ?? [];
      const totalSettled = settledSumByCreditId.get(entry.id) ?? 0;
      const outstanding = computeOutstanding(entry.amount, totalSettled);
      return {
        ...entry,
        settlements,
        total_settled: totalSettled,
        outstanding,
        credit_status: computeBigBookCreditStatus(entry.amount, totalSettled),
        settles_entry: null
      };
    }

    if (entry.settles_entry_id) {
      return {
        ...entry,
        settlements: [],
        total_settled: 0,
        outstanding: 0,
        credit_status: null,
        settles_entry: parentsById.get(entry.settles_entry_id) ?? null
      };
    }

    return entry;
  });
}

export async function getBigBookEntries(filters?: BigBookEntryFilters & { limit?: number }): Promise<BigBookEntry[]> {
  const supabase = await createClient();
  let query = supabase
    .from("business_ledger_entries")
    .select(BIG_BOOK_ENTRY_SELECT)
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false });

  query = applyBigBookEntryFilters(query, filters);
  query = query.limit(filters?.limit ?? 500);

  const { data, error } = await query;
  if (error) throw error;

  const actorIds: string[] = [];
  for (const row of data ?? []) {
    if (row.created_by) actorIds.push(row.created_by);
    if (row.updated_by) actorIds.push(row.updated_by);
  }
  const actorMap = await resolveDisplayNameMap(supabase, actorIds);

  const mapped = (data ?? []).map((row) => mapBigBookEntryRow(row as RawBigBookEntryRow, actorMap));
  const withCredit = await attachBigBookCreditSummaries(supabase, mapped);
  const filterStatuses = toFilterArray(filters?.creditStatus);
  if (!filterStatuses?.length) return withCredit;
  return withCredit.filter(
    (entry) => entry.credit_status != null && filterStatuses.includes(entry.credit_status)
  );
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
  const filterStatuses = toFilterArray(filters.creditStatus);

  // Status is derived in app code, so status filtering must hydrate first then page.
  if (filterStatuses?.length) {
    const all = await getBigBookEntries({
      ...filters,
      limit: 5000
    });
    return {
      rows: all.slice(fromIndex, fromIndex + pageSize),
      totalCount: all.length
    };
  }

  let query = supabase
    .from("business_ledger_entries")
    .select(BIG_BOOK_ENTRY_SELECT, { count: "exact" })
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false });

  query = applyBigBookEntryFilters(query, filters);
  query = query.range(fromIndex, toIndex);

  const { data, error, count } = await query;
  if (error) throw error;

  const totalCount = count ?? 0;

  const actorIds: string[] = [];
  for (const row of data ?? []) {
    if (row.created_by) actorIds.push(row.created_by);
    if (row.updated_by) actorIds.push(row.updated_by);
  }
  const actorMap = await resolveDisplayNameMap(supabase, actorIds);

  const rows: BigBookEntry[] = await attachBigBookCreditSummaries(
    supabase,
    (data ?? []).map((row) => mapBigBookEntryRow(row as RawBigBookEntryRow, actorMap))
  );

  return { rows, totalCount };
}

type LedgerScanRow = {
  id: string;
  group_id: string | null;
  entry_date: string;
  created_at: string;
  amount: number;
  currency_code: BigBookCurrency;
  entry_direction: "spending" | "profit";
  is_credit?: boolean;
};

type LedgerDisplayKey =
  | { kind: "entry"; id: string; sort_date: string; sort_created_at: string }
  | { kind: "group"; id: string; sort_date: string; sort_created_at: string };

function buildLedgerDisplayKeys(scanRows: LedgerScanRow[]): LedgerDisplayKey[] {
  const groupMeta = new Map<string, { sort_date: string; sort_created_at: string }>();
  const keys: LedgerDisplayKey[] = [];

  for (const row of scanRows) {
    if (row.group_id) {
      const existing = groupMeta.get(row.group_id);
      if (!existing) {
        groupMeta.set(row.group_id, {
          sort_date: row.entry_date,
          sort_created_at: row.created_at
        });
      } else {
        const dateNewer = row.entry_date > existing.sort_date;
        const sameDateNewer =
          row.entry_date === existing.sort_date && row.created_at > existing.sort_created_at;
        if (dateNewer || sameDateNewer) {
          groupMeta.set(row.group_id, {
            sort_date: row.entry_date,
            sort_created_at: row.created_at
          });
        }
      }
      continue;
    }
    keys.push({
      kind: "entry",
      id: row.id,
      sort_date: row.entry_date,
      sort_created_at: row.created_at
    });
  }

  for (const [groupId, meta] of groupMeta) {
    keys.push({
      kind: "group",
      id: groupId,
      sort_date: meta.sort_date,
      sort_created_at: meta.sort_created_at
    });
  }

  keys.sort((a, b) => {
    if (a.sort_date !== b.sort_date) return a.sort_date < b.sort_date ? 1 : -1;
    if (a.sort_created_at !== b.sort_created_at) return a.sort_created_at < b.sort_created_at ? 1 : -1;
    return a.id.localeCompare(b.id);
  });

  return keys;
}

/**
 * Both figures are derived from the filtered scan rather than from the hydrated
 * rows, because a group is hydrated with all of its members while the filters
 * may only match some of them.
 */
export type BigBookLedgerTotals = {
  pageTotals: BigBookCurrencyTotal[];
  pageEntryCount: number;
  grandTotals: BigBookCurrencyTotal[];
  grandEntryCount: number;
};

export type BigBookLedgerRowsPagedResult = {
  rows: BigBookLedgerRow[];
  totalCount: number;
  totals: BigBookLedgerTotals;
};

export async function getBigBookLedgerRowsPaged(
  filters: BigBookEntryFilters & { page: number; pageSize: number }
): Promise<BigBookLedgerRowsPagedResult> {
  const supabase = await createClient();
  const page = Math.max(0, Math.floor(filters.page));
  const pageSize = Math.max(1, Math.floor(filters.pageSize));
  const filterStatuses = toFilterArray(filters.creditStatus);

  const scanPageSize = 1000;
  let offset = 0;
  const scanRows: LedgerScanRow[] = [];

  while (true) {
    let query = supabase
      .from("business_ledger_entries")
      .select("id, group_id, entry_date, created_at, amount, currency_code, entry_direction, is_credit")
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(offset, offset + scanPageSize - 1);

    query = applyBigBookEntryFilters(query, filters);

    const { data, error } = await query;
    if (error) throw error;
    const batch = (data ?? []) as LedgerScanRow[];
    scanRows.push(...batch);
    if (batch.length < scanPageSize) break;
    offset += scanPageSize;
  }

  // Credit status is derived; compute settlement sums for scanned credits and
  // drop non-matching keys before paging so totalCount stays accurate.
  let effectiveScanRows = scanRows;
  if (filterStatuses?.length) {
    const creditIds = scanRows.filter((row) => row.is_credit).map((row) => row.id);
    const settledByCreditId = new Map<string, number>();
    if (creditIds.length) {
      const { data: settlementRows, error: settlementError } = await supabase
        .from("business_ledger_entries")
        .select("settles_entry_id, settlement_amount_in_credit_currency")
        .in("settles_entry_id", creditIds);
      if (settlementError) throw settlementError;
      for (const row of (settlementRows ?? []) as Array<{
        settles_entry_id: string | null;
        settlement_amount_in_credit_currency: number | string | null;
      }>) {
        if (!row.settles_entry_id) continue;
        settledByCreditId.set(
          row.settles_entry_id,
          (settledByCreditId.get(row.settles_entry_id) ?? 0) +
            Number(row.settlement_amount_in_credit_currency ?? 0)
        );
      }
    }

    const matchingIds = new Set<string>();
    const matchingGroupIds = new Set<string>();
    for (const row of scanRows) {
      if (!row.is_credit) continue;
      const status = computeBigBookCreditStatus(
        Number(row.amount),
        settledByCreditId.get(row.id) ?? 0
      );
      if (!filterStatuses.includes(status)) continue;
      matchingIds.add(row.id);
      if (row.group_id) matchingGroupIds.add(row.group_id);
    }

    effectiveScanRows = scanRows.filter((row) =>
      row.group_id ? matchingGroupIds.has(row.group_id) : matchingIds.has(row.id)
    );
  }

  const displayKeys = buildLedgerDisplayKeys(effectiveScanRows);
  const totalCount = displayKeys.length;
  const pageKeys = displayKeys.slice(page * pageSize, page * pageSize + pageSize);

  const standaloneIds = pageKeys.filter((key) => key.kind === "entry").map((key) => key.id);
  const pageGroupIds = pageKeys.filter((key) => key.kind === "group").map((key) => key.id);

  // The scan already visited every filtered entry, so both totals cost no extra
  // round trip and the grand total spans all pages rather than the visible one.
  const standaloneIdSet = new Set(standaloneIds);
  const pageGroupIdSet = new Set(pageGroupIds);
  const pageScanRows = effectiveScanRows.filter((row) =>
    row.group_id ? pageGroupIdSet.has(row.group_id) : standaloneIdSet.has(row.id)
  );

  const totals: BigBookLedgerTotals = {
    pageTotals: summarizeCurrencies(pageScanRows),
    pageEntryCount: pageScanRows.length,
    grandTotals: summarizeCurrencies(effectiveScanRows),
    grandEntryCount: effectiveScanRows.length
  };

  if (!pageKeys.length) {
    return { rows: [], totalCount, totals };
  }

  const entryPromises: Promise<{ data: unknown[] | null; error: { message: string } | null }>[] = [];

  if (standaloneIds.length) {
    entryPromises.push(
      Promise.resolve(
        supabase
          .from("business_ledger_entries")
          .select(BIG_BOOK_ENTRY_SELECT)
          .in("id", standaloneIds)
          .then((result) => ({ data: result.data as unknown[] | null, error: result.error }))
      )
    );
  } else {
    entryPromises.push(Promise.resolve({ data: [], error: null }));
  }

  if (pageGroupIds.length) {
    entryPromises.push(
      Promise.resolve(
        supabase
          .from("business_ledger_entries")
          .select(BIG_BOOK_ENTRY_SELECT)
          .in("group_id", pageGroupIds)
          .order("entry_date", { ascending: false })
          .order("created_at", { ascending: false })
          .then((result) => ({ data: result.data as unknown[] | null, error: result.error }))
      )
    );
  } else {
    entryPromises.push(Promise.resolve({ data: [], error: null }));
  }

  const groupPromise = pageGroupIds.length
    ? supabase
        .from("business_ledger_entry_groups")
        .select("id, label, remark, created_by, updated_by, created_at, updated_at")
        .in("id", pageGroupIds)
    : Promise.resolve({ data: [] as BigBookEntryGroup[], error: null });

  const [standaloneResult, groupedResult, groupsResult] = await Promise.all([
    entryPromises[0],
    entryPromises[1],
    groupPromise
  ]);

  if (standaloneResult.error) throw standaloneResult.error;
  if (groupedResult.error) throw groupedResult.error;
  if (groupsResult.error) throw groupsResult.error;

  const allRawEntries = [
    ...((standaloneResult.data ?? []) as RawBigBookEntryRow[]),
    ...((groupedResult.data ?? []) as RawBigBookEntryRow[])
  ];

  const actorIds: string[] = [];
  for (const row of allRawEntries) {
    if (row.created_by) actorIds.push(row.created_by);
    if (row.updated_by) actorIds.push(row.updated_by);
  }
  for (const group of groupsResult.data ?? []) {
    if (group.created_by) actorIds.push(group.created_by);
    if (group.updated_by) actorIds.push(group.updated_by);
  }
  const actorMap = await resolveDisplayNameMap(supabase, actorIds);

  const mappedEntries = await attachBigBookCreditSummaries(
    supabase,
    allRawEntries.map((raw) => mapBigBookEntryRow(raw, actorMap))
  );

  const entriesById = new Map<string, BigBookEntry>();
  const entriesByGroupId = new Map<string, BigBookEntry[]>();
  for (const entry of mappedEntries) {
    entriesById.set(entry.id, entry);
    if (entry.group_id) {
      const list = entriesByGroupId.get(entry.group_id) ?? [];
      list.push(entry);
      entriesByGroupId.set(entry.group_id, list);
    }
  }

  const groupsById = new Map<string, BigBookEntryGroup>();
  for (const group of groupsResult.data ?? []) {
    groupsById.set(group.id, {
      id: group.id,
      label: group.label,
      remark: group.remark ?? null,
      created_by: group.created_by ?? null,
      updated_by: group.updated_by ?? null,
      created_at: group.created_at,
      updated_at: group.updated_at
    });
  }

  const rows: BigBookLedgerRow[] = [];
  for (const key of pageKeys) {
    if (key.kind === "entry") {
      const entry = entriesById.get(key.id);
      if (!entry) continue;
      rows.push({ kind: "entry", sort_date: key.sort_date, entry });
      continue;
    }
    const group = groupsById.get(key.id);
    const entries = entriesByGroupId.get(key.id) ?? [];
    if (!group || !entries.length) continue;
    entries.sort((a, b) => {
      if (a.entry_date !== b.entry_date) return a.entry_date < b.entry_date ? 1 : -1;
      return a.created_at < b.created_at ? 1 : -1;
    });
    rows.push({ kind: "group", sort_date: key.sort_date, group, entries });
  }

  return { rows, totalCount, totals };
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
      // Pocket-tagged entries belong to the pocket's own total, not the actor's
      // headline currency totals, so they are excluded here.
      .is("pocket_id", null)
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

export async function getBigBookActorPocketMetrics(): Promise<BigBookActorPocketMetrics[]> {
  const [actors, pockets] = await Promise.all([
    getBigBookActors(),
    getBigBookActorPockets({ includeInactive: true })
  ]);

  if (!pockets.length) return [];

  const supabase = await createClient();
  const pageSize = 1000;
  let offset = 0;
  const rows: Array<{
    pocket_id: string | null;
    entry_direction: "spending" | "profit";
    amount: number;
  }> = [];

  // Only pocket-tagged rows are relevant, so this scan stays far smaller than
  // the all-entries scan in getBigBookActorCurrencyMetrics.
  while (true) {
    const { data, error } = await supabase
      .from("business_ledger_entries")
      .select("pocket_id, entry_direction, amount")
      .not("pocket_id", "is", null)
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;
    const batch = (data ?? []) as typeof rows;
    rows.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }

  const netByPocket = new Map<string, number>();
  for (const row of rows) {
    if (!row.pocket_id) continue;
    const amount = Math.abs(Number(row.amount));
    const signedAmount = row.entry_direction === "spending" ? -amount : amount;
    netByPocket.set(row.pocket_id, (netByPocket.get(row.pocket_id) ?? 0) + signedAmount);
  }

  const actorById = new Map(actors.map((actor) => [actor.id, actor]));
  const byActor = new Map<string, BigBookActorPocketMetrics>();

  // Driven by the pocket list, not the entries, so a pocket with no activity
  // still renders with zeroed totals.
  for (const pocket of pockets) {
    const actor = actorById.get(pocket.actor_id);
    const group =
      byActor.get(pocket.actor_id) ??
      ({
        actor_id: pocket.actor_id,
        actor_code: (actor?.actor_code ?? "A") as "A" | "B",
        actor_display_name: actor?.display_name ?? "Unknown Actor",
        pockets: []
      } as BigBookActorPocketMetrics);

    group.pockets.push({
      pocket_id: pocket.id,
      pocket_name: pocket.name,
      is_active: pocket.is_active,
      net: netByPocket.get(pocket.id) ?? 0
    });
    byActor.set(pocket.actor_id, group);
  }

  return [...byActor.values()].sort((a, b) => a.actor_code.localeCompare(b.actor_code));
}

export async function getBigBookTypeCashflowByCurrency(filters?: {
  actorId?: string[];
  typeId?: string[];
  vendorTypeId?: string[];
  vendorId?: string[];
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
    vendorTypeId: filters?.vendorTypeId,
    vendorId: filters?.vendorId,
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

export type BigBookOpenCreditOption = {
  id: string;
  entry_date: string;
  explanation: string;
  vendor_name: string | null;
  amount: number;
  currency_code: "IDR" | "MYR" | "USDT" | "TRX";
  outstanding: number;
  credit_status: BigBookCreditStatus;
};

export async function getBigBookOpenCreditsForPicker(options?: {
  query?: string;
  limit?: number;
}): Promise<BigBookOpenCreditOption[]> {
  const entries = await getBigBookEntries({
    creditFlag: ["credit"],
    query: options?.query,
    limit: options?.limit ?? 50
  });

  return entries
    .filter(
      (entry) =>
        entry.credit_status === "open" || entry.credit_status === "partial"
    )
    .map((entry) => ({
      id: entry.id,
      entry_date: entry.entry_date,
      explanation: entry.explanation,
      vendor_name: entry.vendor_name,
      amount: entry.amount,
      currency_code: entry.currency_code,
      outstanding: entry.outstanding,
      credit_status: entry.credit_status as BigBookCreditStatus
    }));
}

export async function getBigBookVendorActorOutstanding(filters?: {
  actorId?: string[];
  vendorId?: string[];
  vendorTypeId?: string[];
  currencyCode?: Array<BigBookVendorActorOutstandingRow["currency"]>;
  dateFrom?: string;
  dateTo?: string;
}): Promise<BigBookVendorActorOutstandingRow[]> {
  const supabase = await createClient();
  const pageSize = 1000;
  let offset = 0;

  type CreditScanRow = {
    id: string;
    responsible_actor_id: string;
    vendor_id: string | null;
    vendor_type_id: string | null;
    currency_code: BigBookVendorActorOutstandingRow["currency"];
    amount: number | string;
    business_ledger_vendors: { id: string; name: string } | { id: string; name: string }[] | null;
    business_ledger_vendor_types: { id: string; name: string } | { id: string; name: string }[] | null;
    big_book_actors:
      | { id: string; actor_code: "A" | "B"; display_name: string }
      | { id: string; actor_code: "A" | "B"; display_name: string }[]
      | null;
  };

  const creditRows: CreditScanRow[] = [];
  while (true) {
    let query = supabase
      .from("business_ledger_entries")
      .select(
        `
        id, responsible_actor_id, vendor_id, vendor_type_id, currency_code, amount,
        business_ledger_vendors(id, name),
        business_ledger_vendor_types(id, name),
        big_book_actors(id, actor_code, display_name)
      `
      )
      .eq("is_credit", true)
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    // Date filter applies only to which credits are included — never to settlements.
    query = applyBigBookEntryFilters(query, {
      actorId: filters?.actorId,
      vendorId: filters?.vendorId,
      vendorTypeId: filters?.vendorTypeId,
      currencyCode: filters?.currencyCode,
      dateFrom: filters?.dateFrom,
      dateTo: filters?.dateTo
    });

    const { data, error } = await query;
    if (error) throw error;
    const batch = (data ?? []) as CreditScanRow[];
    creditRows.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }

  const settledByCreditId = new Map<string, number>();
  if (creditRows.length) {
    const creditIds = creditRows.map((row) => row.id);
    // Fetch settlement sums in chunks to avoid oversized `.in()` lists.
    for (let i = 0; i < creditIds.length; i += pageSize) {
      const chunk = creditIds.slice(i, i + pageSize);
      const { data: settlementRows, error: settlementError } = await supabase
        .from("business_ledger_entries")
        .select("settles_entry_id, settlement_amount_in_credit_currency")
        .in("settles_entry_id", chunk);
      if (settlementError) throw settlementError;
      for (const row of (settlementRows ?? []) as Array<{
        settles_entry_id: string | null;
        settlement_amount_in_credit_currency: number | string | null;
      }>) {
        if (!row.settles_entry_id) continue;
        settledByCreditId.set(
          row.settles_entry_id,
          (settledByCreditId.get(row.settles_entry_id) ?? 0) +
            Number(row.settlement_amount_in_credit_currency ?? 0)
        );
      }
    }
  }

  return aggregateVendorActorOutstanding(
    creditRows.map((row) => {
      const vendor = Array.isArray(row.business_ledger_vendors)
        ? row.business_ledger_vendors[0]
        : row.business_ledger_vendors;
      const vendorType = Array.isArray(row.business_ledger_vendor_types)
        ? row.business_ledger_vendor_types[0]
        : row.business_ledger_vendor_types;
      const actor = Array.isArray(row.big_book_actors)
        ? row.big_book_actors[0]
        : row.big_book_actors;
      return {
        id: row.id,
        responsible_actor_id: row.responsible_actor_id,
        vendor_id: row.vendor_id,
        vendor_type_id: row.vendor_type_id,
        currency_code: row.currency_code,
        amount: Number(row.amount),
        vendor_name: vendor?.name ?? null,
        vendor_type_name: vendorType?.name ?? null,
        actor_code: (actor?.actor_code ?? "A") as "A" | "B",
        actor_display_name: actor?.display_name ?? "Unknown Actor"
      };
    }),
    settledByCreditId
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
  // Seed actors from ledger rows so open-only credits/debts still appear with zero realized totals.
  for (const row of rows) {
    const actor = Array.isArray(row.credit_book_actors) ? row.credit_book_actors[0] : row.credit_book_actors;
    const actorId = row.responsible_actor_id;
    if (!byActor.has(actorId)) {
      byActor.set(actorId, {
        actor_id: actorId,
        actor_code: (actor?.actor_code ?? "A") as "A" | "B",
        actor_display_name: actor?.display_name ?? "Unknown Actor",
        totals: { IDR: 0, MYR: 0, USDT: 0, TRX: 0 }
      });
    }
  }

  // Grand Total = realized cashflows only (each settlement in its settlement currency).
  // Unrealized exposure stays in Outstanding-by-Actor (entry currency).
  type SettlementJoinRow = {
    amount: number;
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
        amount, settlement_currency_code,
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

    const directionSign = e.entry_direction === "debt" ? -1 : 1;
    existing.totals[s.settlement_currency_code] +=
      directionSign * Math.abs(Number(s.amount));

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
