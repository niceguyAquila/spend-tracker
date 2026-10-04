import { createClient } from "@/lib/supabase/server";
import { loadDisplayNameDirectory } from "@/lib/db/display-names";
import { collectRangePages } from "@/lib/db/range-pages";
import { perfStart } from "@/lib/perf";
import {
  computeBigBookCreditStatus,
  aggregateVendorActorOutstanding
} from "@/lib/big-book/credit";
import {
  computeBigBookDebtStatus,
  aggregateVendorActorOutstandingDebt
} from "@/lib/big-book/debt";
import {
  roundBigBookAmount,
  summarizeCurrencies,
  type BigBookCurrency,
  type BigBookCurrencyTotal
} from "@/lib/big-book/totals";
import {
  buildLedgerDisplayKeys,
  ledgerSortNeedsNameLookups,
  type BigBookLedgerSortDir,
  type BigBookLedgerSortKey,
  type LedgerNameLookups,
  type LedgerScanRow
} from "@/lib/big-book/ledger-display-keys";
import {
  BigBookActor,
  BigBookActorPocket,
  BigBookInvoiceWallet,
  BigBookActorPocketMetrics,
  BigBookAllowedUserOption,
  BigBookActorCurrencyMetrics,
  BigBookAttachment,
  BigBookCreditStatus,
  BigBookEntry,
  BigBookEntryGroup,
  BigBookLedgerRow,
  BigBookLedgerType,
  BigBookLedgerTypeInvoiceProfile,
  BigBookSettlementRef,
  BigBookSettlementTargetRef,
  BigBookActionBy,
  BigBookVendor,
  BigBookVendorActorOutstandingEntry,
  BigBookVendorActorOutstandingEntriesResult,
  BigBookVendorActorOutstandingDebtEntriesResult,
  BigBookVendorActorOutstandingDebtRow,
  BigBookVendorActorOutstandingRow,
  BigBookVendorType,
  BigBookTypeVendorTypeMap,
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
  CreditBookLedgerType,
  CreditBookSettlement,
  CreditBookSettlementAttachment,
  CreditBookTypeCashflowByCurrency,
  CreditBookTypeCashflowRow
} from "@/lib/types";


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

export async function getBigBookTypeVendorTypeMaps(): Promise<BigBookTypeVendorTypeMap[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("business_ledger_type_vendor_type_maps")
    .select(
      `
      id, entry_type_id, vendor_type_id, created_at, updated_at,
      business_ledger_types(code, name),
      business_ledger_vendor_types(code, name)
    `
    )
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => {
    const type = Array.isArray(row.business_ledger_types)
      ? row.business_ledger_types[0]
      : row.business_ledger_types;
    const vendorType = Array.isArray(row.business_ledger_vendor_types)
      ? row.business_ledger_vendor_types[0]
      : row.business_ledger_vendor_types;
    return {
      id: row.id,
      entry_type_id: row.entry_type_id,
      vendor_type_id: row.vendor_type_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      type_code: type?.code,
      type_name: type?.name,
      vendor_type_code: vendorType?.code,
      vendor_type_name: vendorType?.name
    };
  });
}

