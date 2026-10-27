import { createClient } from "@/lib/supabase/server";
import { loadDisplayNameDirectory } from "@/lib/db/display-names";
import { collectRangePages } from "@/lib/db/range-pages";
import { perfStart } from "@/lib/perf";
import { callRequiredRpc } from "@/lib/db/required-rpc";
import { computeBigBookCreditStatus } from "@/lib/big-book/credit";
import {
  computeBigBookDebtStatus,
  toVendorActorOutstandingDebtRows,
  type VendorActorOutstandingDebtRpcRow
} from "@/lib/big-book/debt";
import {
  amountCountedInLedgerTotals,
  roundBigBookAmount,
  summarizeCurrencies,
  type BigBookCurrency,
  type BigBookCurrencyTotal
} from "@/lib/big-book/totals";
import {
  type BigBookLedgerSortDir,
  type BigBookLedgerSortKey
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
  BigBookEntryAuditLog,
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
  BigBookMonthlyCurrencyRow
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
  creditFlag?: Array<"credit" | "future_credit" | "settlement" | "none">;
  creditStatus?: BigBookCreditStatus[];
  dateFrom?: string;
  dateTo?: string;
  query?: string;
  entryId?: string;
};

const BIG_BOOK_ENTRY_SELECT = `
  id, group_id, entry_date, entry_direction, entry_type_id, vendor_type_id, vendor_id, pocket_id, action_by_id, explanation, amount, currency_code, remark, responsible_actor_id, is_credit, is_future_credit, is_debt, settlement_conversion_rate, settlement_note, credit_settled_at, credit_settled_by, credit_settlement_note, debt_settled_at, debt_settled_by, debt_settlement_note, created_by, updated_by, created_at, updated_at,
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
    if (flag === "credit") next = next.eq("is_credit", true).eq("is_future_credit", false);
    else if (flag === "future_credit") next = next.eq("is_credit", true).eq("is_future_credit", true);
    // is_settlement_payment is the allocation-table exists check; the entry select cannot filter the dropped column.
    else if (flag === "settlement") next = next.eq("is_settlement_payment", true);
    else if (flag === "none") next = next.eq("is_credit", false).eq("is_settlement_payment", false);
  } else if (filterCreditFlags && filterCreditFlags.length > 1) {
    const clauses: string[] = [];
    if (filterCreditFlags.includes("credit")) {
      clauses.push("and(is_credit.eq.true,is_future_credit.eq.false)");
    }
    if (filterCreditFlags.includes("future_credit")) {
      clauses.push("and(is_credit.eq.true,is_future_credit.eq.true)");
    }
    if (filterCreditFlags.includes("settlement")) clauses.push("is_settlement_payment.eq.true");
    if (filterCreditFlags.includes("none")) {
      clauses.push("and(is_credit.eq.false,is_settlement_payment.eq.false)");
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
  is_future_credit: boolean | null;
  is_debt: boolean | null;
  settlement_conversion_rate: number | string | null;
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
    is_future_credit: Boolean(row.is_future_credit),
    is_debt: Boolean(row.is_debt),
    settlement_conversion_rate:
      row.settlement_conversion_rate == null ? null : Number(row.settlement_conversion_rate),
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
    credit_status: null,
    debt_status: null,
    settlements: [],
    settles: [],
    balance: null,
    linked_set: [row.id],
    linked_set_counts: { obligations: 0, payments: 0 }
  };
}

type SettlementLinkRow = {
  anchor_entry_id: string;
  role: "obligation" | "payment";
  payment_entry_id: string | null;
  obligation_entry_id: string | null;
  applied_amount: number | string | null;
  payment_entry_date: string | null;
  payment_amount: number | string | null;
  payment_currency_code: "IDR" | "MYR" | "USDT" | "TRX" | null;
  payment_conversion_rate: number | string | null;
  payment_settlement_note: string | null;
  payment_explanation: string | null;
  payment_updated_at: string | null;
  payment_obligation_count: number | null;
  obligation_entry_date: string | null;
  obligation_explanation: string | null;
  obligation_amount: number | string | null;
  obligation_currency_code: "IDR" | "MYR" | "USDT" | "TRX" | null;
  obligation_is_debt: boolean | null;
  obligation_is_future_credit: boolean | null;
  obligation_credit_settled_at: string | null;
  obligation_debt_settled_at: string | null;
  obligation_vendor_name: string | null;
  obligation_face_amount: number | string | null;
  obligation_applied_total: number | string | null;
  obligation_open_balance: number | string | null;
  obligation_unconverted_count: number | string | null;
  linked_set_ids: string[] | null;
};

function finiteNumberOrNull(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function attachBigBookCreditSummaries(
  supabase: Awaited<ReturnType<typeof createClient>>,
  entries: BigBookEntry[]
): Promise<BigBookEntry[]> {
  if (!entries.length) return entries;

  const links = await callRequiredRpc<SettlementLinkRow[] | null>(
    supabase,
    "get_big_book_settlement_links",
    { p_entry_ids: entries.map((entry) => entry.id) }
  );

  const linksByAnchor = new Map<string, SettlementLinkRow[]>();
  for (const row of links ?? []) {
    const list = linksByAnchor.get(row.anchor_entry_id) ?? [];
    list.push(row);
    linksByAnchor.set(row.anchor_entry_id, list);
  }

  return entries.map((entry) => {
    const debtStatus = entry.is_debt ? computeBigBookDebtStatus(entry.debt_settled_at) : null;
    const creditStatus = entry.is_credit ? computeBigBookCreditStatus(entry.credit_settled_at) : null;
    const rows = linksByAnchor.get(entry.id) ?? [];
    const isObligation = entry.is_credit || entry.is_debt;
    const role: SettlementLinkRow["role"] | null = rows[0]?.role ?? (isObligation ? "obligation" : null);

    const settlements: BigBookSettlementRef[] = [];
    const settles: BigBookSettlementTargetRef[] = [];
    const paymentIds = new Set<string>();
    const obligationIds = new Set<string>();
    if (role === "payment") paymentIds.add(entry.id);
    if (role === "obligation") obligationIds.add(entry.id);

    let appliedKnown = 0;
    for (const row of rows) {
      if (row.payment_entry_id) paymentIds.add(row.payment_entry_id);
      if (row.obligation_entry_id) obligationIds.add(row.obligation_entry_id);
      const appliedAmount = finiteNumberOrNull(row.applied_amount);
      if (row.role === "obligation" && appliedAmount != null) appliedKnown += appliedAmount;

      if (row.role === "obligation" && row.payment_entry_id && row.payment_entry_date && row.payment_currency_code) {
        settlements.push({
          id: row.payment_entry_id,
          entry_date: row.payment_entry_date,
          amount: Number(row.payment_amount),
          currency_code: row.payment_currency_code,
          settlement_conversion_rate: finiteNumberOrNull(row.payment_conversion_rate),
          applied_amount: appliedAmount,
          payment_obligation_count: Number(row.payment_obligation_count ?? 1),
          settlement_note: row.payment_settlement_note ?? null,
          explanation: row.payment_explanation ?? "",
          updated_at: row.payment_updated_at ?? entry.updated_at
        });
      }

      if (row.role === "payment" && row.obligation_entry_id && row.obligation_currency_code) {
        const isDebt = Boolean(row.obligation_is_debt);
        const creditSettledAt = row.obligation_credit_settled_at ?? null;
        const debtSettledAt = row.obligation_debt_settled_at ?? null;
        settles.push({
          id: row.obligation_entry_id,
          entry_date: row.obligation_entry_date ?? "",
          explanation: row.obligation_explanation ?? "",
          amount: Number(row.obligation_amount),
          currency_code: row.obligation_currency_code,
          vendor_name: row.obligation_vendor_name ?? null,
          is_debt: isDebt,
          is_future_credit: Boolean(row.obligation_is_future_credit),
          credit_status: isDebt ? null : computeBigBookCreditStatus(creditSettledAt),
          credit_settled_at: creditSettledAt,
          debt_status: isDebt ? computeBigBookDebtStatus(debtSettledAt) : null,
          debt_settled_at: debtSettledAt,
          closed_at: isDebt ? debtSettledAt : creditSettledAt,
          applied_amount: appliedAmount,
          open_balance: finiteNumberOrNull(row.obligation_open_balance)
        });
      }
    }

    const sample = rows.find((row) => row.role === "obligation") ?? null;
    const unconvertedCount = Number(sample?.obligation_unconverted_count ?? 0);
    const openBalance =
      !sample || unconvertedCount > 0 ? null : finiteNumberOrNull(sample.obligation_open_balance);
    const balance =
      isObligation && sample
        ? {
            face: Number(sample.obligation_face_amount),
            appliedKnown,
            unconvertedCount,
            openBalance,
            variance: openBalance == null ? null : Math.max(0, -openBalance)
          }
        : isObligation
          ? {
              face: Math.abs(entry.amount),
              appliedKnown: 0,
              unconvertedCount: 0,
              openBalance: Math.abs(entry.amount),
              variance: 0
            }
          : null;

    const linkedSet = (sample?.linked_set_ids ?? rows[0]?.linked_set_ids ?? [entry.id]).filter(Boolean);
    return {
      ...entry,
      settlements,
      settles,
      balance,
      credit_status: creditStatus,
      debt_status: debtStatus,
      linked_set: linkedSet.length ? linkedSet : [entry.id],
      linked_set_counts: { obligations: obligationIds.size, payments: paymentIds.size }
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
  const totalRows = pocketRows
    .filter((entry) => !entry.is_debt && !entry.is_future_credit)
    .flatMap((entry) => {
      const amount = amountCountedInLedgerTotals(entry);
      if (!Number.isFinite(amount) || amount === 0) return [];
      return [{ ...entry, amount }];
    });
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
  const parsed = await callRequiredRpc<LedgerPageRpcResult | null>(
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

  pageKeys = Array.isArray(parsed?.pageKeys) ? parsed.pageKeys : [];
  totalCount = typeof parsed?.totalCount === "number" ? parsed.totalCount : 0;
  totals = {
    pageTotals: Array.isArray(parsed?.totals?.pageTotals) ? parsed.totals.pageTotals : [],
    pageEntryCount: parsed?.totals?.pageEntryCount ?? 0,
    grandTotals: Array.isArray(parsed?.totals?.grandTotals) ? parsed.totals.grandTotals : [],
    grandEntryCount: parsed?.totals?.grandEntryCount ?? 0,
    pagePocketExcludedCount: parsed?.totals?.pagePocketExcludedCount ?? 0,
    grandPocketExcludedCount: parsed?.totals?.grandPocketExcludedCount ?? 0
  };
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
      updated_at: group.updated_at,
      updater_display_name: group.updated_by
        ? (actorMap.get(group.updated_by) ?? group.updated_by)
        : "-"
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

export async function getBigBookEntryAuditLogs(options?: {
  entryId?: string;
  limit?: number;
  offset?: number;
}): Promise<{ rows: BigBookEntryAuditLog[]; totalCount: number }> {
  const supabase = await createClient();
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200);
  const offset = Math.max(options?.offset ?? 0, 0);

  let countQuery = supabase
    .from("business_ledger_entry_audit_logs")
    .select("id", { count: "exact", head: true });
  let dataQuery = supabase
    .from("business_ledger_entry_audit_logs")
    .select("id, entry_id, action, changed_by, changed_at, old_row, new_row")
    .order("changed_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (options?.entryId) {
    countQuery = countQuery.eq("entry_id", options.entryId);
    dataQuery = dataQuery.eq("entry_id", options.entryId);
  }

  const [countResult, dataResult] = await Promise.all([countQuery, dataQuery]);
  if (countResult.error) throw countResult.error;
  if (dataResult.error) throw dataResult.error;

  const rawRows = dataResult.data ?? [];
  const actorIds = rawRows
    .map((row) => row.changed_by as string | null)
    .filter((id): id is string => Boolean(id));
  const actorMap = await resolveDisplayNameMap(supabase, actorIds);

  return {
    totalCount: countResult.count ?? 0,
    rows: rawRows.map((row) => ({
      id: row.id as string,
      entry_id: row.entry_id as string,
      action: row.action as BigBookEntryAuditLog["action"],
      changed_by: (row.changed_by as string | null) ?? null,
      changed_at: row.changed_at as string,
      old_row: (row.old_row as Record<string, unknown> | null) ?? null,
      new_row: (row.new_row as Record<string, unknown> | null) ?? null,
      changer_display_name: row.changed_by
        ? (actorMap.get(row.changed_by as string) ?? (row.changed_by as string))
        : "-"
    }))
  };
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
    is_future_credit: boolean | null;
    big_book_actors: { actor_code: "A" | "B"; display_name: string } | { actor_code: "A" | "B"; display_name: string }[] | null;
  }> = [];

  while (true) {
    const { data: batchData, error: batchError } = await supabase
      .from("business_ledger_entries")
      .select(
        `
        responsible_actor_id, entry_direction, currency_code, amount, is_debt, is_future_credit,
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
    if (row.is_debt || row.is_future_credit) continue;
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
    is_future_credit: boolean | null;
  }> = [];

  while (true) {
    const { data: batchData, error: batchError } = await supabase
      .from("business_ledger_entries")
      .select("pocket_id, entry_direction, amount, is_debt, is_future_credit")
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
    if (!row.pocket_id || row.is_debt || row.is_future_credit) continue;
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
  responsible_actor_id, entry_type_id, entry_direction, currency_code, amount, is_debt, is_future_credit,
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
  is_future_credit: boolean | null;
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
      if (row.is_debt || row.is_future_credit) continue;
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

export async function getBigBookTypeMonthlyCurrencySummary(
  typeId: string,
  year: number
): Promise<BigBookMonthlyCurrencyRow[]> {
  const supabase = await createClient();
  const data = await callRequiredRpc<Array<{
    month: number;
    currency_code: "IDR" | "MYR" | "USDT" | "TRX" | null;
    spending: number | string;
    profit: number | string;
    entry_count: number | string;
  }> | null>(supabase, "get_big_book_type_monthly_currency_summary", {
    p_type_id: typeId,
    p_year: year
  });

  const summary: BigBookMonthlyCurrencyRow[] = BIG_BOOK_MONTH_LABELS.map((monthLabel, index) => ({
    month_index: index,
    month_label: monthLabel,
    totals: { IDR: 0, MYR: 0, USDT: 0 }
  }));
  for (const row of data ?? []) {
    const monthIndex = Number(row.month) - 1;
    if (!summary[monthIndex] || !row.currency_code || row.currency_code === "TRX") continue;
    summary[monthIndex].totals[row.currency_code] += Number(row.profit) - Number(row.spending);
  }
  return summary;
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

type OutstandingFilters = {
  actorId?: string[];
  vendorId?: string[];
  vendorTypeId?: string[];
  currencyCode?: string[];
  dateFrom?: string;
  dateTo?: string;
};

function outstandingRpcArgs(filters?: OutstandingFilters) {
  return {
    p_actor_ids: toRpcArray(filters?.actorId),
    p_vendor_ids: toRpcArray(filters?.vendorId),
    p_vendor_type_ids: toRpcArray(filters?.vendorTypeId),
    p_currency_codes: toRpcArray(filters?.currencyCode),
    p_date_from: filters?.dateFrom || null,
    p_date_to: filters?.dateTo || null
  };
}

type CreditOutstandingRpcRow = {
  entry_type_id: string | null;
  type_name: string;
  actor_id: string;
  actor_code: "A" | "B";
  actor_display_name: string;
  currency: BigBookVendorActorOutstandingRow["currency"];
  outstanding: number | string;
  open_credit_count: number | string;
  open_future_credit_count?: number | string;
  unknown_balance_count: number | string;
};

function mapCreditOutstandingRow(
  row: CreditOutstandingRpcRow,
  futureOnly: boolean
): BigBookVendorActorOutstandingRow {
  const openCount = Number(row.open_credit_count);
  return {
    row_key: `type:${row.entry_type_id ?? "none"}:${row.actor_id}:${row.currency}`,
    vendor_id: null,
    vendor_name: "-",
    vendor_type_id: null,
    vendor_type_name: "-",
    entry_type_id: row.entry_type_id,
    type_name: row.type_name,
    actor_id: row.actor_id,
    actor_code: row.actor_code,
    actor_display_name: row.actor_display_name,
    currency: row.currency,
    outstanding: Number(row.outstanding),
    open_credit_count: openCount,
    open_future_credit_count: futureOnly ? openCount : Number(row.open_future_credit_count ?? 0),
    unknown_balance_count: Number(row.unknown_balance_count ?? 0)
  };
}

export async function getBigBookVendorActorOutstanding(
  filters?: OutstandingFilters
): Promise<BigBookVendorActorOutstandingRow[]> {
  const supabase = await createClient();
  const data = await callRequiredRpc<CreditOutstandingRpcRow[] | null>(
    supabase,
    "get_big_book_vendor_actor_outstanding",
    outstandingRpcArgs(filters)
  );
  return (data ?? []).map((row) => mapCreditOutstandingRow(row, false));
}

export async function getBigBookVendorActorFutureOutstanding(
  filters?: OutstandingFilters
): Promise<BigBookVendorActorOutstandingRow[]> {
  const supabase = await createClient();
  const data = await callRequiredRpc<CreditOutstandingRpcRow[] | null>(
    supabase,
    "get_big_book_vendor_actor_future_outstanding",
    outstandingRpcArgs(filters)
  );
  return (data ?? []).map((row) => mapCreditOutstandingRow(row, true));
}

export const BIG_BOOK_VENDOR_ACTOR_OUTSTANDING_ENTRIES_LIMIT = 500;

export async function getBigBookVendorActorOutstandingEntries(params: {
  /** Required for Credit and Future Credit detail rows (ledger Type + Actor + Currency buckets). */
  typeId?: string | null;
  actorId: string;
  currency: BigBookVendorActorOutstandingRow["currency"];
  dateFrom?: string;
  dateTo?: string;
  /** When true, only Future Credit. When false/omitted, only actualized Credit. */
  futureOnly?: boolean;
}): Promise<BigBookVendorActorOutstandingEntriesResult> {
  const supabase = await createClient();
  const limit = BIG_BOOK_VENDOR_ACTOR_OUTSTANDING_ENTRIES_LIMIT;
  const futureOnly = Boolean(params.futureOnly);

  let query = supabase
    .from("business_ledger_entries")
    .select(
      `
      id, entry_date, entry_direction, entry_type_id, explanation, amount, currency_code, remark, is_future_credit, updated_at,
      vendor_id,
      business_ledger_types(name),
      business_ledger_vendors(name)
    `,
      { count: "exact" }
    )
    .eq("is_credit", true)
    .eq("is_future_credit", futureOnly)
    .is("credit_settled_at", null)
    .eq("responsible_actor_id", params.actorId)
    .eq("currency_code", params.currency);

  query =
    params.typeId == null
      ? query.is("entry_type_id", null)
      : query.eq("entry_type_id", params.typeId);

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
    const vendor = Array.isArray(row.business_ledger_vendors)
      ? row.business_ledger_vendors[0]
      : row.business_ledger_vendors;
    return {
      id: row.id,
      entry_date: row.entry_date,
      entry_direction: row.entry_direction === "profit" ? "profit" : "spending",
      entry_type_id: row.entry_type_id ?? null,
      type_name: type?.name ?? "-",
      vendor_name: vendor?.name ?? "(No vendor)",
      explanation: row.explanation,
      amount: Math.abs(Number(row.amount)),
      currency_code: row.currency_code,
      remark: row.remark ?? null,
      is_future_credit: Boolean(row.is_future_credit),
      updated_at: row.updated_at
    };
  });

  return {
    rows,
    totalCount: typeof count === "number" ? count : rows.length
  };
}

export async function getBigBookVendorActorOutstandingDebt(
  filters?: OutstandingFilters
): Promise<BigBookVendorActorOutstandingDebtRow[]> {
  const supabase = await createClient();
  const data = await callRequiredRpc<VendorActorOutstandingDebtRpcRow[] | null>(
    supabase,
    "get_big_book_vendor_actor_outstanding_debt",
    outstandingRpcArgs(filters)
  );
  return toVendorActorOutstandingDebtRows(data ?? []);
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
      id, entry_date, entry_direction, entry_type_id, explanation, amount, currency_code, remark, updated_at,
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
      remark: row.remark ?? null,
      is_future_credit: false,
      updated_at: row.updated_at
    };
  });

  return {
    rows,
    totalCount: typeof count === "number" ? count : rows.length
  };
}