export async function getBigBookActionBy(options?: {
  includeInactive?: boolean;
}): Promise<BigBookActionBy[]> {
  const supabase = await createClient();
  let query = supabase
    .from("business_ledger_action_by")
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
    .select(
      "id, actor_id, code, name, currency_code, is_active, sort_order, created_at, updated_at"
    )
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

export async function getBigBookInvoiceWallets(options?: {
  includeInactive?: boolean;
}): Promise<BigBookInvoiceWallet[]> {
  const supabase = await createClient();
  let query = supabase
    .from("big_book_invoice_wallets")
    .select("id, name, network, address, is_active, sort_order, created_at, updated_at")
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

export async function getBigBookLedgerTypeInvoiceProfiles(): Promise<BigBookLedgerTypeInvoiceProfile[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("business_ledger_type_invoice_profiles")
    .select(
      `
      type_id,
      pic_name,
      pic_passport,
      pic_address,
      pic_phone,
      bill_to_company,
      background_color,
      created_at,
      updated_at,
      business_ledger_types(code, name, is_active)
    `
    )
    .order("type_id", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => {
    const type = Array.isArray(row.business_ledger_types)
      ? row.business_ledger_types[0]
      : row.business_ledger_types;
    return {
      type_id: row.type_id,
      pic_name: row.pic_name ?? "",
      pic_passport: row.pic_passport ?? "",
      pic_address: row.pic_address ?? "",
      pic_phone: row.pic_phone ?? "",
      bill_to_company: row.bill_to_company ?? "",
      background_color: row.background_color ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at,
      type_name: type?.name,
      type_code: type?.code,
      type_is_active: type?.is_active
    };
  });
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
  actionById?: string[];
  creditFlag?: Array<"credit" | "settlement" | "none">;
  creditStatus?: BigBookCreditStatus[];
  dateFrom?: string;
  dateTo?: string;
  query?: string;
  entryId?: string;
};

const BIG_BOOK_ENTRY_SELECT = `
  id, group_id, entry_date, entry_direction, entry_type_id, vendor_type_id, vendor_id, pocket_id, action_by_id, explanation, amount, currency_code, remark, responsible_actor_id, is_credit, is_debt, settles_entry_id, settlement_conversion_rate, settlement_amount_in_credit_currency, settlement_note, credit_settled_at, credit_settled_by, credit_settlement_note, debt_settled_at, debt_settled_by, debt_settlement_note, created_by, updated_by, created_at, updated_at,
  business_ledger_types(id, code, name),
  business_ledger_vendor_types(id, code, name),
  business_ledger_vendors(id, code, name),
  big_book_actor_pockets(id, code, name),
  business_ledger_action_by(id, code, name),
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

/** Empty arrays become null so Postgres `= any(null)` short-circuits to "no filter". */
function toRpcArray<T>(value: T | T[] | undefined | null): T[] | null {
  const arr = toFilterArray(value);
  return arr?.length ? arr : null;
}

function isMissingRpcError(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  return (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    message.includes("could not find the function") ||
    message.includes("does not exist") ||
    message.includes("is not a function")
  );
}

/** Call an RPC when available; return a missing-rpc error so callers can fall back. */
async function tryRpc<T>(
  supabase: Awaited<ReturnType<typeof createClient>>,
  fn: string,
  args?: Record<string, unknown>
): Promise<{ data: T | null; error: { message?: string; code?: string } | null }> {
  const client = supabase as unknown as {
    rpc?: (
      name: string,
      params?: Record<string, unknown>
    ) => PromiseLike<{ data: T | null; error: { message?: string; code?: string } | null }>;
  };
  if (typeof client.rpc !== "function") {
    return { data: null, error: { message: "rpc is not a function", code: "42883" } };
  }
  try {
    return await client.rpc(fn, args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { data: null, error: { message, code: "42883" } };
  }
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
  const filterActionByIds = toFilterArray(filters?.actionById);
  const filterCreditFlags = toFilterArray(filters?.creditFlag);
  const filterCreditStatuses = toFilterArray(filters?.creditStatus);
  let next = query;
  if (filterTypeIds?.length) next = next.in("entry_type_id", filterTypeIds);
  if (filterCurrencyCodes?.length) next = next.in("currency_code", filterCurrencyCodes);
  if (filterDirections?.length) next = next.in("entry_direction", filterDirections);
  if (filterActorIds?.length) next = next.in("responsible_actor_id", filterActorIds);
  if (filterVendorTypeIds?.length) next = next.in("vendor_type_id", filterVendorTypeIds);
  if (filterVendorIds?.length) next = next.in("vendor_id", filterVendorIds);
  if (filterPocketIds?.length) next = next.in("pocket_id", filterPocketIds);
  if (filterActionByIds?.length) next = next.in("action_by_id", filterActionByIds);
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
  if (filterCreditStatuses?.length === 1) {
    const status = filterCreditStatuses[0];
    if (status === "open") {
      next = next.eq("is_credit", true).is("credit_settled_at", null);
    } else if (status === "settled") {
      next = next.not("credit_settled_at", "is", null);
    }
  } else if (filterCreditStatuses && filterCreditStatuses.length > 1) {
    const clauses: string[] = [];
    if (filterCreditStatuses.includes("open")) {
      clauses.push("and(is_credit.eq.true,credit_settled_at.is.null)");
    }
    if (filterCreditStatuses.includes("settled")) {
      clauses.push("credit_settled_at.not.is.null");
    }
    if (clauses.length) next = next.or(clauses.join(","));
  }
  if (filters?.entryId) next = next.eq("id", filters.entryId);
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

  // The directory covers the whole allowed_users table, so an id missing from
  // it would not be found by a scoped query either.
  const directory = await loadDisplayNameDirectory();
  if (directory) {
    for (const id of uniqueIds) {
      const name = directory.get(id);
      if (name) actorMap.set(id, name);
    }
    return actorMap;
  }

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
  vendor_type_id: string | null;
  vendor_id: string | null;
  pocket_id: string | null;
  action_by_id: string | null;
  explanation: string;
  amount: number | string;
  currency_code: "IDR" | "MYR" | "USDT" | "TRX";
  remark: string | null;
  responsible_actor_id: string;
  is_credit: boolean | null;
  is_debt: boolean | null;
  settles_entry_id: string | null;
  settlement_conversion_rate: number | string | null;
  settlement_amount_in_credit_currency: number | string | null;
  settlement_note: string | null;
  credit_settled_at: string | null;
  credit_settled_by: string | null;
  credit_settlement_note: string | null;
  debt_settled_at: string | null;
  debt_settled_by: string | null;
  debt_settlement_note: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  business_ledger_types: { id: string; code: string; name: string } | { id: string; code: string; name: string }[] | null;
  business_ledger_vendor_types: { id: string; code: string; name: string } | { id: string; code: string; name: string }[] | null;
  business_ledger_vendors: { id: string; code: string; name: string } | { id: string; code: string; name: string }[] | null;
  big_book_actor_pockets: { id: string; code: string; name: string } | { id: string; code: string; name: string }[] | null;
  business_ledger_action_by: { id: string; code: string; name: string } | { id: string; code: string; name: string }[] | null;
  big_book_actors: { id: string; actor_code: "A" | "B"; display_name: string } | { id: string; actor_code: "A" | "B"; display_name: string }[] | null;
  business_ledger_attachments: BigBookAttachment | BigBookAttachment[] | null;
};

function mapBigBookEntryRow(row: RawBigBookEntryRow, actorMap: Map<string, string>): BigBookEntry {
  const type = Array.isArray(row.business_ledger_types)
    ? row.business_ledger_types[0]
    : row.business_ledger_types;
  const vendorType = Array.isArray(row.business_ledger_vendor_types)
    ? row.business_ledger_vendor_types[0]
    : row.business_ledger_vendor_types;
  const vendor = Array.isArray(row.business_ledger_vendors)
    ? row.business_ledger_vendors[0]
    : row.business_ledger_vendors;
  const pocket = Array.isArray(row.big_book_actor_pockets)
    ? row.big_book_actor_pockets[0]
    : row.big_book_actor_pockets;
  const actionBy = Array.isArray(row.business_ledger_action_by)
    ? row.business_ledger_action_by[0]
    : row.business_ledger_action_by;
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
    vendor_type_id: row.vendor_type_id ?? null,
    vendor_id: row.vendor_id ?? null,
    pocket_id: row.pocket_id ?? null,
    action_by_id: row.action_by_id ?? null,
    explanation: row.explanation,
    amount: Number(row.amount),
    currency_code: row.currency_code,
    remark: row.remark,
    responsible_actor_id: row.responsible_actor_id,
    is_credit: Boolean(row.is_credit),
    is_debt: Boolean(row.is_debt),
    settles_entry_id: row.settles_entry_id ?? null,
    settlement_conversion_rate:
      row.settlement_conversion_rate == null ? null : Number(row.settlement_conversion_rate),
    settlement_amount_in_credit_currency:
      row.settlement_amount_in_credit_currency == null
        ? null
        : Number(row.settlement_amount_in_credit_currency),
    settlement_note: row.settlement_note ?? null,
    credit_settled_at: row.credit_settled_at ?? null,
    credit_settled_by: row.credit_settled_by ?? null,
    credit_settlement_note: row.credit_settlement_note ?? null,
    debt_settled_at: row.debt_settled_at ?? null,
    debt_settled_by: row.debt_settled_by ?? null,
    debt_settlement_note: row.debt_settlement_note ?? null,
    created_by: row.created_by,
    updated_by: row.updated_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    type_name: type?.name ?? "-",
    type_code: type?.code ?? "-",
    vendor_type_name: vendorType?.name ?? null,
    vendor_name: vendor?.name ?? null,
    pocket_name: pocket?.name ?? null,
    action_by_name: actionBy?.name ?? null,
    actor_code: (actor?.actor_code ?? "A") as "A" | "B",
    actor_display_name: actor?.display_name ?? "-",
    creator_display_name: row.created_by ? (actorMap.get(row.created_by) ?? row.created_by) : "-",
    updater_display_name: row.updated_by ? (actorMap.get(row.updated_by) ?? row.updated_by) : "-",
    credit_settled_by_display_name: row.credit_settled_by
      ? (actorMap.get(row.credit_settled_by) ?? row.credit_settled_by)
      : "-",
    debt_settled_by_display_name: row.debt_settled_by
      ? (actorMap.get(row.debt_settled_by) ?? row.debt_settled_by)
      : "-",
    attachments: attachments.map((attachment) => ({
      ...attachment,
      file_size: Number(attachment.file_size)
    })),
    total_settled: 0,
    credit_status: null,
    debt_status: null,
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
  is_credit: boolean | null;
  is_debt: boolean | null;
  credit_settled_at: string | null;
  debt_settled_at: string | null;
  vendor_id: string | null;
  business_ledger_vendors: { id: string; name: string } | { id: string; name: string }[] | null;
};

async function attachBigBookCreditSummaries(
  supabase: Awaited<ReturnType<typeof createClient>>,
  entries: BigBookEntry[]
): Promise<BigBookEntry[]> {
  if (!entries.length) return entries;

  const obligationIds = entries
    .filter((entry) => entry.is_credit || entry.is_debt)
    .map((entry) => entry.id);
  const parentIds = [
    ...new Set(
      entries
        .map((entry) => entry.settles_entry_id)
        .filter((id): id is string => Boolean(id))
    )
  ];

  const settlementsByObligationId = new Map<string, BigBookSettlementRef[]>();
  const settledSumByObligationId = new Map<string, number>();
  const parentsById = new Map<string, BigBookSettlementTargetRef>();

  // Settlements and parent-obligation lookups are independent — fetch together.
  const [settlementResult, parentResult] = await Promise.all([
    obligationIds.length
      ? supabase
          .from("business_ledger_entries")
          .select(
            "id, settles_entry_id, entry_date, amount, currency_code, settlement_conversion_rate, settlement_amount_in_credit_currency, settlement_note, explanation"
          )
          .in("settles_entry_id", obligationIds)
          .order("entry_date", { ascending: false })
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as RawBigBookSettlementChildRow[], error: null }),
    parentIds.length
      ? supabase
          .from("business_ledger_entries")
          .select(
            "id, entry_date, explanation, amount, currency_code, is_credit, is_debt, credit_settled_at, debt_settled_at, vendor_id, business_ledger_vendors(id, name)"
          )
          .in("id", parentIds)
      : Promise.resolve({ data: [] as RawBigBookSettlementParentRow[], error: null })
  ]);

  if (settlementResult.error) throw settlementResult.error;
  if (parentResult.error) throw parentResult.error;

  for (const row of (settlementResult.data ?? []) as RawBigBookSettlementChildRow[]) {
    if (!row.settles_entry_id) continue;
    const amountInObligation = Number(row.settlement_amount_in_credit_currency ?? 0);
    settledSumByObligationId.set(
      row.settles_entry_id,
      (settledSumByObligationId.get(row.settles_entry_id) ?? 0) + amountInObligation
    );
    const list = settlementsByObligationId.get(row.settles_entry_id) ?? [];
    list.push({
      id: row.id,
      entry_date: row.entry_date,
      amount: Number(row.amount),
      currency_code: row.currency_code,
      settlement_conversion_rate:
        row.settlement_conversion_rate == null ? null : Number(row.settlement_conversion_rate),
      settlement_amount_in_credit_currency:
        row.settlement_amount_in_credit_currency == null ? null : amountInObligation,
      settlement_note: row.settlement_note ?? null,
      explanation: row.explanation
    });
    settlementsByObligationId.set(row.settles_entry_id, list);
  }

  for (const row of (parentResult.data ?? []) as RawBigBookSettlementParentRow[]) {
    const vendor = Array.isArray(row.business_ledger_vendors)
      ? row.business_ledger_vendors[0]
      : row.business_ledger_vendors;
    const isDebt = Boolean(row.is_debt);
    const creditSettledAt = row.credit_settled_at ?? null;
    const debtSettledAt = row.debt_settled_at ?? null;
    parentsById.set(row.id, {
      id: row.id,
      entry_date: row.entry_date,
      explanation: row.explanation,
      amount: Number(row.amount),
      currency_code: row.currency_code,
      vendor_name: vendor?.name ?? null,
      is_debt: isDebt,
      credit_status: isDebt ? null : computeBigBookCreditStatus(creditSettledAt),
      credit_settled_at: creditSettledAt,
      debt_status: isDebt ? computeBigBookDebtStatus(debtSettledAt) : null,
      debt_settled_at: debtSettledAt
    });
  }

  return entries.map((entry) => {
    const debtStatus = entry.is_debt ? computeBigBookDebtStatus(entry.debt_settled_at) : null;

    if (entry.is_credit || entry.is_debt) {
      const settlements = settlementsByObligationId.get(entry.id) ?? [];
      const totalSettled = settledSumByObligationId.get(entry.id) ?? 0;
      return {
        ...entry,
        settlements,
        total_settled: totalSettled,
        credit_status: entry.is_credit
          ? computeBigBookCreditStatus(entry.credit_settled_at)
          : null,
        debt_status: debtStatus,
        settles_entry: null
      };
    }

    if (entry.settles_entry_id) {
      return {
        ...entry,
        settlements: [],
        total_settled: 0,
        credit_status: null,
        debt_status: debtStatus,
        settles_entry: parentsById.get(entry.settles_entry_id) ?? null
      };
    }

    return {
      ...entry,
      debt_status: debtStatus
    };
  });
}

/** Absolute ceiling for unpaginated-style fetches (export uses this). */
export const BIG_BOOK_ENTRIES_MAX_ROWS = 100_000;

export async function getBigBookEntries(filters?: BigBookEntryFilters & { limit?: number }): Promise<BigBookEntry[]> {
  const supabase = await createClient();
  const maxRows = Math.min(
    Math.max(1, Math.floor(filters?.limit ?? 500)),
    BIG_BOOK_ENTRIES_MAX_ROWS
  );

  // Page with .range() — a single .limit(N) is silently clamped by PostgREST
  // max-rows (~1000), which truncated full CSV exports.
  const data = await collectRangePages(
    async (from, to) => {
      let query = supabase
        .from("business_ledger_entries")
        .select(BIG_BOOK_ENTRY_SELECT)
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false });

      query = applyBigBookEntryFilters(query, filters);
      const { data: batch, error } = await query.range(from, to);
      if (error) throw error;
      return (batch ?? []) as RawBigBookEntryRow[];
    },
    { maxRows }
  );

  const actorIds: string[] = [];
  for (const row of data) {
    if (row.created_by) actorIds.push(row.created_by);
    if (row.updated_by) actorIds.push(row.updated_by);
    if (row.credit_settled_by) actorIds.push(row.credit_settled_by);
    if (row.debt_settled_by) actorIds.push(row.debt_settled_by);
  }
  const actorMap = await resolveDisplayNameMap(supabase, actorIds);

  const mapped = data.map((row) => mapBigBookEntryRow(row, actorMap));
  return attachBigBookCreditSummaries(supabase, mapped);
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
    if (row.credit_settled_by) actorIds.push(row.credit_settled_by);
    if (row.debt_settled_by) actorIds.push(row.debt_settled_by);
  }
  const actorMap = await resolveDisplayNameMap(supabase, actorIds);

  const rows: BigBookEntry[] = await attachBigBookCreditSummaries(
    supabase,
    (data ?? []).map((row) => mapBigBookEntryRow(row as RawBigBookEntryRow, actorMap))
  );

  return { rows, totalCount };
}

async function loadLedgerSortNameLookups(
  sortBy: BigBookLedgerSortKey
): Promise<LedgerNameLookups> {
  if (!ledgerSortNeedsNameLookups(sortBy)) return {};

  const lookups: LedgerNameLookups = {};
  switch (sortBy) {
    case "type_name": {
      const rows = await getBigBookLedgerTypes({ includeInactive: true });
      lookups.typeNameById = new Map(rows.map((row) => [row.id, row.name]));
      break;
    }
    case "vendor_type_name": {
      const rows = await getBigBookVendorTypes({ includeInactive: true });
      lookups.vendorTypeNameById = new Map(rows.map((row) => [row.id, row.name]));
      break;
    }
    case "vendor_name": {
      const rows = await getBigBookVendors({ includeInactive: true });
      lookups.vendorNameById = new Map(rows.map((row) => [row.id, row.name]));
      break;
    }
    case "action_by_name": {
      const rows = await getBigBookActionBy({ includeInactive: true });
      lookups.actionByNameById = new Map(rows.map((row) => [row.id, row.name]));
      break;
    }
    case "pocket_name": {
      const rows = await getBigBookActorPockets({ includeInactive: true });
      lookups.pocketNameById = new Map(rows.map((row) => [row.id, row.name]));
      break;
    }
    case "actor_display_name": {
      const rows = await getBigBookActors();
      lookups.actorNameById = new Map(rows.map((row) => [row.id, row.display_name]));
      break;
    }
    default:
      break;
  }
  return lookups;
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
  // Entry counts describe the rows on screen, so these report how many of them
  // were held back from the totals and let the footer say so.
  pagePocketExcludedCount: number;
  grandPocketExcludedCount: number;
};

type LedgerPageRpcKey = {
  kind: "entry" | "group";
  id: string;
  sort_date: string;
};

type LedgerPageRpcResult = {
  totalCount: number;
  pageKeys: LedgerPageRpcKey[];
  totals: BigBookLedgerTotals;
};

export type BigBookLedgerRowsPagedResult = {
  rows: BigBookLedgerRow[];
  totalCount: number;
  totals: BigBookLedgerTotals;
};

const EMPTY_LEDGER_TOTALS: BigBookLedgerTotals = {
  pageTotals: [],
  pageEntryCount: 0,
  grandTotals: [],
  grandEntryCount: 0,
  pagePocketExcludedCount: 0,
  grandPocketExcludedCount: 0
};

function ledgerTotalsFromEntries(entries: BigBookEntry[]): BigBookLedgerTotals {
  const pocketRows = entries.filter((entry) => !entry.pocket_id);
  const totalRows = pocketRows.filter((entry) => !entry.is_debt);
  return {
    pageTotals: summarizeCurrencies(totalRows),
    pageEntryCount: entries.length,
    grandTotals: summarizeCurrencies(totalRows),
    grandEntryCount: entries.length,
    pagePocketExcludedCount: entries.length - pocketRows.length,
    grandPocketExcludedCount: entries.length - pocketRows.length
  };
}

export async function getBigBookLedgerRowsPaged(
  filters: BigBookEntryFilters & {
    page: number;
    pageSize: number;
    sortBy?: BigBookLedgerSortKey;
    sortDir?: BigBookLedgerSortDir;
  }
): Promise<BigBookLedgerRowsPagedResult> {
  const supabase = await createClient();
  const page = Math.max(0, Math.floor(filters.page));
  const pageSize = Math.max(1, Math.floor(filters.pageSize));
  const sortBy = filters.sortBy ?? "entry_date";
  const sortDir = filters.sortDir ?? "desc";

  let pageKeys: Array<{ kind: "entry" | "group"; id: string; sort_date: string }> = [];
  let totalCount = 0;
  let totals: BigBookLedgerTotals = EMPTY_LEDGER_TOTALS;
  const focusedEntryId = filters.entryId;

  if (focusedEntryId) {
    const { data: focusRow, error: focusError } = await supabase
      .from("business_ledger_entries")
      .select("id, group_id, entry_date")
      .eq("id", focusedEntryId)
      .maybeSingle();
    if (focusError) throw focusError;
    if (!focusRow) {
      return { rows: [], totalCount: 0, totals: EMPTY_LEDGER_TOTALS };
    }
    pageKeys = focusRow.group_id
      ? [{ kind: "group", id: focusRow.group_id, sort_date: focusRow.entry_date }]
      : [{ kind: "entry", id: focusRow.id, sort_date: focusRow.entry_date }];
    totalCount = 1;
  } else {
  const endRpc = perfStart("ledgerRowsPaged.rpc");
  const { data: rpcData, error: rpcError } = await tryRpc<LedgerPageRpcResult>(
    supabase,
    "get_big_book_ledger_page",
    {
      p_page: page,
      p_page_size: pageSize,
      p_sort_by: sortBy,
      p_sort_dir: sortDir,
      p_type_ids: toRpcArray(filters.typeId),
      p_currency_codes: toRpcArray(filters.currencyCode),
      p_directions: toRpcArray(filters.direction),
      p_actor_ids: toRpcArray(filters.actorId),
      p_vendor_type_ids: toRpcArray(filters.vendorTypeId),
      p_vendor_ids: toRpcArray(filters.vendorId),
      p_pocket_ids: toRpcArray(filters.pocketId),
      p_action_by_ids: toRpcArray(filters.actionById),
      p_credit_flags: toRpcArray(filters.creditFlag),
      p_credit_statuses: toRpcArray(filters.creditStatus),
      p_date_from: filters.dateFrom || null,
      p_date_to: filters.dateTo || null,
      p_query: sanitizeBigBookSearchQuery(filters.query ?? "") || null
    }
  );
  endRpc();

  if (rpcError && !isMissingRpcError(rpcError)) throw rpcError;

  if (!rpcError && rpcData) {
    const parsed = rpcData as LedgerPageRpcResult;
    pageKeys = Array.isArray(parsed.pageKeys) ? parsed.pageKeys : [];
    totalCount = typeof parsed.totalCount === "number" ? parsed.totalCount : 0;
    totals = {
      pageTotals: Array.isArray(parsed.totals?.pageTotals) ? parsed.totals.pageTotals : [],
      pageEntryCount: parsed.totals?.pageEntryCount ?? 0,
      grandTotals: Array.isArray(parsed.totals?.grandTotals) ? parsed.totals.grandTotals : [],
      grandEntryCount: parsed.totals?.grandEntryCount ?? 0,
      pagePocketExcludedCount: parsed.totals?.pagePocketExcludedCount ?? 0,
      grandPocketExcludedCount: parsed.totals?.grandPocketExcludedCount ?? 0
    };
  } else {
    // Fallback when the migration has not been applied yet.
    const scanPageSize = 1000;
    const endScanAndLookups = perfStart("ledgerRowsPaged.scan+lookups.fallback");
    const [scanRows, lookups] = await Promise.all([
      (async () => {
        let offset = 0;
        const rows: LedgerScanRow[] = [];
        while (true) {
          let query = supabase
            .from("business_ledger_entries")
            .select(
              "id, group_id, entry_date, created_at, amount, currency_code, entry_direction, pocket_id, is_credit, is_debt, explanation, entry_type_id, vendor_type_id, vendor_id, action_by_id, responsible_actor_id"
            )
            .order("entry_date", { ascending: false })
            .order("created_at", { ascending: false })
            .range(offset, offset + scanPageSize - 1);

          query = applyBigBookEntryFilters(query, filters);

          const { data, error } = await query;
          if (error) throw error;
          const batch = (data ?? []) as LedgerScanRow[];
          rows.push(...batch);
          if (batch.length < scanPageSize) break;
          offset += scanPageSize;
        }
        return rows;
      })(),
      loadLedgerSortNameLookups(sortBy)
    ]);
    endScanAndLookups();

    const displayKeys = buildLedgerDisplayKeys(scanRows, { sortBy, sortDir, lookups });
    totalCount = displayKeys.length;
    pageKeys = displayKeys.slice(page * pageSize, page * pageSize + pageSize).map((key) => ({
      kind: key.kind,
      id: key.id,
      sort_date: key.sort_date
    }));

    const standaloneIdSet = new Set(pageKeys.filter((key) => key.kind === "entry").map((key) => key.id));
    const pageGroupIdSet = new Set(pageKeys.filter((key) => key.kind === "group").map((key) => key.id));
    const pageScanRows = scanRows.filter((row) =>
      row.group_id ? pageGroupIdSet.has(row.group_id) : standaloneIdSet.has(row.id)
    );
    const pocketFilterActive = Boolean(toFilterArray(filters.pocketId)?.length);
    const countsTowardTotals = (row: LedgerScanRow) =>
      (pocketFilterActive || !row.pocket_id) && !row.is_debt;
    const pageTotalRows = pageScanRows.filter(countsTowardTotals);
    const grandTotalRows = scanRows.filter(countsTowardTotals);
    const pagePocketExcludedCount = pageScanRows.filter(
      (row) => !pocketFilterActive && Boolean(row.pocket_id)
    ).length;
    const grandPocketExcludedCount = scanRows.filter(
      (row) => !pocketFilterActive && Boolean(row.pocket_id)
    ).length;
    totals = {
      pageTotals: summarizeCurrencies(pageTotalRows),
      pageEntryCount: pageScanRows.length,
      grandTotals: summarizeCurrencies(grandTotalRows),
      grandEntryCount: scanRows.length,
      pagePocketExcludedCount,
      grandPocketExcludedCount
    };
  }
  }

  const standaloneIds = pageKeys.filter((key) => key.kind === "entry").map((key) => key.id);
  const pageGroupIds = pageKeys.filter((key) => key.kind === "group").map((key) => key.id);

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
    if (row.credit_settled_by) actorIds.push(row.credit_settled_by);
    if (row.debt_settled_by) actorIds.push(row.debt_settled_by);
  }
  for (const group of groupsResult.data ?? []) {
    if (group.created_by) actorIds.push(group.created_by);
    if (group.updated_by) actorIds.push(group.updated_by);
  }

  // Display-name lookup and credit summaries are independent after the raw
  // entries are in hand. Map with an empty name map first, then stamp names on.
  const emptyActorMap = new Map<string, string>();
  const endHydrate = perfStart("ledgerRowsPaged.names+credits");
  const [actorMap, creditMappedEntries] = await Promise.all([
    resolveDisplayNameMap(supabase, actorIds),
    attachBigBookCreditSummaries(
      supabase,
      allRawEntries.map((raw) => mapBigBookEntryRow(raw, emptyActorMap))
    )
  ]);
  endHydrate();

  const mappedEntries = creditMappedEntries.map((entry) => ({
    ...entry,
    creator_display_name: entry.created_by
      ? (actorMap.get(entry.created_by) ?? entry.created_by)
      : "-",
    updater_display_name: entry.updated_by
      ? (actorMap.get(entry.updated_by) ?? entry.updated_by)
      : "-",
    credit_settled_by_display_name: entry.credit_settled_by
      ? (actorMap.get(entry.credit_settled_by) ?? entry.credit_settled_by)
      : "-",
    debt_settled_by_display_name: entry.debt_settled_by
      ? (actorMap.get(entry.debt_settled_by) ?? entry.debt_settled_by)
      : "-"
  }));

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

  if (focusedEntryId) {
    const focusedEntries = rows.flatMap((row) =>
      row.kind === "entry" ? [row.entry] : row.entries
    );
    totals = ledgerTotalsFromEntries(focusedEntries);
  }

  return { rows, totalCount, totals };
}

export async function getBigBookActorCurrencyMetrics(): Promise<BigBookActorCurrencyMetrics[]> {
  const supabase = await createClient();
  const { data, error } = await tryRpc<
    Array<{
      actor_id: string;
      actor_code: "A" | "B";
      actor_display_name: string;
      currency_code: "IDR" | "MYR" | "USDT" | "TRX";
      net: number;
    }>
  >(supabase, "get_big_book_actor_currency_metrics");

  if (error && !isMissingRpcError(error)) throw error;

  if (!error && data) {
    const byActor = new Map<string, BigBookActorCurrencyMetrics>();
    for (const row of data as Array<{
      actor_id: string;
      actor_code: "A" | "B";
      actor_display_name: string;
      currency_code: "IDR" | "MYR" | "USDT" | "TRX";
      net: number;
    }>) {
      const existing =
        byActor.get(row.actor_id) ??
        ({
          actor_id: row.actor_id,
          actor_code: row.actor_code ?? "A",
          actor_display_name: row.actor_display_name ?? "Unknown Actor",
          totals: { IDR: 0, MYR: 0, USDT: 0, TRX: 0 }
        } as BigBookActorCurrencyMetrics);
      existing.totals[row.currency_code] += Number(row.net);
      byActor.set(row.actor_id, existing);
    }
    return [...byActor.values()].sort((a, b) => a.actor_code.localeCompare(b.actor_code));
  }

  // Fallback scan when migration is not yet applied.
  const pageSize = 1000;
  let offset = 0;
  const rows: Array<{
    responsible_actor_id: string;
    entry_direction: "spending" | "profit";
    currency_code: "IDR" | "MYR" | "USDT" | "TRX";
    amount: number;
    is_debt: boolean | null;
    big_book_actors: { actor_code: "A" | "B"; display_name: string } | { actor_code: "A" | "B"; display_name: string }[] | null;
  }> = [];

  while (true) {
    const { data: batchData, error: batchError } = await supabase
      .from("business_ledger_entries")
      .select(
        `
        responsible_actor_id, entry_direction, currency_code, amount, is_debt,
        big_book_actors(actor_code, display_name)
      `
      )
      .is("pocket_id", null)
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (batchError) throw batchError;
    const batch = (batchData ?? []) as typeof rows;
    rows.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }

  const byActor = new Map<string, BigBookActorCurrencyMetrics>();
  for (const row of rows) {
    if (row.is_debt) continue;
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

type ActorPocketMetricRow = {
  actor_id: string;
  actor_code: "A" | "B";
  actor_display_name: string;
  pocket_id: string;
  pocket_name: string;
  is_active: boolean;
  net: number;
};

function groupActorPocketMetrics(rows: ActorPocketMetricRow[]): BigBookActorPocketMetrics[] {
  const byActor = new Map<string, BigBookActorPocketMetrics>();
  for (const row of rows) {
    const existing = byActor.get(row.actor_id) ?? {
      actor_id: row.actor_id,
      actor_code: row.actor_code,
      actor_display_name: row.actor_display_name,
      pockets: []
    };
    existing.pockets.push({
      pocket_id: row.pocket_id,
      pocket_name: row.pocket_name,
      is_active: row.is_active,
      net: Number(row.net)
    });
    byActor.set(row.actor_id, existing);
  }
  return [...byActor.values()].sort((a, b) => a.actor_code.localeCompare(b.actor_code));
}

export async function getBigBookActorPocketMetrics(): Promise<BigBookActorPocketMetrics[]> {
  const supabase = await createClient();
  const bigBookResult = await tryRpc<ActorPocketMetricRow[]>(supabase, "get_big_book_actor_pocket_metrics");

  if (bigBookResult.error && !isMissingRpcError(bigBookResult.error)) throw bigBookResult.error;

  if (!bigBookResult.error && bigBookResult.data) {
    return groupActorPocketMetrics(bigBookResult.data);
  }

  const [actors, pockets] = await Promise.all([
    getBigBookActors(),
    getBigBookActorPockets({ includeInactive: true })
  ]);

  if (!pockets.length) return [];

  const pageSize = 1000;
  let offset = 0;
  const rows: Array<{
    pocket_id: string | null;
    entry_direction: "spending" | "profit";
    amount: number;
    is_debt: boolean | null;
  }> = [];

  while (true) {
    const { data: batchData, error: batchError } = await supabase
      .from("business_ledger_entries")
      .select("pocket_id, entry_direction, amount, is_debt")
      .not("pocket_id", "is", null)
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (batchError) throw batchError;
    const batch = (batchData ?? []) as typeof rows;
    rows.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }

  const netByPocket = new Map<string, number>();
  for (const row of rows) {
    if (!row.pocket_id || row.is_debt) continue;
    const amount = Math.abs(Number(row.amount));
    const signedAmount = row.entry_direction === "spending" ? -amount : amount;
    netByPocket.set(row.pocket_id, (netByPocket.get(row.pocket_id) ?? 0) + signedAmount);
  }

  const actorById = new Map(actors.map((actor) => [actor.id, actor]));
  return groupActorPocketMetrics(
    pockets.map((pocket) => {
      const actor = actorById.get(pocket.actor_id);
      return {
        actor_id: pocket.actor_id,
        actor_code: (actor?.actor_code ?? "A") as "A" | "B",
        actor_display_name: actor?.display_name ?? "Unknown Actor",
        pocket_id: pocket.id,
        pocket_name: pocket.name,
        is_active: pocket.is_active,
        net: netByPocket.get(pocket.id) ?? 0
      };
    })
  );
}

const BIG_BOOK_CASHFLOW_SCAN_PAGE_SIZE = 1000;

const BIG_BOOK_CASHFLOW_SCAN_SELECT = `
  responsible_actor_id, entry_type_id, entry_direction, currency_code, amount, is_debt,
  big_book_actors(display_name),
  business_ledger_types(code, name)
`;

type RawBigBookCashflowScanRow = {
  responsible_actor_id: string;
  entry_type_id: string;
  entry_direction: "spending" | "profit";
  currency_code: BigBookTypeCashflowByCurrency["currency"];
  amount: number | string;
  is_debt: boolean | null;
  big_book_actors: { display_name: string } | { display_name: string }[] | null;
  business_ledger_types: { code: string; name: string } | { code: string; name: string }[] | null;
};

export async function getBigBookTypeCashflowByCurrency(filters?: {
  actorId?: string[];
  typeId?: string[];
  vendorTypeId?: string[];
  vendorId?: string[];
  currencyCode?: Array<BigBookTypeCashflowByCurrency["currency"]>;
  dateFrom?: string;
  dateTo?: string;
}): Promise<BigBookTypeCashflowByCurrency[]> {
  const supabase = await createClient();
  const allCurrencies: Array<BigBookTypeCashflowByCurrency["currency"]> = ["IDR", "MYR", "USDT", "TRX"];
  const currencies = filters?.currencyCode?.length
    ? allCurrencies.filter((currency) => filters.currencyCode!.includes(currency))
    : allCurrencies;

  const { data: rpcData, error: rpcError } = await tryRpc<
    Array<{
      currency: BigBookTypeCashflowByCurrency["currency"];
      actor_id: string;
      actor_display_name: string;
      type_id: string;
      type_code: string;
      type_name: string;
      spending: number;
      profit: number;
    }>
  >(supabase, "get_big_book_type_cashflow_by_currency", {
    p_actor_ids: toRpcArray(filters?.actorId),
    p_type_ids: toRpcArray(filters?.typeId),
    p_vendor_type_ids: toRpcArray(filters?.vendorTypeId),
    p_vendor_ids: toRpcArray(filters?.vendorId),
    p_currency_codes: toRpcArray(filters?.currencyCode),
    p_date_from: filters?.dateFrom || null,
    p_date_to: filters?.dateTo || null
  });

  if (rpcError && !isMissingRpcError(rpcError)) throw rpcError;

  const rowsByCurrency = new Map<
    BigBookTypeCashflowByCurrency["currency"],
    Map<string, BigBookTypeCashflowRow>
  >(currencies.map((currency) => [currency, new Map<string, BigBookTypeCashflowRow>()]));

  if (!rpcError && rpcData) {
    for (const row of rpcData as Array<{
      currency: BigBookTypeCashflowByCurrency["currency"];
      actor_id: string;
      actor_display_name: string;
      type_id: string;
      type_code: string;
      type_name: string;
      spending: number;
      profit: number;
    }>) {
      const bucket = rowsByCurrency.get(row.currency);
      if (!bucket) continue;
      const rowKey = `${row.actor_id}:${row.type_id}`;
      const inflow = Number(row.profit);
      const outflow = Number(row.spending);
      bucket.set(rowKey, {
        row_key: rowKey,
        actor_id: row.actor_id,
        actor_display_name: row.actor_display_name ?? "Unknown Actor",
        type_id: row.type_id,
        type_code: row.type_code ?? "",
        type_name: row.type_name ?? "Unknown Type",
        inflow,
        outflow,
        net: inflow - outflow
      });
    }
  } else {
    const activeTypes = await getBigBookLedgerTypes({ includeInactive: true });
    const typeMap = new Map(activeTypes.map((type) => [type.id, type]));
    const scanRows: RawBigBookCashflowScanRow[] = [];
    let offset = 0;
    while (true) {
      let query = supabase
        .from("business_ledger_entries")
        .select(BIG_BOOK_CASHFLOW_SCAN_SELECT)
        .is("pocket_id", null)
        .order("id", { ascending: true });
      query = applyBigBookEntryFilters(query, filters);

      const { data, error } = await query.range(
        offset,
        offset + BIG_BOOK_CASHFLOW_SCAN_PAGE_SIZE - 1
      );
      if (error) throw error;

      const batch = (data ?? []) as unknown as RawBigBookCashflowScanRow[];
      scanRows.push(...batch);
      if (batch.length < BIG_BOOK_CASHFLOW_SCAN_PAGE_SIZE) break;
      offset += BIG_BOOK_CASHFLOW_SCAN_PAGE_SIZE;
    }

    for (const row of scanRows) {
      if (row.is_debt) continue;
      const bucket = rowsByCurrency.get(row.currency_code);
      if (!bucket) continue;
      const amount = Math.abs(Number(row.amount));
      if (!Number.isFinite(amount)) continue;

      const rowKey = `${row.responsible_actor_id}:${row.entry_type_id}`;
      let cashflowRow = bucket.get(rowKey);
      if (!cashflowRow) {
        const actor = Array.isArray(row.big_book_actors) ? row.big_book_actors[0] : row.big_book_actors;
        const joinedType = Array.isArray(row.business_ledger_types)
          ? row.business_ledger_types[0]
          : row.business_ledger_types;
        const type = typeMap.get(row.entry_type_id);
        cashflowRow = {
          row_key: rowKey,
          actor_id: row.responsible_actor_id,
          actor_display_name: actor?.display_name ?? "Unknown Actor",
          type_id: row.entry_type_id,
          type_code: type?.code ?? joinedType?.code ?? "",
          type_name: type?.name ?? joinedType?.name ?? "Unknown Type",
          inflow: 0,
          outflow: 0,
          net: 0
        };
        bucket.set(rowKey, cashflowRow);
      }

      if (row.entry_direction === "profit") {
        cashflowRow.inflow += amount;
      } else {
        cashflowRow.outflow += amount;
      }
    }
  }

  return currencies.map((currency) => {
    const rows = [...(rowsByCurrency.get(currency)?.values() ?? [])].map((row) => {
      const inflow = roundBigBookAmount(row.inflow);
      const outflow = roundBigBookAmount(row.outflow);
      return { ...row, inflow, outflow, net: roundBigBookAmount(inflow - outflow) };
    });

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

    return {
      currency,
      rows,
      combined: {
        inflow: roundBigBookAmount(combined.inflow),
        outflow: roundBigBookAmount(combined.outflow),
        net: roundBigBookAmount(combined.net)
      }
    };
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
    .select("entry_date, entry_direction, currency_code, amount, is_debt")
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
      is_debt: boolean | null;
    }>)
      .filter((row) => !row.is_debt)
      .map((row) => ({
        entry_date: row.entry_date,
        entry_direction: row.entry_direction,
        currency_code: row.currency_code,
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
  credit_status: BigBookCreditStatus;
};

export async function getBigBookOpenCreditsForPicker(options?: {
  query?: string;
  limit?: number;
}): Promise<BigBookOpenCreditOption[]> {
  const entries = await getBigBookEntries({
    creditFlag: ["credit"],
    creditStatus: ["open"],
    query: options?.query,
    limit: options?.limit ?? 50
  });

  return entries.map((entry) => ({
    id: entry.id,
    entry_date: entry.entry_date,
    explanation: entry.explanation,
    vendor_name: entry.vendor_name,
    amount: entry.amount,
    currency_code: entry.currency_code,
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
  const { data, error } = await tryRpc<
    Array<{
      vendor_id: string | null;
      vendor_name: string;
      vendor_type_id: string | null;
      vendor_type_name: string;
      actor_id: string;
      actor_code: "A" | "B";
      actor_display_name: string;
      currency: BigBookVendorActorOutstandingRow["currency"];
      outstanding: number;
      open_credit_count: number;
    }>
  >(supabase, "get_big_book_vendor_actor_outstanding", {
    p_actor_ids: toRpcArray(filters?.actorId),
    p_vendor_ids: toRpcArray(filters?.vendorId),
    p_vendor_type_ids: toRpcArray(filters?.vendorTypeId),
    p_currency_codes: toRpcArray(filters?.currencyCode),
    p_date_from: filters?.dateFrom || null,
    p_date_to: filters?.dateTo || null
  });

  if (error && !isMissingRpcError(error)) throw error;

  if (!error && data) {
    return (data as Array<{
      vendor_id: string | null;
      vendor_name: string;
      vendor_type_id: string | null;
      vendor_type_name: string;
      actor_id: string;
      actor_code: "A" | "B";
      actor_display_name: string;
      currency: BigBookVendorActorOutstandingRow["currency"];
      outstanding: number;
      open_credit_count: number;
    }>).map((row) => {
      const vendorKey = row.vendor_id ?? "none";
      return {
        row_key: `${vendorKey}:${row.actor_id}:${row.currency}`,
        vendor_id: row.vendor_id,
        vendor_name: row.vendor_name,
        vendor_type_id: row.vendor_type_id,
        vendor_type_name: row.vendor_type_name,
        actor_id: row.actor_id,
        actor_code: row.actor_code,
        actor_display_name: row.actor_display_name,
        currency: row.currency,
        outstanding: Number(row.outstanding),
        open_credit_count: Number(row.open_credit_count)
      };
    });
  }

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
      .is("credit_settled_at", null)
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    query = applyBigBookEntryFilters(query, {
      actorId: filters?.actorId,
      vendorId: filters?.vendorId,
      vendorTypeId: filters?.vendorTypeId,
      currencyCode: filters?.currencyCode,
      dateFrom: filters?.dateFrom,
      dateTo: filters?.dateTo
    });

    const { data: batchData, error: batchError } = await query;
    if (batchError) throw batchError;
    const batch = (batchData ?? []) as CreditScanRow[];
    creditRows.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
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
    })
  );
}

export const BIG_BOOK_VENDOR_ACTOR_OUTSTANDING_ENTRIES_LIMIT = 500;

export async function getBigBookVendorActorOutstandingEntries(params: {
  vendorId: string | null;
  actorId: string;
  currency: BigBookVendorActorOutstandingRow["currency"];
  dateFrom?: string;
  dateTo?: string;
}): Promise<BigBookVendorActorOutstandingEntriesResult> {
  const supabase = await createClient();
  const limit = BIG_BOOK_VENDOR_ACTOR_OUTSTANDING_ENTRIES_LIMIT;

  let query = supabase
    .from("business_ledger_entries")
    .select(
      `
      id, entry_date, entry_direction, entry_type_id, explanation, amount, currency_code, remark,
      business_ledger_types(name)
    `,
      { count: "exact" }
    )
    .eq("is_credit", true)
    .is("credit_settled_at", null)
    .eq("responsible_actor_id", params.actorId)
    .eq("currency_code", params.currency);

  query = params.vendorId
    ? query.eq("vendor_id", params.vendorId)
    : query.is("vendor_id", null);

  if (params.dateFrom) query = query.gte("entry_date", params.dateFrom);
  if (params.dateTo) query = query.lte("entry_date", params.dateTo);

  const { data, error, count } = await query
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(0, limit - 1);

  if (error) throw error;

  const rows: BigBookVendorActorOutstandingEntry[] = (data ?? []).map((row) => {
    const type = Array.isArray(row.business_ledger_types)
      ? row.business_ledger_types[0]
      : row.business_ledger_types;
    return {
      id: row.id,
      entry_date: row.entry_date,
      entry_direction: row.entry_direction === "profit" ? "profit" : "spending",
      entry_type_id: row.entry_type_id ?? null,
      type_name: type?.name ?? "-",
      explanation: row.explanation,
      amount: Math.abs(Number(row.amount)),
      currency_code: row.currency_code,
      remark: row.remark ?? null
    };
  });

  return {
    rows,
    totalCount: typeof count === "number" ? count : rows.length
  };
}

export async function getBigBookVendorActorOutstandingDebt(filters?: {
  actorId?: string[];
  vendorId?: string[];
  vendorTypeId?: string[];
  currencyCode?: string[];
  dateFrom?: string;
  dateTo?: string;
}): Promise<BigBookVendorActorOutstandingDebtRow[]> {
  const supabase = await createClient();
  const pageSize = 1000;
  let offset = 0;

  type DebtScanRow = {
    id: string;
    group_id: string | null;
    explanation: string | null;
    responsible_actor_id: string;
    vendor_type_id: string | null;
    currency_code: BigBookVendorActorOutstandingDebtRow["currency"];
    amount: number | string;
    business_ledger_entry_groups: { id: string; label: string } | { id: string; label: string }[] | null;
    business_ledger_vendor_types: { id: string; name: string } | { id: string; name: string }[] | null;
    big_book_actors:
      | { id: string; actor_code: "A" | "B"; display_name: string }
      | { id: string; actor_code: "A" | "B"; display_name: string }[]
      | null;
  };

  const debtRows: DebtScanRow[] = [];
  while (true) {
    let query = supabase
      .from("business_ledger_entries")
      .select(
        `
        id, group_id, explanation, responsible_actor_id, vendor_type_id, currency_code, amount,
        business_ledger_entry_groups(id, label),
        business_ledger_vendor_types(id, name),
        big_book_actors(id, actor_code, display_name)
      `
      )
      .eq("is_debt", true)
      .is("debt_settled_at", null)
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    query = applyBigBookEntryFilters(query, {
      actorId: filters?.actorId,
      vendorId: filters?.vendorId,
      vendorTypeId: filters?.vendorTypeId,
      currencyCode: filters?.currencyCode,
      dateFrom: filters?.dateFrom,
      dateTo: filters?.dateTo
    });

    const { data: batchData, error: batchError } = await query;
    if (batchError) throw batchError;
    const batch = (batchData ?? []) as DebtScanRow[];
    debtRows.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }

  return aggregateVendorActorOutstandingDebt(
    debtRows.map((row) => {
      const group = Array.isArray(row.business_ledger_entry_groups)
        ? row.business_ledger_entry_groups[0]
        : row.business_ledger_entry_groups;
      const vendorType = Array.isArray(row.business_ledger_vendor_types)
        ? row.business_ledger_vendor_types[0]
        : row.business_ledger_vendor_types;
      const actor = Array.isArray(row.big_book_actors)
        ? row.big_book_actors[0]
        : row.big_book_actors;
      return {
        id: row.id,
        group_id: row.group_id,
        group_label: group?.label ?? null,
        explanation: row.explanation,
        responsible_actor_id: row.responsible_actor_id,
        vendor_type_id: row.vendor_type_id,
        currency_code: row.currency_code,
        amount: Number(row.amount),
        vendor_type_name: vendorType?.name ?? null,
        actor_code: (actor?.actor_code ?? "A") as "A" | "B",
        actor_display_name: actor?.display_name ?? "Unknown Actor"
      };
    })
  );
}

export async function getBigBookVendorActorOutstandingDebtEntries(params: {
  groupId: string | null;
  entryId?: string | null;
  actorId: string;
  currency: BigBookVendorActorOutstandingDebtRow["currency"];
  dateFrom?: string;
  dateTo?: string;
}): Promise<BigBookVendorActorOutstandingDebtEntriesResult> {
  const supabase = await createClient();
  const limit = BIG_BOOK_VENDOR_ACTOR_OUTSTANDING_ENTRIES_LIMIT;

  let query = supabase
    .from("business_ledger_entries")
    .select(
      `
      id, entry_date, entry_direction, entry_type_id, explanation, amount, currency_code, remark,
      business_ledger_types(name)
    `,
      { count: "exact" }
    )
    .eq("is_debt", true)
    .is("debt_settled_at", null)
    .eq("responsible_actor_id", params.actorId)
    .eq("currency_code", params.currency);

  if (params.groupId) {
    query = query.eq("group_id", params.groupId);
  } else if (params.entryId) {
    query = query.eq("id", params.entryId).is("group_id", null);
  } else {
    query = query.is("group_id", null);
  }

  if (params.dateFrom) query = query.gte("entry_date", params.dateFrom);
  if (params.dateTo) query = query.lte("entry_date", params.dateTo);

  const { data, error, count } = await query
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(0, limit - 1);

  if (error) throw error;

  const rows: BigBookVendorActorOutstandingEntry[] = (data ?? []).map((row) => {
    const type = Array.isArray(row.business_ledger_types)
      ? row.business_ledger_types[0]
      : row.business_ledger_types;
    return {
      id: row.id,
      entry_date: row.entry_date,
      entry_direction: row.entry_direction === "profit" ? "profit" : "spending",
      entry_type_id: row.entry_type_id ?? null,
      type_name: type?.name ?? "-",
      explanation: row.explanation,
      amount: Math.abs(Number(row.amount)),
      currency_code: row.currency_code,
      remark: row.remark ?? null
    };
  });

  return {
    rows,
    totalCount: typeof count === "number" ? count : rows.length
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
      id, entry_date, entry_direction, entry_type_id, explanation, amount, currency_code, remark, responsible_actor_id, created_by, updated_by, created_at, updated_at,
      credit_ledger_types(id, code, name),
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

  const actorMap = await resolveDisplayNameMap(supabase, [...actorIds]);

  const mapped = (data ?? []).map((row) => {
    const type = Array.isArray(row.credit_ledger_types)
      ? row.credit_ledger_types[0]
      : row.credit_ledger_types;
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
      id, entry_date, entry_direction, entry_type_id, explanation, amount, currency_code, remark, responsible_actor_id, created_by, updated_by, created_at, updated_at,
      credit_ledger_types(id, code, name),
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

  const actorMap = await resolveDisplayNameMap(supabase, [...actorIds]);

  const rows: CreditBookEntry[] = (data ?? []).map((row) => {
    const type = Array.isArray(row.credit_ledger_types)
      ? row.credit_ledger_types[0]
      : row.credit_ledger_types;
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

  const actorMap = await resolveDisplayNameMap(supabase, [...actorIds]);

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
