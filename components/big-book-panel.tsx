"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type {
  BigBookActionBy,
  BigBookActor,
  BigBookActorCurrencyMetrics,
  BigBookActorPocket,
  BigBookActorPocketMetrics,
  BigBookCreditStatus,
  BigBookEntry,
  BigBookEntryGroup,
  BigBookLedgerRow,
  BigBookLedgerSubType,
  BigBookLedgerType,
  BigBookSettlementTargetRef,
  BigBookVendor,
  BigBookVendorActorOutstandingRow,
  BigBookVendorType
} from "@/lib/types";
import { handleUnauthorizedResponse, secureFetch } from "@/lib/client/auth-fetch";
import {
  createEmptyEntryForm,
  formatAmountInput,
  formatRateInput,
  parseAmountInput,
  type EntryFormState
} from "@/components/big-book-entry-fields";
import { BigBookCurrencyTotals } from "@/components/big-book-currency-totals";
import {
  BigBookMetricsSection,
  type BigBookMetricsBundle
} from "@/components/big-book-metrics-cards";
import { BigBookGroupHeaderRow } from "@/components/big-book-group-row";
import { BigBookEntryRow } from "@/components/big-book-entry-row";

// Heavy form UI only needed when a create/edit/settlement modal opens.
const BigBookEntryFields = dynamic(
  () => import("@/components/big-book-entry-fields").then((mod) => mod.BigBookEntryFields),
  { ssr: false, loading: () => <p className="text-sm text-muted">Loading form…</p> }
);
import type { BigBookLedgerTotals } from "@/lib/db/queries";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { BlockingOverlay } from "@/components/ui/blocking-overlay";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { Modal } from "@/components/ui/modal";
import { formatAmount, formatDateDisplay } from "@/lib/display-format";
import { useTablePagination } from "@/lib/table-pagination";
import { TablePaginationBar } from "@/components/ui/table-pagination-bar";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { buildBigBookImportTemplateCsv } from "@/lib/big-book/csv";
import type { BigBookLedgerSortDir, BigBookLedgerSortKey } from "@/lib/big-book/ledger-display-keys";
import {
  describeGroupedMissingFields,
  describeMissingFields,
  missingEntryFields
} from "@/lib/big-book/entry-form-validation";
import { rowStripeClass } from "@/lib/ui/table";
import { useColumnWidths } from "@/lib/ui/use-column-widths";
import { TableEmptyState } from "@/components/ui/table-empty-state";

type Props = {
  initialTypes: BigBookLedgerType[];
  initialSubTypes: BigBookLedgerSubType[];
  initialVendorTypes: BigBookVendorType[];
  initialVendors: BigBookVendor[];
  initialActionBy: BigBookActionBy[];
  initialPockets: BigBookActorPocket[];
  initialActors: BigBookActor[];
  initialLedgerRows: BigBookLedgerRow[];
  initialTotalCount: number;
  initialTotals: BigBookLedgerTotals;
  /** Streams independently of the ledger so the table can paint first. */
  metricsPromise: Promise<BigBookMetricsBundle>;
  /** Optional SSR seed (tests / credit port); when omitted, Suspense streams metrics. */
  initialActorMetrics?: BigBookActorCurrencyMetrics[];
  initialActorPocketMetrics?: BigBookActorPocketMetrics[];
  initialVendorActorOutstanding?: BigBookVendorActorOutstandingRow[];
};

type ApiErrorShape = {
  formErrors?: unknown;
  fieldErrors?: Record<string, unknown>;
};

type CreateEntryMode = "create" | "create_another";

type GroupEntryFormState = EntryFormState & { id?: string };

function extractApiError(error: unknown, fallback: string) {
  if (typeof error === "string" && error.trim().length > 0) return error;
  if (error && typeof error === "object") {
    const maybeZod = error as ApiErrorShape;
    if (Array.isArray(maybeZod.formErrors)) {
      const formError = maybeZod.formErrors.find((item) => typeof item === "string" && item.trim().length > 0);
      if (typeof formError === "string") return formError;
    }
    if (maybeZod.fieldErrors && typeof maybeZod.fieldErrors === "object") {
      for (const value of Object.values(maybeZod.fieldErrors)) {
        if (Array.isArray(value)) {
          const fieldError = value.find((item) => typeof item === "string" && item.trim().length > 0);
          if (typeof fieldError === "string") return fieldError;
        }
      }
    }
  }
  return fallback;
}

function arraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

const SUPPORTED_CURRENCIES: Array<"IDR" | "MYR" | "USDT" | "TRX"> = ["IDR", "MYR", "USDT", "TRX"];

const LEDGER_SKELETON_ROW_COUNT = 6;
const LEDGER_COLUMN_COUNT = 16;
const LEDGER_COLUMN_WIDTH_DEFAULTS: Record<string, number> = {
  select: 44,
  entry_date: 110,
  entry_direction: 90,
  type_name: 130,
  sub_type_name: 120,
  vendor_type_name: 120,
  vendor_name: 140,
  actor_display_name: 110,
  action_by_name: 120,
  explanation: 220,
  amount: 150,
  credit: 160,
  pocket_name: 120,
  remark: 180,
  attachments: 140,
  actions: 100
};
const LEDGER_COLUMN_KEYS = Object.keys(LEDGER_COLUMN_WIDTH_DEFAULTS);
// Group header rows mirror the ledger layout so their totals land in the Amount
// column: select cell, one wide label cell, amount, filler, then actions.
const LEDGER_AMOUNT_COLUMN_INDEX = LEDGER_COLUMN_KEYS.indexOf("amount");
const GROUP_ROW_LABEL_COLSPAN = LEDGER_AMOUNT_COLUMN_INDEX - 1;
const GROUP_ROW_TRAILING_COLSPAN = LEDGER_COLUMN_COUNT - LEDGER_AMOUNT_COLUMN_INDEX - 2;
const DESC_DEFAULT_SORT_KEYS = new Set<BigBookLedgerSortKey>(["entry_date", "amount"]);
const EMPTY_LEDGER_TOTALS: BigBookLedgerTotals = {
  pageTotals: [],
  pageEntryCount: 0,
  grandTotals: [],
  grandEntryCount: 0,
  pagePocketExcludedCount: 0,
  grandPocketExcludedCount: 0
};

function pocketExcludedLabel(count: number) {
  if (count < 1) return null;
  return ` · ${count} pocket transaction${count === 1 ? "" : "s"} excluded from totals`;
}
const GROUP_MENU_PREFIX = "group:";

const CREDIT_FLAG_OPTIONS = [
  { value: "credit", label: "Credit" },
  { value: "settlement", label: "Settlement" },
  { value: "none", label: "Not credit-related" }
];

const CREDIT_STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "settled", label: "Settled" }
];

const CREDIT_STATUS_LABELS: Record<BigBookCreditStatus, string> = {
  open: "Open",
  settled: "Settled"
};

// Credit fields never travel with grouped entries (the API rejects them there),
// so this only runs for the single-entry create/edit payloads.
function toCreditPayload(form: EntryFormState, settlesEntry: BigBookSettlementTargetRef | null) {
  const settlesEntryId = form.settles_entry_id || null;
  if (!settlesEntryId) {
    return {
      is_credit: form.is_credit,
      settles_entry_id: null,
      settlement_conversion_rate: null,
      settlement_note: "",
      close_credit: false,
      credit_settlement_note: null
    };
  }
  const typedRate = Number(form.settlement_conversion_rate);
  const sameCurrency = settlesEntry ? form.currency_code === settlesEntry.currency_code : false;
  const rate = sameCurrency ? 1 : Number.isFinite(typedRate) && typedRate > 0 ? typedRate : null;
  return {
    is_credit: false,
    settles_entry_id: settlesEntryId,
    settlement_conversion_rate: rate,
    settlement_note: form.settlement_note,
    close_credit: form.close_credit,
    credit_settlement_note: form.close_credit ? form.credit_settlement_note.trim() || null : null
  };
}

function settlementTargetFromEntry(entry: BigBookEntry): BigBookSettlementTargetRef {
  return {
    id: entry.id,
    entry_date: entry.entry_date,
    explanation: entry.explanation,
    amount: entry.amount,
    currency_code: entry.currency_code,
    vendor_name: entry.vendor_name,
    credit_status: entry.credit_status ?? "open",
    credit_settled_at: entry.credit_settled_at
  };
}

function toEntryPayload(form: EntryFormState) {
  return {
    entry_date: form.entry_date,
    entry_direction: form.entry_direction,
    entry_type_id: form.entry_type_id,
    entry_sub_type_id: form.entry_sub_type_id || null,
    vendor_type_id: form.vendor_type_id || null,
    vendor_id: form.vendor_id || null,
    pocket_id: form.pocket_id || null,
    action_by_id: form.action_by_id || null,
    explanation: form.explanation.trim(),
    amount: Number(parseAmountInput(form.amount)),
    currency_code: form.currency_code,
    remark: form.remark,
    responsible_actor_id: form.responsible_actor_id
  };
}

function entryFormFromEntry(entry: BigBookEntry): GroupEntryFormState {
  return {
    id: entry.id,
    entry_date: entry.entry_date,
    entry_direction: entry.entry_direction,
    entry_type_id: entry.entry_type_id,
    entry_sub_type_id: entry.entry_sub_type_id ?? "",
    vendor_type_id: entry.vendor_type_id ?? "",
    vendor_id: entry.vendor_id ?? "",
    pocket_id: entry.pocket_id ?? "",
    action_by_id: entry.action_by_id ?? "",
    explanation: entry.explanation,
    amount: formatAmountInput(String(entry.amount)),
    currency_code: entry.currency_code,
    remark: entry.remark ?? "",
    responsible_actor_id: entry.responsible_actor_id,
    is_credit: entry.is_credit,
    settles_entry_id: entry.settles_entry_id ?? "",
    settlement_conversion_rate:
      entry.settlement_conversion_rate != null ? formatRateInput(String(entry.settlement_conversion_rate)) : "",
    settlement_note: entry.settlement_note ?? "",
    close_credit: false,
    credit_settlement_note: ""
  };
}

function isEntryFormComplete(form: EntryFormState) {
  const amountValue = Number(parseAmountInput(form.amount));
  return Boolean(form.explanation.trim()) && Number.isFinite(amountValue) && amountValue > 0;
}

function summarizeGroupEntryForm(form: EntryFormState, types: BigBookLedgerType[]) {
  const typeName = types.find((row) => row.id === form.entry_type_id)?.name ?? "Type";
  const explanation = form.explanation.trim() || "No explanation yet";
  const amountPart = form.amount.trim()
    ? `${form.amount} ${form.currency_code}`
    : `— ${form.currency_code}`;
  return `${form.entry_date || "—"} · ${typeName} · ${explanation} · ${amountPart}`;
}

function toggleExpandedIndex(prev: Set<number>, index: number) {
  const next = new Set(prev);
  if (next.has(index)) next.delete(index);
  else next.add(index);
  return next;
}

export function BigBookPanel({
  initialTypes,
  initialSubTypes,
  initialVendorTypes,
  initialVendors,
  initialActionBy,
  initialPockets,
  initialActors,
  initialLedgerRows,
  initialTotalCount,
  initialTotals,
  metricsPromise,
  initialActorMetrics,
  initialActorPocketMetrics,
  initialVendorActorOutstanding
}: Props) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [currencyFilter, setCurrencyFilter] = useState<string[]>([]);
  const [actorFilter, setActorFilter] = useState<string[]>([]);
  const [directionFilter, setDirectionFilter] = useState<string[]>([]);
  const [vendorTypeFilter, setVendorTypeFilter] = useState<string[]>([]);
  const [vendorFilter, setVendorFilter] = useState<string[]>([]);
  const [pocketFilter, setPocketFilter] = useState<string[]>([]);
  const [actionByFilter, setActionByFilter] = useState<string[]>([]);
  const [creditFlagFilter, setCreditFlagFilter] = useState<string[]>([]);
  const [creditStatusFilter, setCreditStatusFilter] = useState<string[]>([]);
  // Draft filter state: drives the inputs. Filters only run after "Apply Filters".
  const [draftQuery, setDraftQuery] = useState("");
  const [draftDateFrom, setDraftDateFrom] = useState("");
  const [draftDateTo, setDraftDateTo] = useState("");
  const [draftTypeFilter, setDraftTypeFilter] = useState<string[]>([]);
  const [draftCurrencyFilter, setDraftCurrencyFilter] = useState<string[]>([]);
  const [draftActorFilter, setDraftActorFilter] = useState<string[]>([]);
  const [draftDirectionFilter, setDraftDirectionFilter] = useState<string[]>([]);
  const [draftVendorTypeFilter, setDraftVendorTypeFilter] = useState<string[]>([]);
  const [draftVendorFilter, setDraftVendorFilter] = useState<string[]>([]);
  const [draftPocketFilter, setDraftPocketFilter] = useState<string[]>([]);
  const [draftActionByFilter, setDraftActionByFilter] = useState<string[]>([]);
  const [draftCreditFlagFilter, setDraftCreditFlagFilter] = useState<string[]>([]);
  const [draftCreditStatusFilter, setDraftCreditStatusFilter] = useState<string[]>([]);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [sortBy, setSortBy] = useState<BigBookLedgerSortKey>("entry_date");
  const [sortDir, setSortDir] = useState<BigBookLedgerSortDir>("desc");
  const {
    widths: columnWidths,
    totalWidth: ledgerTableWidth,
    resetWidths: resetColumnWidths,
    getResizeHandleProps
  } = useColumnWidths({
    storageKey: "big-book-ledger-column-widths",
    defaults: LEDGER_COLUMN_WIDTH_DEFAULTS,
    schemaVersion: 1,
    minWidth: 60
  });
  const [openActionMenu, setOpenActionMenu] = useState<{
    id: string;
    top: number;
    left: number;
  } | null>(null);
  const actionMenuRef = useRef<HTMLDivElement | null>(null);
  const [entrySubmitting, setEntrySubmitting] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [pendingEntryConfirm, setPendingEntryConfirm] = useState(false);
  const [createEntryMode, setCreateEntryMode] = useState<CreateEntryMode>("create");
  const [createMode, setCreateMode] = useState<"single" | "group">("single");
  const [createAttachmentFiles, setCreateAttachmentFiles] = useState<File[]>([]);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [pendingEditConfirm, setPendingEditConfirm] = useState(false);
  const [editForm, setEditForm] = useState<EntryFormState>({
    entry_date: "",
    entry_direction: "spending",
    entry_type_id: "",
    entry_sub_type_id: "",
    vendor_type_id: "",
    vendor_id: "",
    pocket_id: "",
    action_by_id: "",
    explanation: "",
    amount: "",
    currency_code: "IDR",
    remark: "",
    responsible_actor_id: "",
    is_credit: false,
    settles_entry_id: "",
    settlement_conversion_rate: "",
    settlement_note: "",
    close_credit: false,
    credit_settlement_note: ""
  });
  const [editSettlesEntry, setEditSettlesEntry] = useState<BigBookSettlementTargetRef | null>(null);
  const [pendingDeleteEntry, setPendingDeleteEntry] = useState<BigBookEntry | null>(null);
  const [entryDeleting, setEntryDeleting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importSubmitting, setImportSubmitting] = useState(false);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importSuccessCount, setImportSuccessCount] = useState<number | null>(null);
  const [exportSubmitting, setExportSubmitting] = useState(false);
  const [manageAttachmentsEntry, setManageAttachmentsEntry] = useState<BigBookEntry | null>(null);
  const [manageAttachmentFiles, setManageAttachmentFiles] = useState<File[]>([]);
  const [pendingUploadEntryId, setPendingUploadEntryId] = useState<string | null>(null);
  const [uploadSubmitting, setUploadSubmitting] = useState(false);
  const [attachmentViewingId, setAttachmentViewingId] = useState<string | null>(null);
  const [pendingDeleteAttachmentId, setPendingDeleteAttachmentId] = useState<string | null>(null);
  const [attachmentDeleting, setAttachmentDeleting] = useState(false);
  const [viewingRemark, setViewingRemark] = useState<{ entryId: string; text: string } | null>(null);
  // Current server-paged rows. Re-fetched whenever filters / page / pageSize change
  // or after a mutation. Not filtered client-side. A row is either a standalone
  // entry or a group carrying its member entries.
  const [ledgerRows, setLedgerRows] = useState<BigBookLedgerRow[]>(initialLedgerRows);
  const [totalCount, setTotalCount] = useState<number>(initialTotalCount);
  const [totals, setTotals] = useState<BigBookLedgerTotals>(initialTotals);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(() => new Set());
  const [groupSubmitting, setGroupSubmitting] = useState(false);
  const [pendingDeleteGroup, setPendingDeleteGroup] = useState<{
    group: BigBookEntryGroup;
    entries: BigBookEntry[];
  } | null>(null);
  const [pendingUngroup, setPendingUngroup] = useState<BigBookEntryGroup | null>(null);
  // Ids of standalone rows ticked for grouping. Only ungrouped entries are
  // selectable, so grouping never has to move a row out of an existing group.
  const [selectedEntryIds, setSelectedEntryIds] = useState<Set<string>>(() => new Set());
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignLabel, setAssignLabel] = useState("");
  const [assignRemark, setAssignRemark] = useState("");
  const [settlementTarget, setSettlementTarget] = useState<BigBookEntry | null>(null);
  const [settlementForm, setSettlementForm] = useState<EntryFormState | null>(null);
  const [settlementAttachmentFiles, setSettlementAttachmentFiles] = useState<File[]>([]);
  const [settlementSubmitting, setSettlementSubmitting] = useState(false);
  const [pendingSettlementConfirm, setPendingSettlementConfirm] = useState(false);
  const [fetchingConversionRate, setFetchingConversionRate] = useState(false);
  // Kept as an id so the open history modal re-reads the freshly loaded entry
  // after a settlement is added or deleted.
  const [settlementHistoryEntryId, setSettlementHistoryEntryId] = useState<string | null>(null);
  const [pendingDeleteSettlementId, setPendingDeleteSettlementId] = useState<string | null>(null);
  const [settlementDeleting, setSettlementDeleting] = useState(false);
  const [creditClosureDialog, setCreditClosureDialog] = useState<{
    entry: BigBookEntry;
    settled: boolean;
  } | null>(null);
  const [creditClosureNote, setCreditClosureNote] = useState("");
  const [creditClosureSubmitting, setCreditClosureSubmitting] = useState(false);

  const activeTypes = useMemo(() => initialTypes.filter((item) => item.is_active), [initialTypes]);
  const currencies = SUPPORTED_CURRENCIES;
  const typeOptions = useMemo(
    () => initialTypes.map((type) => ({ value: type.id, label: type.name })),
    [initialTypes]
  );
  const currencyOptions = useMemo(
    () => SUPPORTED_CURRENCIES.map((currency) => ({ value: currency, label: currency })),
    []
  );
  const actorOptions = useMemo(
    () => initialActors.map((actor) => ({ value: actor.id, label: actor.display_name })),
    [initialActors]
  );
  const directionOptions = useMemo(
    () => [
      { value: "spending", label: "Out" },
      { value: "profit", label: "In" }
    ],
    []
  );
  const vendorTypeOptions = useMemo(
    () => initialVendorTypes.map((vendorType) => ({ value: vendorType.id, label: vendorType.name })),
    [initialVendorTypes]
  );
  const vendorOptions = useMemo(() => {
    const scoped =
      draftVendorTypeFilter.length > 0
        ? initialVendors.filter((vendor) => draftVendorTypeFilter.includes(vendor.vendor_type_id))
        : initialVendors;
    return scoped.map((vendor) => ({ value: vendor.id, label: vendor.name }));
  }, [initialVendors, draftVendorTypeFilter]);
  const pocketOptions = useMemo(() => {
    const scoped =
      draftActorFilter.length > 0
        ? initialPockets.filter((pocket) => draftActorFilter.includes(pocket.actor_id))
        : initialPockets;
    return scoped.map((pocket) => {
      const actor = initialActors.find((row) => row.id === pocket.actor_id);
      const label = actor ? `${pocket.name} (${actor.display_name})` : pocket.name;
      return { value: pocket.id, label };
    });
  }, [initialPockets, draftActorFilter, initialActors]);
  const actionByOptions = useMemo(
    () => initialActionBy.map((actionBy) => ({ value: actionBy.id, label: actionBy.name })),
    [initialActionBy]
  );
  const today = new Date().toISOString().slice(0, 10);

  const [entryForm, setEntryForm] = useState<EntryFormState>({
    entry_date: today,
    entry_direction: "spending",
    entry_type_id: activeTypes[0]?.id ?? initialTypes[0]?.id ?? "",
    entry_sub_type_id: "",
    vendor_type_id: "",
    vendor_id: "",
    pocket_id: "",
    action_by_id: "",
    explanation: "",
    amount: "",
    currency_code: "IDR",
    remark: "",
    responsible_actor_id: initialActors[0]?.id ?? "",
    is_credit: false,
    settles_entry_id: "",
    settlement_conversion_rate: "",
    settlement_note: "",
    close_credit: false,
    credit_settlement_note: ""
  });

  const defaultTypeId = activeTypes[0]?.id ?? initialTypes[0]?.id ?? "";
  const defaultActorId = initialActors[0]?.id ?? "";
  const newEntryForm = useCallback(
    () => createEmptyEntryForm({ today, defaultTypeId, defaultActorId }),
    [today, defaultTypeId, defaultActorId]
  );

  const [groupLabel, setGroupLabel] = useState("");
  const [groupRemark, setGroupRemark] = useState("");
  const [groupEntryForms, setGroupEntryForms] = useState<EntryFormState[]>(() => [
    createEmptyEntryForm({ today, defaultTypeId, defaultActorId }),
    createEmptyEntryForm({ today, defaultTypeId, defaultActorId })
  ]);
  // Which transaction cards are expanded in create/edit grouped mode.
  const [expandedCreateTxnIndexes, setExpandedCreateTxnIndexes] = useState<Set<number>>(
    () => new Set([0])
  );
  const [expandedEditTxnIndexes, setExpandedEditTxnIndexes] = useState<Set<number>>(
    () => new Set([0])
  );
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editGroupLabel, setEditGroupLabel] = useState("");
  const [editGroupRemark, setEditGroupRemark] = useState("");
  const [editGroupForms, setEditGroupForms] = useState<GroupEntryFormState[]>([]);

  const ledgerPagination = useTablePagination(totalCount);

  useEffect(() => {
    ledgerPagination.setPage(0);
  }, [query, dateFrom, dateTo, typeFilter, currencyFilter, actorFilter, directionFilter, vendorTypeFilter, vendorFilter, pocketFilter, actionByFilter, creditFlagFilter, creditStatusFilter, sortBy, sortDir]); // eslint-disable-line react-hooks/exhaustive-deps

  // Race-safe request token: ignore stale fetch responses.
  const loadRequestIdRef = useRef(0);
  // Skip the initial fetch on mount when SSR already provided the first page.
  // If SSR reports a positive count but no rows, force a client fetch to heal
  // the "empty table on first load" mismatch.
  const skipNextLoadRef = useRef(!(initialLedgerRows.length === 0 && initialTotalCount > 0));

  const loadEntries = useCallback(async (opts?: { includeMetrics?: boolean }) => {
    const requestId = ++loadRequestIdRef.current;
    setEntriesLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("view", "rows");
      params.set("page", String(ledgerPagination.page));
      params.set("pageSize", String(ledgerPagination.pageSize));
      params.set("sortBy", sortBy);
      params.set("sortDir", sortDir);
      if (opts?.includeMetrics) params.set("includeMetrics", "1");
      if (query) params.set("query", query);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      for (const typeId of typeFilter) params.append("typeId", typeId);
      for (const currencyCode of currencyFilter) params.append("currencyCode", currencyCode);
      for (const actorId of actorFilter) params.append("actorId", actorId);
      for (const direction of directionFilter) params.append("direction", direction);
      for (const vendorTypeId of vendorTypeFilter) params.append("vendorTypeId", vendorTypeId);
      for (const vendorId of vendorFilter) params.append("vendorId", vendorId);
      for (const pocketId of pocketFilter) params.append("pocketId", pocketId);
      for (const actionById of actionByFilter) params.append("actionById", actionById);
      for (const creditFlag of creditFlagFilter) params.append("creditFlag", creditFlag);
      for (const creditStatus of creditStatusFilter) params.append("creditStatus", creditStatus);

      const response = await fetch(`/api/big-book/entries?${params.toString()}`);
      if (handleUnauthorizedResponse(response)) return;
      const data = await response.json();
      if (loadRequestIdRef.current !== requestId) return; // a newer request superseded us
      if (!response.ok) {
        setError(extractApiError(data?.error, "Failed to load ledger entries."));
        return;
      }
      const nextRows: BigBookLedgerRow[] = Array.isArray(data?.rows) ? data.rows : [];
      setLedgerRows(nextRows);
      setTotalCount(typeof data?.totalCount === "number" ? data.totalCount : 0);
      setTotals(data?.totals ?? EMPTY_LEDGER_TOTALS);
      if (
        Array.isArray(data?.actorMetrics) ||
        Array.isArray(data?.actorPocketMetrics) ||
        Array.isArray(data?.vendorActorOutstanding)
      ) {
        setMetricsOverride((prev) => ({
          actorMetrics: Array.isArray(data?.actorMetrics)
            ? data.actorMetrics
            : (prev?.actorMetrics ?? []),
          actorPocketMetrics: Array.isArray(data?.actorPocketMetrics)
            ? data.actorPocketMetrics
            : (prev?.actorPocketMetrics ?? []),
          vendorActorOutstanding: Array.isArray(data?.vendorActorOutstanding)
            ? data.vendorActorOutstanding
            : (prev?.vendorActorOutstanding ?? [])
        }));
      }
      // Drop ticked ids that are no longer on screen, so grouping can never act
      // on a row the user cannot currently see.
      const visibleIds = new Set(
        nextRows.filter((row) => row.kind === "entry").map((row) => row.entry.id)
      );
      setSelectedEntryIds((prev) => new Set([...prev].filter((id) => visibleIds.has(id))));
    } catch {
      if (loadRequestIdRef.current !== requestId) return;
      setError("Failed to load ledger entries due to a network error.");
    } finally {
      if (loadRequestIdRef.current === requestId) {
        setEntriesLoading(false);
      }
    }
  }, [
    ledgerPagination.page,
    ledgerPagination.pageSize,
    query,
    dateFrom,
    dateTo,
    typeFilter,
    currencyFilter,
    actorFilter,
    directionFilter,
    vendorTypeFilter,
    vendorFilter,
    pocketFilter,
    actionByFilter,
    creditFlagFilter,
    creditStatusFilter,
    sortBy,
    sortDir
  ]);

  useEffect(() => {
    if (skipNextLoadRef.current) {
      skipNextLoadRef.current = false;
      return;
    }
    void loadEntries();
  }, [loadEntries]);

  const filtersDirty =
    draftQuery !== query ||
    draftDateFrom !== dateFrom ||
    draftDateTo !== dateTo ||
    !arraysEqual(draftTypeFilter, typeFilter) ||
    !arraysEqual(draftCurrencyFilter, currencyFilter) ||
    !arraysEqual(draftActorFilter, actorFilter) ||
    !arraysEqual(draftDirectionFilter, directionFilter) ||
    !arraysEqual(draftVendorTypeFilter, vendorTypeFilter) ||
    !arraysEqual(draftVendorFilter, vendorFilter) ||
    !arraysEqual(draftPocketFilter, pocketFilter) ||
    !arraysEqual(draftActionByFilter, actionByFilter) ||
    !arraysEqual(draftCreditFlagFilter, creditFlagFilter) ||
    !arraysEqual(draftCreditStatusFilter, creditStatusFilter);

  const filtersActive =
    Boolean(query) ||
    Boolean(dateFrom) ||
    Boolean(dateTo) ||
    Boolean(typeFilter.length) ||
    Boolean(currencyFilter.length) ||
    Boolean(actorFilter.length) ||
    Boolean(directionFilter.length) ||
    Boolean(vendorTypeFilter.length) ||
    Boolean(vendorFilter.length) ||
    Boolean(pocketFilter.length) ||
    Boolean(actionByFilter.length) ||
    Boolean(creditFlagFilter.length) ||
    Boolean(creditStatusFilter.length);

  const draftFiltersActive =
    Boolean(draftQuery) ||
    Boolean(draftDateFrom) ||
    Boolean(draftDateTo) ||
    Boolean(draftTypeFilter.length) ||
    Boolean(draftCurrencyFilter.length) ||
    Boolean(draftActorFilter.length) ||
    Boolean(draftDirectionFilter.length) ||
    Boolean(draftVendorTypeFilter.length) ||
    Boolean(draftVendorFilter.length) ||
    Boolean(draftPocketFilter.length) ||
    Boolean(draftActionByFilter.length) ||
    Boolean(draftCreditFlagFilter.length) ||
    Boolean(draftCreditStatusFilter.length);

  function applyFilters() {
    setQuery(draftQuery);
    setDateFrom(draftDateFrom);
    setDateTo(draftDateTo);
    setTypeFilter(draftTypeFilter);
    setCurrencyFilter(draftCurrencyFilter);
    setActorFilter(draftActorFilter);
    setDirectionFilter(draftDirectionFilter);
    setVendorTypeFilter(draftVendorTypeFilter);
    setVendorFilter(draftVendorFilter);
    setPocketFilter(draftPocketFilter);
    setActionByFilter(draftActionByFilter);
    setCreditFlagFilter(draftCreditFlagFilter);
    setCreditStatusFilter(draftCreditStatusFilter);
  }

  function resetFilters() {
    setDraftQuery("");
    setDraftDateFrom("");
    setDraftDateTo("");
    setDraftTypeFilter([]);
    setDraftCurrencyFilter([]);
    setDraftActorFilter([]);
    setDraftDirectionFilter([]);
    setDraftVendorTypeFilter([]);
    setDraftVendorFilter([]);
    setDraftPocketFilter([]);
    setDraftActionByFilter([]);
    setDraftCreditFlagFilter([]);
    setDraftCreditStatusFilter([]);
    setQuery("");
    setDateFrom("");
    setDateTo("");
    setTypeFilter([]);
    setCurrencyFilter([]);
    setActorFilter([]);
    setDirectionFilter([]);
    setVendorTypeFilter([]);
    setVendorFilter([]);
    setPocketFilter([]);
    setActionByFilter([]);
    setCreditFlagFilter([]);
    setCreditStatusFilter([]);
    setAdvancedOpen(false);
  }

  function toggleSort(nextKey: BigBookLedgerSortKey) {
    if (sortBy === nextKey) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortBy(nextKey);
    setSortDir(DESC_DEFAULT_SORT_KEYS.has(nextKey) ? "desc" : "asc");
  }

  function sortMarker(key: BigBookLedgerSortKey) {
    if (sortBy !== key) return "";
    return sortDir === "asc" ? " ↑" : " ↓";
  }

  function ariaSortFor(key: BigBookLedgerSortKey): "ascending" | "descending" | "none" {
    if (sortBy !== key) return "none";
    return sortDir === "asc" ? "ascending" : "descending";
  }

  const advancedDraftCount =
    (draftCurrencyFilter.length ? 1 : 0) +
    (draftActorFilter.length ? 1 : 0) +
    (draftDirectionFilter.length ? 1 : 0) +
    (draftVendorTypeFilter.length ? 1 : 0) +
    (draftVendorFilter.length ? 1 : 0) +
    (draftPocketFilter.length ? 1 : 0) +
    (draftActionByFilter.length ? 1 : 0) +
    (draftCreditFlagFilter.length ? 1 : 0) +
    (draftCreditStatusFilter.length ? 1 : 0);

  // Totals reflect ALL ledger rows in the database (computed server-side in
  // `getBigBookActorCurrencyMetrics`), not just the currently rendered page.
  // `null` means "still streaming from metricsPromise via Suspense"; after the
  // first mutation refresh we hold an override so cards update in place.
  const [metricsOverride, setMetricsOverride] = useState<BigBookMetricsBundle | null>(() => {
    if (!initialActorMetrics && !initialActorPocketMetrics && !initialVendorActorOutstanding) {
      return null;
    }
    return {
      actorMetrics: initialActorMetrics ?? [],
      actorPocketMetrics: initialActorPocketMetrics ?? [],
      vendorActorOutstanding: initialVendorActorOutstanding ?? []
    };
  });

  const applyMetricDelta = useCallback(
    (
      actorId: string,
      actorDisplayName: string,
      currency: "IDR" | "MYR" | "USDT" | "TRX",
      delta: number,
      pocketId: string | null
    ) => {
      // Pocket-tagged entries never move the actor's currency totals; they are
      // excluded server-side too, so applying a delta here would only show a
      // wrong number until the refresh lands.
      if (pocketId) return;
      setMetricsOverride((prev) => {
        const base = prev ?? {
          actorMetrics: [],
          actorPocketMetrics: [],
          vendorActorOutstanding: []
        };
        const next = base.actorMetrics.map((row) => ({ ...row, totals: { ...row.totals } }));
        const existing = next.find((row) => row.actor_id === actorId);
        if (existing) {
          existing.totals[currency] += delta;
        } else {
          const actorMeta = initialActors.find((actor) => actor.id === actorId);
          const inserted: BigBookActorCurrencyMetrics = {
            actor_id: actorId,
            actor_code: (actorMeta?.actor_code ?? "A") as "A" | "B",
            actor_display_name: actorMeta?.display_name ?? actorDisplayName,
            totals: { IDR: 0, MYR: 0, USDT: 0, TRX: 0 }
          };
          inserted.totals[currency] = delta;
          next.push(inserted);
          next.sort((a, b) => a.actor_code.localeCompare(b.actor_code));
        }
        return { ...base, actorMetrics: next };
      });
    },
    [initialActors]
  );

  const findEntryById = useCallback(
    (entryId: string): BigBookEntry | null => {
      for (const row of ledgerRows) {
        if (row.kind === "entry") {
          if (row.entry.id === entryId) return row.entry;
          continue;
        }
        const member = row.entries.find((item) => item.id === entryId);
        if (member) return member;
      }
      return null;
    },
    [ledgerRows]
  );

  function toggleGroupExpanded(groupId: string) {
    setExpandedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }

  const selectableEntryIds = useMemo(
    () => ledgerRows.filter((row) => row.kind === "entry").map((row) => row.entry.id),
    [ledgerRows]
  );

  const standaloneEntryStripeIndex = useMemo(() => {
    const indexById = new Map<string, number>();
    let stripeIndex = 0;
    for (const row of ledgerRows) {
      if (row.kind !== "entry") continue;
      indexById.set(row.entry.id, stripeIndex);
      stripeIndex += 1;
    }
    return indexById;
  }, [ledgerRows]);


  const selectedCount = selectedEntryIds.size;
  const allSelectableSelected =
    selectableEntryIds.length > 0 && selectableEntryIds.every((id) => selectedEntryIds.has(id));

  const onViewRemark = useCallback((entryId: string, text: string) => {
    setViewingRemark({ entryId, text });
  }, []);

  const onViewAttachment = useCallback(
    (attachmentId: string) => {
      void viewAttachment(attachmentId);
    },
    // viewAttachment closes over setState only; keep stable for memoized rows.
    []
  );

  const onToggleActionMenu = useCallback((entryId: string, triggerEl: HTMLButtonElement) => {
    toggleActionMenu(entryId, triggerEl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleEntrySelected = useCallback((entryId: string) => {
    setSelectedEntryIds((prev) => {
      const next = new Set(prev);
      if (next.has(entryId)) {
        next.delete(entryId);
      } else {
        next.add(entryId);
      }
      return next;
    });
  }, []);

  function toggleSelectAllOnPage() {
    setSelectedEntryIds((prev) => {
      if (selectableEntryIds.every((id) => prev.has(id))) {
        const next = new Set(prev);
        for (const id of selectableEntryIds) next.delete(id);
        return next;
      }
      const next = new Set(prev);
      for (const id of selectableEntryIds) next.add(id);
      return next;
    });
  }

  async function groupSelectedEntries() {
    if (selectedEntryIds.size < 2) {
      setError("Select at least 2 transactions to group.");
      return;
    }
    if (assignLabel.trim().length < 2) {
      setError("Group name must be at least 2 characters.");
      return;
    }

    setGroupSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await secureFetch("/api/big-book/groups/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: assignLabel.trim(),
          remark: assignRemark,
          entry_ids: [...selectedEntryIds]
        })
      });
      if (handleUnauthorizedResponse(response)) return;
      const data = await response.json();
      if (!response.ok) {
        setError(extractApiError(data.error, "Failed to group the selected transactions."));
        return;
      }

      setMessage(`Grouped ${selectedEntryIds.size} transactions into "${assignLabel.trim()}".`);
      setAssignModalOpen(false);
      setAssignLabel("");
      setAssignRemark("");
      setSelectedEntryIds(new Set());
      triggerRefresh();
    } catch {
      setError("Failed to group the selected transactions due to a network error.");
    } finally {
      setGroupSubmitting(false);
    }
  }

  const criticalPending =
    entrySubmitting ||
    groupSubmitting ||
    entryDeleting ||
    importSubmitting ||
    exportSubmitting ||
    uploadSubmitting ||
    attachmentDeleting ||
    settlementSubmitting ||
    settlementDeleting;

  const settlementTargetRef = useMemo(
    () => (settlementTarget ? settlementTargetFromEntry(settlementTarget) : null),
    [settlementTarget]
  );
  // Re-derived from the loaded rows so the modal reflects settlements that were
  // just added or removed.
  const settlementHistoryEntry = settlementHistoryEntryId
    ? findEntryById(settlementHistoryEntryId)
    : null;

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (!openActionMenu) return;
      if (actionMenuRef.current && event.target instanceof Node && !actionMenuRef.current.contains(event.target)) {
        setOpenActionMenu(null);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenActionMenu(null);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [openActionMenu]);

  function triggerRefresh() {
    // One API call refreshes the table + summary cards. Avoid router.refresh()
    // here — it re-runs the full server-component query fan-out and doubles
    // the cost of every create/update/delete.
    void loadEntries({ includeMetrics: true });
  }

  function resetGroupCreateForm() {
    setGroupLabel("");
    setGroupRemark("");
    setGroupEntryForms([newEntryForm(), newEntryForm()]);
  }

  async function createGroup() {
    const label = groupLabel.trim();
    if (label.length < 2) {
      setError("Group label must be at least 2 characters.");
      return;
    }
    const payloadEntries = groupEntryForms.filter(isEntryFormComplete).map(toEntryPayload);
    if (payloadEntries.length < 2) {
      setError("A grouped transaction needs at least 2 entries with an explanation and amount.");
      return;
    }

    setGroupSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await secureFetch("/api/big-book/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label,
          remark: groupRemark,
          entries: payloadEntries
        })
      });
      if (handleUnauthorizedResponse(response)) return;
      const data = await response.json();
      if (!response.ok) {
        setError(extractApiError(data.error, "Failed to create grouped transaction."));
        return;
      }

      setMessage("Grouped transaction created.");
      setPendingEntryConfirm(false);
      setCreateModalOpen(false);
      // Optimistically fold every child amount into the Grand Total card; SSR
      // via `triggerRefresh` reconciles right after.
      for (const payload of payloadEntries) {
        const actor = initialActors.find((row) => row.id === payload.responsible_actor_id);
        applyMetricDelta(
          payload.responsible_actor_id,
          actor?.display_name ?? "Unknown Actor",
          payload.currency_code,
          payload.entry_direction === "spending" ? -payload.amount : payload.amount,
          payload.pocket_id
        );
      }
      resetGroupCreateForm();
      triggerRefresh();
    } catch {
      setError("Failed to create grouped transaction due to a network error.");
    } finally {
      setGroupSubmitting(false);
    }
  }

  async function createEntry() {
    if (createMode === "group") {
      await createGroup();
      return;
    }
    const amountValue = Number(parseAmountInput(entryForm.amount));
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      setError("Amount must be greater than 0.");
      return;
    }

    setEntrySubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await secureFetch("/api/big-book/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...entryForm,
          entry_sub_type_id: entryForm.entry_sub_type_id || null,
          vendor_type_id: entryForm.vendor_type_id || null,
          vendor_id: entryForm.vendor_id || null,
          pocket_id: entryForm.pocket_id || null,
          action_by_id: entryForm.action_by_id || null,
          amount: amountValue,
          ...toCreditPayload(entryForm, null)
        })
      });
      if (handleUnauthorizedResponse(response)) return;
      const data = await response.json();
      if (!response.ok) {
        setError(extractApiError(data.error, "Failed to create ledger entry."));
        return;
      }

      const createdEntryId = data.id as string;
      if (createAttachmentFiles.length > 0) {
        const uploadResults = await Promise.all(
          createAttachmentFiles.map(async (file) => {
            const formData = new FormData();
            formData.append("ledger_entry_id", createdEntryId);
            formData.append("file", file);
            const uploadResponse = await secureFetch("/api/big-book/attachments", {
              method: "POST",
              body: formData
            });
            if (handleUnauthorizedResponse(uploadResponse)) {
              return { ok: false as const, fileName: file.name, aborted: true };
            }
            const uploadData = await uploadResponse.json();
            if (!uploadResponse.ok) {
              return {
                ok: false as const,
                fileName: file.name,
                aborted: false,
                error: extractApiError(uploadData.error, `Entry created, but failed to upload ${file.name}.`)
              };
            }
            return { ok: true as const, fileName: file.name };
          })
        );
        if (uploadResults.some((result) => !result.ok && result.aborted)) return;
        const failedUpload = uploadResults.find(
          (result): result is { ok: false; aborted: false; fileName: string; error: string } =>
            !result.ok && !result.aborted
        );
        if (failedUpload) {
          setError(failedUpload.error);
          setPendingEntryConfirm(false);
          setCreateModalOpen(false);
          triggerRefresh();
          return;
        }
      }

      const keepModalOpen = createEntryMode === "create_another";
      setMessage("Ledger entry created.");
      setPendingEntryConfirm(false);
      setCreateModalOpen(keepModalOpen);
      setCreateAttachmentFiles([]);
      // Optimistically update the Grand Total card so it reflects the new
      // entry immediately. SSR via `triggerRefresh` will reconcile shortly
      // and the prop-sync useEffect will overwrite this with the truth.
      const createdActor = initialActors.find((actor) => actor.id === entryForm.responsible_actor_id);
      const createdDelta =
        entryForm.entry_direction === "spending" ? -amountValue : amountValue;
      applyMetricDelta(
        entryForm.responsible_actor_id,
        createdActor?.display_name ?? "Unknown Actor",
        entryForm.currency_code,
        createdDelta,
        entryForm.pocket_id || null
      );
      setEntryForm((prev) => ({
        ...prev,
        explanation: "",
        amount: "",
        remark: "",
        ...(keepModalOpen
          ? {}
          : {
              currency_code: "IDR" as const,
              entry_sub_type_id: "",
              vendor_type_id: "",
              vendor_id: "",
              pocket_id: "",
              action_by_id: "",
              is_credit: false,
              settles_entry_id: "",
              settlement_conversion_rate: "",
              settlement_note: "",
              close_credit: false,
              credit_settlement_note: ""
            })
      }));
      triggerRefresh();
    } catch {
      setError("Failed to create ledger entry due to a network error.");
    } finally {
      setEntrySubmitting(false);
    }
  }

  async function deleteEntry() {
    if (!pendingDeleteEntry) return;
    const deletingEntryId = pendingDeleteEntry.id;
    setEntryDeleting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await secureFetch(`/api/big-book/entries?id=${pendingDeleteEntry.id}`, { method: "DELETE" });
      if (handleUnauthorizedResponse(response)) return;
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Failed to delete ledger entry.");
        return;
      }
      setMessage("Ledger entry deleted.");
      const wasStandalone = ledgerRows.some(
        (row) => row.kind === "entry" && row.entry.id === deletingEntryId
      );
      setLedgerRows((prev) =>
        prev
          .map((row) =>
            row.kind === "group"
              ? { ...row, entries: row.entries.filter((item) => item.id !== deletingEntryId) }
              : row
          )
          .filter((row) => (row.kind === "entry" ? row.entry.id !== deletingEntryId : row.entries.length > 0))
      );
      if (wasStandalone) {
        setTotalCount((prev) => Math.max(0, prev - 1));
      }
      // Optimistically undo the deleted row's contribution to the Grand Total
      // card. spending was -amount, so undoing it adds +amount; profit was
      // +amount, so undoing it subtracts amount. SSR via `triggerRefresh`
      // will reconcile shortly via the prop-sync useEffect.
      const deletedAmount = Math.abs(Number(pendingDeleteEntry.amount));
      const deletedDelta =
        pendingDeleteEntry.entry_direction === "spending" ? deletedAmount : -deletedAmount;
      applyMetricDelta(
        pendingDeleteEntry.responsible_actor_id,
        pendingDeleteEntry.actor_display_name,
        pendingDeleteEntry.currency_code,
        deletedDelta,
        pendingDeleteEntry.pocket_id
      );
      setPendingDeleteEntry(null);
      triggerRefresh();
    } catch {
      setError("Failed to delete ledger entry due to a network error.");
    } finally {
      setEntryDeleting(false);
    }
  }

  async function importEntries() {
    if (!importFile) {
      setError("Choose a CSV file first.");
      return;
    }

    setImportSubmitting(true);
    setError(null);
    setMessage(null);
    setImportErrors([]);
    try {
      const formData = new FormData();
      formData.append("file", importFile);
      const response = await secureFetch("/api/big-book/import", {
        method: "POST",
        body: formData
      });
      if (handleUnauthorizedResponse(response)) return;
      const data = await response.json();
      if (!response.ok) {
        if (Array.isArray(data?.errors)) {
          const list = data.errors
            .filter((item: unknown): item is string => typeof item === "string" && item.trim().length > 0)
            .slice(0, 50);
          if (list.length) {
            setImportErrors(list);
            setError(data.message ?? "Import failed due to validation errors.");
            return;
          }
        }
        setError(data.error ?? data.message ?? "Failed to import CSV.");
        return;
      }

      const imported = typeof data.processed === "number" ? data.processed : 0;
      setImportFile(null);
      setMessage(`Imported ${imported} ledger row${imported === 1 ? "" : "s"} successfully.`);
      setImportSuccessCount(imported);
      setImportModalOpen(false);
      triggerRefresh();
    } catch {
      setError("Failed to import CSV due to a network error.");
    } finally {
      setImportSubmitting(false);
    }
  }

  function downloadImportTemplate() {
    const csv = buildBigBookImportTemplateCsv();
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const downloadUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = "big-book-import-template.csv";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(downloadUrl);
  }

  async function exportEntries() {
    setExportSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const params = new URLSearchParams();
      params.set("sortBy", sortBy);
      params.set("sortDir", sortDir);
      if (query) params.set("query", query);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      for (const typeId of typeFilter) params.append("typeId", typeId);
      for (const currencyCode of currencyFilter) params.append("currencyCode", currencyCode);
      for (const actorId of actorFilter) params.append("actorId", actorId);
      for (const direction of directionFilter) params.append("direction", direction);
      for (const vendorTypeId of vendorTypeFilter) params.append("vendorTypeId", vendorTypeId);
      for (const vendorId of vendorFilter) params.append("vendorId", vendorId);
      for (const pocketId of pocketFilter) params.append("pocketId", pocketId);
      for (const actionById of actionByFilter) params.append("actionById", actionById);

      const url = `/api/big-book/export${params.toString() ? `?${params.toString()}` : ""}`;
      const response = await fetch(url);
      if (handleUnauthorizedResponse(response)) return;
      if (!response.ok) {
        let errorMessage = "Failed to export ledger entries.";
        try {
          const data = await response.json();
          errorMessage = extractApiError(data?.error, errorMessage);
        } catch {
          // ignore JSON parse errors; keep default message
        }
        setError(errorMessage);
        return;
      }
      const blob = await response.blob();
      const today = new Date().toISOString().slice(0, 10);
      const filename = `big-book-export-${today}.csv`;
      const downloadUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(downloadUrl);
      setMessage("Exported ledger entries to CSV.");
    } catch {
      setError("Failed to export ledger entries due to a network error.");
    } finally {
      setExportSubmitting(false);
    }
  }

  function startEditEntry(row: BigBookEntry) {
    setOpenActionMenu(null);
    setEditingGroupId(null);
    setEditingEntryId(row.id);
    setEditForm(entryFormFromEntry(row));
    setEditSettlesEntry(row.settles_entry);
    setEditModalOpen(true);
  }

  function startEditGroup(group: BigBookEntryGroup, entries: BigBookEntry[]) {
    setOpenActionMenu(null);
    setEditingEntryId(null);
    setEditingGroupId(group.id);
    setEditGroupLabel(group.label);
    setEditGroupRemark(group.remark ?? "");
    const forms = entries.map(entryFormFromEntry);
    setEditGroupForms(forms);
    const firstIncomplete = forms.findIndex((form) => missingEntryFields(form).length > 0);
    setExpandedEditTxnIndexes(new Set([firstIncomplete >= 0 ? firstIncomplete : 0]));
    setEditModalOpen(true);
  }

  async function saveEditedGroup() {
    if (!editingGroupId) return;
    const label = editGroupLabel.trim();
    if (label.length < 2) {
      setError("Group label must be at least 2 characters.");
      return;
    }
    const payloadEntries = editGroupForms
      .filter(isEntryFormComplete)
      .map((form) => ({ ...toEntryPayload(form), ...(form.id ? { id: form.id } : {}) }));
    if (payloadEntries.length < 2) {
      setError("A grouped transaction needs at least 2 entries with an explanation and amount.");
      return;
    }

    setGroupSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await secureFetch("/api/big-book/groups", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingGroupId,
          label,
          remark: editGroupRemark,
          entries: payloadEntries
        })
      });
      if (handleUnauthorizedResponse(response)) return;
      const data = await response.json();
      if (!response.ok) {
        setError(extractApiError(data.error, "Failed to update grouped transaction."));
        return;
      }
      setMessage("Grouped transaction updated.");
      setPendingEditConfirm(false);
      setEditModalOpen(false);
      setEditingGroupId(null);
      setEditGroupForms([]);
      triggerRefresh();
    } catch {
      setError("Failed to update grouped transaction due to a network error.");
    } finally {
      setGroupSubmitting(false);
    }
  }

  async function deleteGroup(mode: "cascade" | "ungroup") {
    const groupId = mode === "cascade" ? pendingDeleteGroup?.group.id : pendingUngroup?.id;
    if (!groupId) return;

    setGroupSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await secureFetch(`/api/big-book/groups?id=${groupId}&mode=${mode}`, {
        method: "DELETE"
      });
      if (handleUnauthorizedResponse(response)) return;
      const data = await response.json();
      if (!response.ok) {
        setError(
          extractApiError(
            data.error,
            mode === "cascade" ? "Failed to delete grouped transaction." : "Failed to ungroup transactions."
          )
        );
        return;
      }

      if (mode === "cascade") {
        // Undo every child's contribution to the Grand Total card, mirroring
        // the single-entry delete path.
        for (const entry of pendingDeleteGroup?.entries ?? []) {
          const amount = Math.abs(Number(entry.amount));
          applyMetricDelta(
            entry.responsible_actor_id,
            entry.actor_display_name,
            entry.currency_code,
            entry.entry_direction === "spending" ? amount : -amount,
            entry.pocket_id
          );
        }
        setMessage("Grouped transaction deleted.");
      } else {
        setMessage("Group removed. Transactions are now standalone.");
      }

      setPendingDeleteGroup(null);
      setPendingUngroup(null);
      setExpandedGroupIds((prev) => {
        const next = new Set(prev);
        next.delete(groupId);
        return next;
      });
      triggerRefresh();
    } catch {
      setError(
        mode === "cascade"
          ? "Failed to delete grouped transaction due to a network error."
          : "Failed to ungroup transactions due to a network error."
      );
    } finally {
      setGroupSubmitting(false);
    }
  }

  async function saveEditedEntry() {
    if (!editingEntryId) return;
    const amountValue = Number(parseAmountInput(editForm.amount));
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      setError("Amount must be greater than 0.");
      return;
    }

    setEntrySubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await secureFetch("/api/big-book/entries", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...editForm,
          id: editingEntryId,
          entry_sub_type_id: editForm.entry_sub_type_id || null,
          vendor_type_id: editForm.vendor_type_id || null,
          vendor_id: editForm.vendor_id || null,
          pocket_id: editForm.pocket_id || null,
          action_by_id: editForm.action_by_id || null,
          amount: amountValue,
          ...toCreditPayload(editForm, editSettlesEntry)
        })
      });
      if (handleUnauthorizedResponse(response)) return;
      const data = await response.json();
      if (!response.ok) {
        setError(extractApiError(data.error, "Failed to update ledger entry."));
        return;
      }
      setMessage("Ledger entry updated.");
      setPendingEditConfirm(false);
      setEditModalOpen(false);
      setEditingEntryId(null);
      setEditSettlesEntry(null);
      triggerRefresh();
    } catch {
      setError("Failed to update ledger entry due to a network error.");
    } finally {
      setEntrySubmitting(false);
    }
  }

  async function uploadAttachments() {
    if (!pendingUploadEntryId) return;
    const files = manageAttachmentFiles;
    if (!files.length) {
      setError("Choose one or more image files first.");
      return;
    }
    setUploadSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const uploadResults = await Promise.all(
        files.map(async (file) => {
          const formData = new FormData();
          formData.append("ledger_entry_id", pendingUploadEntryId);
          formData.append("file", file);
          const response = await secureFetch("/api/big-book/attachments", {
            method: "POST",
            body: formData
          });
          if (handleUnauthorizedResponse(response)) {
            return { ok: false as const, aborted: true, fileName: file.name };
          }
          const data = await response.json();
          if (!response.ok) {
            return {
              ok: false as const,
              aborted: false,
              fileName: file.name,
              error: extractApiError(data.error, `Failed to upload ${file.name}.`)
            };
          }
          return { ok: true as const, fileName: file.name };
        })
      );
      if (uploadResults.some((result) => !result.ok && result.aborted)) return;
      const failedUpload = uploadResults.find(
        (result): result is { ok: false; aborted: false; fileName: string; error: string } =>
          !result.ok && !result.aborted
      );
      if (failedUpload) {
        setError(failedUpload.error);
        return;
      }
      setMessage("Attachment(s) uploaded.");
      setPendingUploadEntryId(null);
      setManageAttachmentFiles([]);
      triggerRefresh();
    } catch {
      setError("Failed to upload attachment due to a network error.");
    } finally {
      setUploadSubmitting(false);
    }
  }

  async function viewAttachment(attachmentId: string) {
    setAttachmentViewingId(attachmentId);
    setError(null);
    try {
      const response = await fetch(`/api/big-book/attachments/view?id=${attachmentId}`);
      if (handleUnauthorizedResponse(response)) return;
      const data = await response.json();
      if (!response.ok || !data.url) {
        setError(data.error ?? "Failed to load attachment preview.");
        return;
      }
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch {
      setError("Failed to open attachment due to a network error.");
    } finally {
      setAttachmentViewingId(null);
    }
  }

  async function deleteAttachment() {
    if (!pendingDeleteAttachmentId) return;
    setAttachmentDeleting(true);
    setError(null);
    try {
      const response = await secureFetch(`/api/big-book/attachments?id=${pendingDeleteAttachmentId}`, {
        method: "DELETE"
      });
      if (handleUnauthorizedResponse(response)) return;
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Failed to delete attachment.");
        return;
      }
      setMessage("Attachment deleted.");
      setPendingDeleteAttachmentId(null);
      triggerRefresh();
    } catch {
      setError("Failed to delete attachment due to a network error.");
    } finally {
      setAttachmentDeleting(false);
    }
  }

  function removeCreateAttachmentAt(index: number) {
    setCreateAttachmentFiles((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  }

  function openManageAttachments(row: BigBookEntry) {
    setOpenActionMenu(null);
    setManageAttachmentsEntry(row);
    setManageAttachmentFiles([]);
  }

  function openRecordSettlement(row: BigBookEntry) {
    setOpenActionMenu(null);
    setSettlementTarget(row);
    setSettlementAttachmentFiles([]);
    setSettlementForm({
      entry_date: today,
      entry_direction: "profit",
      entry_type_id: row.entry_type_id,
      entry_sub_type_id: row.entry_sub_type_id ?? "",
      vendor_type_id: row.vendor_type_id ?? "",
      vendor_id: row.vendor_id ?? "",
      pocket_id: "",
      action_by_id: row.action_by_id ?? "",
      explanation: `Settlement for: ${row.explanation}`,
      amount: formatAmountInput(String(row.amount)),
      currency_code: row.currency_code,
      remark: "",
      responsible_actor_id: row.responsible_actor_id,
      is_credit: false,
      settles_entry_id: row.id,
      settlement_conversion_rate: "1",
      settlement_note: "",
      close_credit: false,
      credit_settlement_note: ""
    });
  }

  function openCreditClosureDialog(row: BigBookEntry, settled: boolean) {
    setOpenActionMenu(null);
    setCreditClosureDialog({ entry: row, settled });
    setCreditClosureNote(settled ? row.credit_settlement_note ?? "" : "");
  }

  async function submitCreditClosure() {
    if (!creditClosureDialog) return;
    setCreditClosureSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await secureFetch("/api/big-book/entries/settle", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: creditClosureDialog.entry.id,
          settled: creditClosureDialog.settled,
          note: creditClosureNote.trim() || null
        })
      });
      if (handleUnauthorizedResponse(response)) return;
      const data = await response.json();
      if (!response.ok) {
        setError(
          extractApiError(
            data.error,
            creditClosureDialog.settled
              ? "Failed to mark the credit as settled."
              : "Failed to reopen the credit."
          )
        );
        return;
      }
      setMessage(
        creditClosureDialog.settled
          ? "Credit marked as settled."
          : "Credit reopened."
      );
      setCreditClosureDialog(null);
      setCreditClosureNote("");
      triggerRefresh();
    } catch {
      setError("Failed to update credit settlement status due to a network error.");
    } finally {
      setCreditClosureSubmitting(false);
    }
  }

  function closeRecordSettlement() {
    setSettlementTarget(null);
    setSettlementForm(null);
    setSettlementAttachmentFiles([]);
  }

  async function fetchConversionRate(
    baseCurrency: EntryFormState["currency_code"],
    quoteCurrency: EntryFormState["currency_code"],
    applyRate: (rate: string) => void
  ) {
    setFetchingConversionRate(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        amount: "1",
        base_currency: baseCurrency,
        quote_currency: quoteCurrency
      });
      const response = await fetch(`/api/big-book/exchange-rate?${params.toString()}`, {
        cache: "no-store"
      });
      if (handleUnauthorizedResponse(response)) return;
      const data = await response.json();
      if (!response.ok) {
        setError(extractApiError(data?.error, "Failed to fetch the conversion rate."));
        return;
      }
      const rate = typeof data?.rate === "number" ? data.rate : Number(data?.converted_amount);
      if (!Number.isFinite(rate) || rate <= 0) {
        setError("The exchange service returned an unusable rate.");
        return;
      }
      applyRate(formatRateInput(String(rate)));
    } catch {
      setError("Failed to fetch the conversion rate due to a network error.");
    } finally {
      setFetchingConversionRate(false);
    }
  }

  async function recordSettlement() {
    if (!settlementTarget || !settlementForm) return;
    const amountValue = Number(parseAmountInput(settlementForm.amount));
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      setError("Settlement amount must be greater than 0.");
      return;
    }
    const creditPayload = toCreditPayload(settlementForm, settlementTargetRef);
    const conversionRate = creditPayload.settlement_conversion_rate;
    if (conversionRate == null) {
      setError("Conversion rate must be greater than 0.");
      return;
    }
    setSettlementSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await secureFetch("/api/big-book/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...settlementForm,
          entry_sub_type_id: settlementForm.entry_sub_type_id || null,
          vendor_type_id: settlementForm.vendor_type_id || null,
          vendor_id: settlementForm.vendor_id || null,
          pocket_id: settlementForm.pocket_id || null,
          action_by_id: settlementForm.action_by_id || null,
          amount: amountValue,
          ...creditPayload
        })
      });
      if (handleUnauthorizedResponse(response)) return;
      const data = await response.json();
      if (!response.ok) {
        setError(extractApiError(data.error, "Failed to record the settlement."));
        return;
      }

      const createdEntryId = data.id as string;
      for (const file of settlementAttachmentFiles) {
        const formData = new FormData();
        formData.append("ledger_entry_id", createdEntryId);
        formData.append("file", file);
        const uploadResponse = await secureFetch("/api/big-book/attachments", {
          method: "POST",
          body: formData
        });
        if (handleUnauthorizedResponse(uploadResponse)) return;
        const uploadData = await uploadResponse.json();
        if (!uploadResponse.ok) {
          setError(
            extractApiError(uploadData.error, `Settlement recorded, but failed to upload ${file.name}.`)
          );
          setPendingSettlementConfirm(false);
          closeRecordSettlement();
          triggerRefresh();
          return;
        }
      }

      setMessage("Settlement recorded.");
      setPendingSettlementConfirm(false);
      closeRecordSettlement();
      triggerRefresh();
    } catch {
      setError("Failed to record the settlement due to a network error.");
    } finally {
      setSettlementSubmitting(false);
    }
  }

  async function deleteSettlement() {
    if (!pendingDeleteSettlementId) return;
    setSettlementDeleting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await secureFetch(`/api/big-book/entries?id=${pendingDeleteSettlementId}`, {
        method: "DELETE"
      });
      if (handleUnauthorizedResponse(response)) return;
      const data = await response.json();
      if (!response.ok) {
        setError(extractApiError(data.error, "Failed to delete the settlement."));
        return;
      }
      setMessage("Settlement deleted.");
      setPendingDeleteSettlementId(null);
      triggerRefresh();
    } catch {
      setError("Failed to delete the settlement due to a network error.");
    } finally {
      setSettlementDeleting(false);
    }
  }
  function toggleActionMenu(rowId: string, triggerEl: HTMLButtonElement) {
    if (openActionMenu?.id === rowId) {
      setOpenActionMenu(null);
      return;
    }
    const rect = triggerEl.getBoundingClientRect();
    const menuWidth = 176;
    const viewportPadding = 8;
    const left = Math.max(
      viewportPadding,
      Math.min(window.innerWidth - menuWidth - viewportPadding, rect.right - menuWidth)
    );
    setOpenActionMenu({
      id: rowId,
      top: rect.bottom + 6 + window.scrollY,
      left: left + window.scrollX
    });
  }


  const handleCreateModalOpenChange = useCallback(
    (open: boolean) => {
      if (!entrySubmitting && !groupSubmitting) {
        setCreateModalOpen(open);
      }
    },
    [entrySubmitting, groupSubmitting]
  );

  const createPending = entrySubmitting || groupSubmitting;
  const createMissingHint =
    createMode === "group"
      ? describeGroupedMissingFields(groupEntryForms, { groupLabel })
      : describeMissingFields(missingEntryFields(entryForm));
  const createValid = createMissingHint == null;
  const editMissingHint = editingGroupId
    ? describeGroupedMissingFields(editGroupForms, { groupLabel: editGroupLabel })
    : describeMissingFields(missingEntryFields(editForm));
  const editValid = editMissingHint == null;
  const settlementMissingHint = settlementForm
    ? describeMissingFields(missingEntryFields(settlementForm))
    : null;

  function renderEntryRow(entry: BigBookEntry, isGroupMember: boolean) {
    const stripe = isGroupMember
      ? "bg-[rgb(var(--surface-muted))]/40"
      : rowStripeClass(standaloneEntryStripeIndex.get(entry.id) ?? 0);
    return (
      <BigBookEntryRow
        key={entry.id}
        entry={entry}
        isGroupMember={isGroupMember}
        stripeClass={stripe}
        selected={selectedEntryIds.has(entry.id)}
        actionMenuOpen={openActionMenu?.id === entry.id}
        criticalPending={criticalPending}
        attachmentViewingId={attachmentViewingId}
        onToggleSelected={toggleEntrySelected}
        onViewRemark={onViewRemark}
        onViewAttachment={onViewAttachment}
        onToggleActionMenu={onToggleActionMenu}
      />
    );
  }

  return (
    <div className="space-y-6">
      <section className="card relative" aria-busy={criticalPending}>
        <BlockingOverlay active={criticalPending} label="Processing..." />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Create Ledger Entry</h2>
            <p className="mt-1 text-sm text-muted">
              Add operational spending/profit records from a dedicated popup form.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="btn-secondary"
              onClick={() => void exportEntries()}
              disabled={criticalPending || exportSubmitting}
            >
              {exportSubmitting ? "Exporting..." : "Export CSV"}
            </button>
            <button className="btn-secondary" onClick={() => setImportModalOpen(true)} disabled={criticalPending}>
              Import CSV
            </button>
            <button className="btn" onClick={() => setCreateModalOpen(true)} disabled={criticalPending}>
              New Ledger Entry
            </button>
          </div>
        </div>
      </section>

      <BigBookMetricsSection promise={metricsPromise} override={metricsOverride} />

      <section className="card">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Ledger Records</h2>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="text-xs text-[rgb(var(--info))] underline"
              onClick={resetColumnWidths}
            >
              Reset columns
            </button>
            {entriesLoading ? <LoadingIndicator label="Refreshing..." /> : null}
          </div>
        </div>
        <form
          className="mb-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            applyFilters();
          }}
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
            <label className="text-sm text-muted md:col-span-2 xl:col-span-2 2xl:col-span-2">
              <span className="mb-1 block">Search</span>
              <input
                className="field w-full"
                placeholder="Explanation, remark, type..."
                value={draftQuery}
                onChange={(event) => setDraftQuery(event.target.value)}
              />
            </label>
            <label className="text-sm text-muted">
              <span className="mb-1 block">Date From:</span>
              <input
                className="field w-full"
                type="date"
                value={draftDateFrom}
                onChange={(event) => setDraftDateFrom(event.target.value)}
                aria-label="Filter from date"
              />
            </label>
            <label className="text-sm text-muted">
              <span className="mb-1 block">Date To:</span>
              <input
                className="field w-full"
                type="date"
                value={draftDateTo}
                onChange={(event) => setDraftDateTo(event.target.value)}
                aria-label="Filter to date"
              />
            </label>
            <div className="text-sm text-muted">
              <span className="mb-1 block">Type</span>
              <SearchableMultiSelect
                label="Type"
                selectedValues={draftTypeFilter}
                options={typeOptions}
                onChange={setDraftTypeFilter}
                searchPlaceholder="Search type..."
              />
            </div>
          </div>
          {advancedOpen ? (
            <div
              id="ledger-advanced-filters"
              className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5"
            >
              <div className="text-sm text-muted">
                <span className="mb-1 block">Currency</span>
                <SearchableMultiSelect
                  label="Currency"
                  selectedValues={draftCurrencyFilter}
                  options={currencyOptions}
                  onChange={setDraftCurrencyFilter}
                  searchPlaceholder="Search currency..."
                />
              </div>
              <div className="text-sm text-muted">
                <span className="mb-1 block">Actor</span>
                <SearchableMultiSelect
                  label="Actor"
                  selectedValues={draftActorFilter}
                  options={actorOptions}
                  onChange={(next) => {
                    setDraftActorFilter(next);
                    if (!next.length) return;
                    setDraftPocketFilter((prev) =>
                      prev.filter((pocketId) => {
                        const pocket = initialPockets.find((row) => row.id === pocketId);
                        return pocket ? next.includes(pocket.actor_id) : false;
                      })
                    );
                  }}
                  searchPlaceholder="Search actor..."
                />
              </div>
              <div className="text-sm text-muted">
                <span className="mb-1 block">Cash Flow</span>
                <SearchableMultiSelect
                  label="Cash Flow"
                  selectedValues={draftDirectionFilter}
                  options={directionOptions}
                  onChange={setDraftDirectionFilter}
                  searchPlaceholder="Search direction..."
                />
              </div>
              <div className="text-sm text-muted">
                <span className="mb-1 block">Vendor Type</span>
                <SearchableMultiSelect
                  label="Vendor Type"
                  selectedValues={draftVendorTypeFilter}
                  options={vendorTypeOptions}
                  onChange={(next) => {
                    setDraftVendorTypeFilter(next);
                    if (!next.length) return;
                    setDraftVendorFilter((prev) =>
                      prev.filter((vendorId) => {
                        const vendor = initialVendors.find((row) => row.id === vendorId);
                        return vendor ? next.includes(vendor.vendor_type_id) : false;
                      })
                    );
                  }}
                  searchPlaceholder="Search vendor type..."
                />
              </div>
              <div className="text-sm text-muted">
                <span className="mb-1 block">Vendor Name</span>
                <SearchableMultiSelect
                  label="Vendor Name"
                  selectedValues={draftVendorFilter}
                  options={vendorOptions}
                  onChange={setDraftVendorFilter}
                  searchPlaceholder="Search vendor name..."
                />
              </div>
              <div className="text-sm text-muted">
                <span className="mb-1 block">Pocket</span>
                <SearchableMultiSelect
                  label="Pocket"
                  selectedValues={draftPocketFilter}
                  options={pocketOptions}
                  onChange={setDraftPocketFilter}
                  searchPlaceholder="Search pocket..."
                />
              </div>
              <div className="text-sm text-muted">
                <span className="mb-1 block">Action By</span>
                <SearchableMultiSelect
                  label="Action By"
                  selectedValues={draftActionByFilter}
                  options={actionByOptions}
                  onChange={setDraftActionByFilter}
                  searchPlaceholder="Search Action By..."
                />
              </div>
              <div className="text-sm text-muted">
                <span className="mb-1 block">Credit</span>
                <SearchableMultiSelect
                  label="Credit"
                  selectedValues={draftCreditFlagFilter}
                  options={CREDIT_FLAG_OPTIONS}
                  onChange={setDraftCreditFlagFilter}
                  searchPlaceholder="Search credit type..."
                />
              </div>
              <div className="text-sm text-muted">
                <span className="mb-1 block">Credit Status</span>
                <SearchableMultiSelect
                  label="Credit Status"
                  selectedValues={draftCreditStatusFilter}
                  options={CREDIT_STATUS_OPTIONS}
                  onChange={setDraftCreditStatusFilter}
                  searchPlaceholder="Search credit status..."
                />
              </div>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {filtersDirty ? (
              <span className="mr-auto text-xs text-[rgb(var(--warning))]">Filters changed — click Apply Filters to update results.</span>
            ) : null}
            <button
              type="button"
              className="btn-secondary"
              aria-expanded={advancedOpen}
              aria-controls="ledger-advanced-filters"
              onClick={() => setAdvancedOpen((prev) => !prev)}
            >
              Advanced Filters
              {advancedDraftCount > 0 ? (
                <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[rgb(var(--primary))] px-1.5 text-xs text-white">
                  {advancedDraftCount}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={resetFilters}
              disabled={!draftFiltersActive && !filtersActive}
            >
              Reset
            </button>
            <button type="submit" className="btn" disabled={!filtersDirty}>
              Apply Filters
            </button>
          </div>
        </form>
        {selectedCount > 0 ? (
          <div className="flex flex-wrap items-center gap-3 rounded border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] px-3 py-2">
            <span className="text-sm font-medium text-[rgb(var(--text))]">
              {selectedCount} transaction{selectedCount === 1 ? "" : "s"} selected
            </span>
            {selectedCount < 2 ? (
              <span className="text-xs text-muted">Select at least 2 to group them.</span>
            ) : null}
            <div className="ml-auto flex items-center gap-2">
              <button type="button" className="btn-secondary" onClick={() => setSelectedEntryIds(new Set())}>
                Clear selection
              </button>
              <button
                type="button"
                className="btn"
                disabled={selectedCount < 2}
                onClick={() => {
                  setAssignLabel("");
                  setAssignRemark("");
                  setAssignModalOpen(true);
                }}
              >
                Group selected
              </button>
            </div>
          </div>
        ) : null}
        <div
          className="max-h-[70vh] overflow-auto"
          onScroll={() => {
            // Action menus are positioned from the trigger's document coordinates,
            // so they would drift away from their row once the table scrolls.
            if (openActionMenu) setOpenActionMenu(null);
          }}
        >
          <table
            className="data-table data-table-sticky-head table-fixed"
            style={{ width: ledgerTableWidth, minWidth: ledgerTableWidth }}
          >
            <colgroup>
              {LEDGER_COLUMN_KEYS.map((key) => (
                <col key={key} style={{ width: columnWidths[key] }} />
              ))}
            </colgroup>
            <thead className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] text-left">
              <tr>
                <th className="relative px-3 py-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    aria-label="Select all ungrouped transactions on this page"
                    checked={allSelectableSelected}
                    disabled={selectableEntryIds.length === 0}
                    onChange={toggleSelectAllOnPage}
                  />
                  <span
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize select column"
                    className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize touch-none select-none hover:bg-[rgb(var(--primary)/0.35)]"
                    {...getResizeHandleProps("select")}
                  />
                </th>
                {(
                  [
                    ["entry_date", "Date"],
                    ["entry_direction", "Cash Flow"],
                    ["type_name", "Type"],
                    ["sub_type_name", "Sub-Type"],
                    ["vendor_type_name", "Vendor Type"],
                    ["vendor_name", "Vendor Name"],
                    ["actor_display_name", "Actor"],
                    ["action_by_name", "Action By"],
                    ["explanation", "Explanation"]
                  ] as Array<[BigBookLedgerSortKey, string]>
                ).map(([key, label]) => (
                  <th key={key} className="relative px-3 py-2" aria-sort={ariaSortFor(key)}>
                    <button type="button" className="font-semibold" onClick={() => toggleSort(key)}>
                      {label}
                      {sortMarker(key)}
                    </button>
                    <span
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={`Resize ${label} column`}
                      className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize touch-none select-none hover:bg-[rgb(var(--primary)/0.35)]"
                      {...getResizeHandleProps(key)}
                    />
                  </th>
                ))}
                <th className="relative px-3 py-2 text-right" aria-sort={ariaSortFor("amount")}>
                  <button type="button" className="font-semibold" onClick={() => toggleSort("amount")}>
                    Amount
                    {sortMarker("amount")}
                  </button>
                  <span
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize Amount column"
                    className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize touch-none select-none hover:bg-[rgb(var(--primary)/0.35)]"
                    {...getResizeHandleProps("amount")}
                  />
                </th>
                <th className="relative px-3 py-2">
                  Credit
                  <span
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize Credit column"
                    className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize touch-none select-none hover:bg-[rgb(var(--primary)/0.35)]"
                    {...getResizeHandleProps("credit")}
                  />
                </th>
                <th className="relative px-3 py-2" aria-sort={ariaSortFor("pocket_name")}>
                  <button type="button" className="font-semibold" onClick={() => toggleSort("pocket_name")}>
                    Pocket
                    {sortMarker("pocket_name")}
                  </button>
                  <span
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize Pocket column"
                    className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize touch-none select-none hover:bg-[rgb(var(--primary)/0.35)]"
                    {...getResizeHandleProps("pocket_name")}
                  />
                </th>
                {(
                  [
                    ["remark", "Remark"],
                    ["attachments", "Attachments"],
                    ["actions", "Actions"]
                  ] as Array<[string, string]>
                ).map(([key, label]) => (
                  <th key={key} className="relative px-3 py-2">
                    {label}
                    <span
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={`Resize ${label} column`}
                      className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize touch-none select-none hover:bg-[rgb(var(--primary)/0.35)]"
                      {...getResizeHandleProps(key)}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entriesLoading
                ? Array.from({ length: LEDGER_SKELETON_ROW_COUNT }).map((_, index) => (
                    <tr
                      key={`ledger-skeleton-row-${index}`}
                      className="border-b border-[rgb(var(--border))] align-top animate-pulse"
                      aria-hidden="true"
                    >
                      <td className="px-3 py-2"><div className="h-4 w-4 rounded bg-[rgb(var(--surface-muted))]" /></td>
                      <td className="px-3 py-2"><div className="h-4 w-24 rounded bg-[rgb(var(--surface-muted))]" /></td>
                      <td className="px-3 py-2"><div className="h-5 w-14 rounded-full bg-[rgb(var(--surface-muted))]" /></td>
                      <td className="px-3 py-2"><div className="h-4 w-28 rounded bg-[rgb(var(--surface-muted))]" /></td>
                      <td className="px-3 py-2"><div className="h-4 w-24 rounded bg-[rgb(var(--surface-muted))]" /></td>
                      <td className="px-3 py-2"><div className="h-4 w-24 rounded bg-[rgb(var(--surface-muted))]" /></td>
                      <td className="px-3 py-2"><div className="h-4 w-24 rounded bg-[rgb(var(--surface-muted))]" /></td>
                      <td className="px-3 py-2"><div className="h-4 w-28 rounded bg-[rgb(var(--surface-muted))]" /></td>
                      <td className="px-3 py-2"><div className="h-4 w-24 rounded bg-[rgb(var(--surface-muted))]" /></td>
                      <td className="px-3 py-2"><div className="h-4 w-56 rounded bg-[rgb(var(--surface-muted))]" /></td>
                      <td className="px-3 py-2"><div className="h-4 w-24 rounded bg-[rgb(var(--surface-muted))]" /></td>
                      <td className="px-3 py-2"><div className="h-5 w-16 rounded-full bg-[rgb(var(--surface-muted))]" /></td>
                      <td className="px-3 py-2"><div className="h-4 w-24 rounded bg-[rgb(var(--surface-muted))]" /></td>
                      <td className="px-3 py-2"><div className="h-4 w-20 rounded bg-[rgb(var(--surface-muted))]" /></td>
                      <td className="px-3 py-2"><div className="h-4 w-16 rounded bg-[rgb(var(--surface-muted))]" /></td>
                      <td className="px-3 py-2"><div className="h-8 w-20 rounded bg-[rgb(var(--surface-muted))]" /></td>
                    </tr>
                  ))
                : ledgerRows.map((row) =>
                    row.kind === "entry" ? (
                      renderEntryRow(row.entry, false)
                    ) : (
                      <BigBookGroupHeaderRow
                        key={`group-${row.group.id}`}
                        group={row.group}
                        entries={row.entries}
                        expanded={expandedGroupIds.has(row.group.id)}
                        onToggle={() => toggleGroupExpanded(row.group.id)}
                        labelColSpan={GROUP_ROW_LABEL_COLSPAN}
                        trailingColSpan={GROUP_ROW_TRAILING_COLSPAN}
                        openActionMenu={openActionMenu}
                        actionMenuRef={actionMenuRef}
                        onOpenActionMenu={(id, top, left) => setOpenActionMenu({ id, top, left })}
                        onCloseActionMenu={() => setOpenActionMenu(null)}
                        onEdit={() => startEditGroup(row.group, row.entries)}
                        onUngroup={() => setPendingUngroup(row.group)}
                        onDelete={() => setPendingDeleteGroup({ group: row.group, entries: row.entries })}
                      >
                        {row.entries.map((entry) => renderEntryRow(entry, true))}
                      </BigBookGroupHeaderRow>
                    )
                  )}
              {!ledgerRows.length && !entriesLoading ? (
                <TableEmptyState
                  colSpan={LEDGER_COLUMN_COUNT}
                  message="No records match the current filters."
                />
              ) : null}
            </tbody>
          </table>
        </div>
        {ledgerRows.length > 0 && !entriesLoading ? (
          // Kept outside the scrolling table so the summary stays centred in the
          // card instead of drifting with the table's horizontal scroll.
          <div className="overflow-x-auto border-t-2 border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))]">
            <div className="mx-auto flex w-fit flex-col px-3 py-3">
              <div className="flex items-start gap-x-8">
                <div className="w-56 shrink-0">
                  <p className="font-medium text-[rgb(var(--text))]">Sub-total</p>
                  <p className="text-xs text-muted">
                    this page · {totals.pageEntryCount} transaction
                    {totals.pageEntryCount === 1 ? "" : "s"}
                    {pocketExcludedLabel(totals.pagePocketExcludedCount)}
                  </p>
                </div>
                <BigBookCurrencyTotals totals={totals.pageTotals} showHeader showNet />
              </div>
              <div className="mt-3 flex items-start gap-x-8 border-t border-[rgb(var(--border))] pt-3">
                <div className="w-56 shrink-0">
                  <p className="font-semibold text-[rgb(var(--text))]">Grand total</p>
                  <p className="text-xs text-muted">
                    all pages · {totals.grandEntryCount} transaction
                    {totals.grandEntryCount === 1 ? "" : "s"}
                    {filtersActive ? " matching the current filters" : ""}
                    {pocketExcludedLabel(totals.grandPocketExcludedCount)}
                  </p>
                </div>
                <BigBookCurrencyTotals totals={totals.grandTotals} showHeader showNet />
              </div>
            </div>
          </div>
        ) : null}
        <TablePaginationBar
          totalCount={totalCount}
          page={ledgerPagination.page}
          setPage={ledgerPagination.setPage}
          pageSize={ledgerPagination.pageSize}
          setPageSize={ledgerPagination.setPageSize}
          pageCount={ledgerPagination.pageCount}
          rangeLabel={ledgerPagination.rangeLabel}
        />
      </section>

      {error ? <p className="text-sm text-[rgb(var(--danger))]">{error}</p> : null}
      {message ? <p className="text-sm text-[rgb(var(--success))]">{message}</p> : null}

      {openActionMenu && !openActionMenu.id.startsWith(GROUP_MENU_PREFIX)
        ? (() => {
            // Group headers render their own menu inline; this one only serves
            // individual entry rows (standalone or group members).
            const targetRow = findEntryById(openActionMenu.id);
            if (!targetRow) return null;
            return (
              <div
                ref={actionMenuRef}
                role="menu"
                className="absolute z-50 w-44 rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-1 text-[rgb(var(--text))] shadow-lg"
                style={{ top: openActionMenu.top, left: openActionMenu.left }}
              >
                <button
                  className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-[rgb(var(--surface-muted))]"
                  role="menuitem"
                  onClick={() => startEditEntry(targetRow)}
                >
                  Edit record
                </button>
                <button
                  className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-[rgb(var(--surface-muted))]"
                  role="menuitem"
                  onClick={() => openManageAttachments(targetRow)}
                >
                  Manage attachments
                </button>
                {targetRow.is_credit ? (
                  <button
                    className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-[rgb(var(--surface-muted))]"
                    role="menuitem"
                    onClick={() => openRecordSettlement(targetRow)}
                  >
                    Record settlement
                  </button>
                ) : null}
                {targetRow.is_credit && targetRow.credit_status !== "settled" ? (
                  <button
                    className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-[rgb(var(--surface-muted))]"
                    role="menuitem"
                    onClick={() => openCreditClosureDialog(targetRow, true)}
                  >
                    Mark as settled
                  </button>
                ) : null}
                {targetRow.is_credit && targetRow.credit_status === "settled" ? (
                  <button
                    className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-[rgb(var(--surface-muted))]"
                    role="menuitem"
                    onClick={() => openCreditClosureDialog(targetRow, false)}
                  >
                    Reopen credit
                  </button>
                ) : null}
                {targetRow.is_credit && targetRow.settlements.length > 0 ? (
                  <button
                    className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-[rgb(var(--surface-muted))]"
                    role="menuitem"
                    onClick={() => {
                      setOpenActionMenu(null);
                      setSettlementHistoryEntryId(targetRow.id);
                    }}
                  >
                    View settlements
                  </button>
                ) : null}
                <button
                  className="block w-full rounded px-2 py-1 text-left text-sm text-[rgb(var(--danger))] hover:bg-[rgb(var(--surface-muted))]"
                  role="menuitem"
                  onClick={() => {
                    setOpenActionMenu(null);
                    setPendingDeleteEntry(targetRow);
                  }}
                >
                  Delete record
                </button>
              </div>
            );
          })()
        : null}

      <Modal
        open={importModalOpen}
        onOpenChange={(open) => {
          if (!importSubmitting) {
            setImportModalOpen(open);
            if (!open) {
              setImportErrors([]);
              setImportFile(null);
            }
          }
        }}
        title="Bulk Import (CSV)"
        dismissible={!importSubmitting}
        closeOnBackdrop={!importSubmitting}
        footer={
          <>
            <button
              className="btn-secondary"
              disabled={importSubmitting}
              onClick={() => {
                setImportModalOpen(false);
                setImportErrors([]);
                setImportFile(null);
              }}
            >
              Close
            </button>
            <button className="btn" onClick={() => void importEntries()} disabled={importSubmitting || !importFile}>
              {importSubmitting ? "Importing..." : "Import CSV"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm text-muted">
                Download the template, fill multiple rows, then import all at once.
              </p>
              <p className="mt-1 text-xs text-muted">
                Type name and actor name must match currently available values in Big Book. If you edit in
                Excel, save as CSV (comma or semicolon delimited).
              </p>
            </div>
            <button type="button" className="btn-secondary shrink-0" onClick={downloadImportTemplate}>
              Download Template
            </button>
          </div>
          <label className="text-sm text-muted">
            <span className="mb-1 block">CSV File</span>
            <input
              className="field"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => {
                const nextFile = event.target.files?.[0] ?? null;
                setImportFile(nextFile);
                setImportErrors([]);
              }}
            />
          </label>
          {importErrors.length ? (
            <div className="rounded-md border border-[rgb(var(--danger)/0.35)] bg-[rgb(var(--danger)/0.12)] p-3 text-sm text-[rgb(var(--danger))]">
              <p className="font-medium">Import validation errors:</p>
              <ul className="mt-1 list-disc pl-5">
                {importErrors.map((item, index) => (
                  <li key={`${item}-${index}`}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={importSuccessCount !== null}
        onOpenChange={(open) => {
          if (!open) setImportSuccessCount(null);
        }}
        title="Import Completed"
        footer={
          <button className="btn" onClick={() => setImportSuccessCount(null)}>
            OK
          </button>
        }
      >
        <p className="text-sm text-muted">
          Imported {importSuccessCount ?? 0} ledger row{(importSuccessCount ?? 0) === 1 ? "" : "s"} successfully.
        </p>
      </Modal>

      <Modal
        open={createModalOpen}
        onOpenChange={handleCreateModalOpenChange}
        title={createMode === "group" ? "Create Grouped Transaction" : "Create Ledger Entry"}
        size="xl"
        dismissible={!createPending}
        closeOnBackdrop={!createPending}
        onSubmitShortcut={
          createPending || !createValid
            ? undefined
            : () => {
                setCreateEntryMode("create");
                setPendingEntryConfirm(true);
              }
        }
        footer={
          <>
            {createMissingHint ? (
              <p className="mr-auto w-full text-xs text-muted sm:w-auto">{createMissingHint}</p>
            ) : null}
            <button className="btn-secondary" disabled={createPending} onClick={() => setCreateModalOpen(false)}>
              Cancel
            </button>
            <button
              className="btn"
              disabled={createPending || !createValid}
              onClick={() => {
                setCreateEntryMode("create");
                setPendingEntryConfirm(true);
              }}
            >
              {createPending ? "Saving..." : "Save"}
            </button>
            {createMode === "single" ? (
              <button
                className="btn-secondary"
                disabled={createPending || !createValid}
                onClick={() => {
                  setCreateEntryMode("create_another");
                  setPendingEntryConfirm(true);
                }}
              >
                {createPending ? "Saving..." : "Save + Create Another"}
              </button>
            ) : null}
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted">Entry style</span>
            <div className="flex gap-2">
              <button
                type="button"
                className={createMode === "single" ? "btn btn-sm" : "btn-secondary btn-sm"}
                aria-pressed={createMode === "single"}
                onClick={() => setCreateMode("single")}
                disabled={createPending}
              >
                Single transaction
              </button>
              <button
                type="button"
                className={createMode === "group" ? "btn btn-sm" : "btn-secondary btn-sm"}
                aria-pressed={createMode === "group"}
                onClick={() => {
                  setCreateMode("group");
                  setExpandedCreateTxnIndexes(new Set([0]));
                }}
                disabled={createPending}
              >
                Grouped transaction
              </button>
            </div>
          </div>

          {createMode === "single" ? (
            <BigBookEntryFields
              value={entryForm}
              onChange={setEntryForm}
              types={initialTypes}
              subTypes={initialSubTypes}
              vendorTypes={initialVendorTypes}
              vendors={initialVendors}
              actionByOptions={initialActionBy}
              pockets={initialPockets}
              actors={initialActors}
              currencies={currencies}
              showAttachments
              attachmentFiles={createAttachmentFiles}
              onAttachmentFilesChange={setCreateAttachmentFiles}
              onRemoveAttachmentAt={removeCreateAttachmentAt}
            />
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  Group Label *
                  <input
                    className="field mt-1"
                    value={groupLabel}
                    onChange={(event) => setGroupLabel(event.target.value)}
                    placeholder="e.g. October office setup"
                  />
                </label>
                <label className="text-sm">
                  Group Remark
                  <input
                    className="field mt-1"
                    value={groupRemark}
                    onChange={(event) => setGroupRemark(event.target.value)}
                  />
                </label>
              </div>

              {groupEntryForms.map((form, index) => {
                const isExpanded = expandedCreateTxnIndexes.has(index);
                return (
                  <div
                    key={`group-entry-form-${index}`}
                    className="rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))]"
                  >
                    <div className="flex items-center gap-2 p-3">
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        aria-expanded={isExpanded}
                        onClick={() =>
                          setExpandedCreateTxnIndexes((prev) => toggleExpandedIndex(prev, index))
                        }
                      >
                        <span
                          className={`shrink-0 text-muted transition-transform ${isExpanded ? "rotate-180" : ""}`}
                          aria-hidden
                        >
                          ▾
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-[rgb(var(--text))]">
                            Transaction {index + 1}
                          </span>
                          {!isExpanded ? (
                            <span className="mt-0.5 block truncate text-xs text-muted">
                              {summarizeGroupEntryForm(form, initialTypes)}
                            </span>
                          ) : null}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="btn-secondary btn-sm shrink-0"
                        disabled={groupEntryForms.length <= 2 || createPending}
                        onClick={() => {
                          setGroupEntryForms((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
                          setExpandedCreateTxnIndexes((prev) => {
                            const next = new Set<number>();
                            for (const item of prev) {
                              if (item === index) continue;
                              next.add(item > index ? item - 1 : item);
                            }
                            return next;
                          });
                        }}
                      >
                        Remove
                      </button>
                    </div>
                    {isExpanded ? (
                      <div className="border-t border-[rgb(var(--border))] p-3">
                        <BigBookEntryFields
                          value={form}
                          onChange={(next) =>
                            setGroupEntryForms((prev) =>
                              prev.map((item, itemIndex) => (itemIndex === index ? next : item))
                            )
                          }
                          types={initialTypes}
                          subTypes={initialSubTypes}
                          vendorTypes={initialVendorTypes}
                          vendors={initialVendors}
                          actionByOptions={initialActionBy}
                          pockets={initialPockets}
                          actors={initialActors}
                          currencies={currencies}
                          layout="nested"
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}

              <button
                type="button"
                className="btn-secondary"
                disabled={createPending}
                onClick={() => {
                  setGroupEntryForms((prev) => {
                    const next = [...prev, newEntryForm()];
                    setExpandedCreateTxnIndexes(new Set([next.length - 1]));
                    return next;
                  });
                }}
              >
                Add transaction
              </button>
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={pendingEntryConfirm}
        onOpenChange={setPendingEntryConfirm}
        title={createMode === "group" ? "Create grouped transaction?" : "Create ledger entry?"}
        description={
          createMode === "group"
            ? `This will create a group with ${groupEntryForms.length} transaction${
                groupEntryForms.length === 1 ? "" : "s"
              } in the Big Book.`
            : createAttachmentFiles.length
              ? `This will create a new record and upload ${createAttachmentFiles.length} attachment(s).`
              : "This will create a new operational/profit record in the Big Book."
        }
        confirmLabel={
          createMode === "group"
            ? "Create Group"
            : createEntryMode === "create_another"
              ? "Create & Add Another"
              : "Create Entry"
        }
        confirming={createPending}
        closeOnBackdrop={false}
        onConfirm={createEntry}
      />

      <Modal
        open={Boolean(viewingRemark)}
        onOpenChange={(open) => {
          if (!open) setViewingRemark(null);
        }}
        title="Full Remark"
        footer={
          <button className="btn-secondary" onClick={() => setViewingRemark(null)}>
            Close
          </button>
        }
      >
        <p className="whitespace-pre-wrap break-words text-sm text-muted">{viewingRemark?.text ?? ""}</p>
      </Modal>

      <Modal
        open={assignModalOpen}
        onOpenChange={(open) => {
          if (!groupSubmitting) setAssignModalOpen(open);
        }}
        title="Group Selected Transactions"
        dismissible={!groupSubmitting}
        closeOnBackdrop={!groupSubmitting}
        footer={
          <>
            <button className="btn-secondary" disabled={groupSubmitting} onClick={() => setAssignModalOpen(false)}>
              Cancel
            </button>
            <button
              className="btn"
              disabled={groupSubmitting || assignLabel.trim().length < 2 || selectedCount < 2}
              onClick={groupSelectedEntries}
            >
              {groupSubmitting ? "Grouping..." : "Group"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-muted">
            {selectedCount} transaction{selectedCount === 1 ? "" : "s"} will be moved under this group. Their dates,
            amounts, currencies and actors stay exactly as they are.
          </p>
          <label className="block text-sm">
            Group Label *
            <input
              className="field mt-1"
              value={assignLabel}
              maxLength={200}
              placeholder="e.g. October vendor settlement"
              onChange={(event) => setAssignLabel(event.target.value)}
            />
          </label>
          <label className="block text-sm">
            Group Remark
            <input
              className="field mt-1"
              value={assignRemark}
              maxLength={1000}
              placeholder="Optional context for this group"
              onChange={(event) => setAssignRemark(event.target.value)}
            />
          </label>
        </div>
      </Modal>

      <Modal
        open={editModalOpen}
        onOpenChange={(open) => {
          if (!createPending) setEditModalOpen(open);
        }}
        title={editingGroupId ? "Edit Grouped Transaction" : "Edit Ledger Entry"}
        size="xl"
        dismissible={!createPending}
        closeOnBackdrop={!createPending}
        onSubmitShortcut={
          createPending || !editValid ? undefined : () => setPendingEditConfirm(true)
        }
        footer={
          <>
            {editMissingHint ? (
              <p className="mr-auto w-full text-xs text-muted sm:w-auto">{editMissingHint}</p>
            ) : null}
            <button className="btn-secondary" disabled={createPending} onClick={() => setEditModalOpen(false)}>
              Cancel
            </button>
            <button
              className="btn"
              disabled={createPending || !editValid}
              onClick={() => setPendingEditConfirm(true)}
            >
              {createPending ? "Saving..." : "Continue"}
            </button>
          </>
        }
      >
        {editingGroupId ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-sm">
                Group Label *
                <input
                  className="field mt-1"
                  value={editGroupLabel}
                  onChange={(event) => setEditGroupLabel(event.target.value)}
                />
              </label>
              <label className="text-sm">
                Group Remark
                <input
                  className="field mt-1"
                  value={editGroupRemark}
                  onChange={(event) => setEditGroupRemark(event.target.value)}
                />
              </label>
            </div>

            {editGroupForms.map((form, index) => {
              const isExpanded = expandedEditTxnIndexes.has(index);
              return (
                <div
                  key={form.id ?? `new-group-entry-${index}`}
                  className="rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))]"
                >
                  <div className="flex items-center gap-2 p-3">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      aria-expanded={isExpanded}
                      onClick={() =>
                        setExpandedEditTxnIndexes((prev) => toggleExpandedIndex(prev, index))
                      }
                    >
                      <span
                        className={`shrink-0 text-muted transition-transform ${isExpanded ? "rotate-180" : ""}`}
                        aria-hidden
                      >
                        ▾
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-[rgb(var(--text))]">
                          Transaction {index + 1}
                        </span>
                        {!isExpanded ? (
                          <span className="mt-0.5 block truncate text-xs text-muted">
                            {summarizeGroupEntryForm(form, initialTypes)}
                          </span>
                        ) : null}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="btn-secondary btn-sm shrink-0"
                      disabled={editGroupForms.length <= 2 || createPending}
                      onClick={() => {
                        setEditGroupForms((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
                        setExpandedEditTxnIndexes((prev) => {
                          const next = new Set<number>();
                          for (const item of prev) {
                            if (item === index) continue;
                            next.add(item > index ? item - 1 : item);
                          }
                          return next;
                        });
                      }}
                    >
                      Remove
                    </button>
                  </div>
                  {isExpanded ? (
                    <div className="border-t border-[rgb(var(--border))] p-3">
                      <BigBookEntryFields
                        value={form}
                        onChange={(next) =>
                          setEditGroupForms((prev) =>
                            prev.map((item, itemIndex) =>
                              itemIndex === index ? { ...next, id: item.id } : item
                            )
                          )
                        }
                        types={initialTypes}
                        subTypes={initialSubTypes}
                        vendorTypes={initialVendorTypes}
                        vendors={initialVendors}
                        actionByOptions={initialActionBy}
                        pockets={initialPockets}
                        actors={initialActors}
                        currencies={currencies}
                        layout="nested"
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}

            <button
              type="button"
              className="btn-secondary"
              disabled={createPending}
              onClick={() => {
                setEditGroupForms((prev) => {
                  const next = [...prev, newEntryForm()];
                  setExpandedEditTxnIndexes(new Set([next.length - 1]));
                  return next;
                });
              }}
            >
              Add transaction
            </button>
          </div>
        ) : (
          <BigBookEntryFields
            value={editForm}
            onChange={setEditForm}
            types={initialTypes}
            subTypes={initialSubTypes}
            vendorTypes={initialVendorTypes}
            vendors={initialVendors}
            actionByOptions={initialActionBy}
            pockets={initialPockets}
            actors={initialActors}
            currencies={currencies}
            settlesEntry={editSettlesEntry}
            fetchingConversionRate={fetchingConversionRate}
            onFetchConversionRate={
              editSettlesEntry
                ? () =>
                    void fetchConversionRate(editForm.currency_code, editSettlesEntry.currency_code, (rate) =>
                      setEditForm((prev) => ({ ...prev, settlement_conversion_rate: rate }))
                    )
                : undefined
            }
          />
        )}
      </Modal>

      <ConfirmDialog
        open={pendingEditConfirm}
        onOpenChange={setPendingEditConfirm}
        title={editingGroupId ? "Save grouped transaction changes?" : "Save ledger entry changes?"}
        description={
          editingGroupId
            ? "This will update the group and all of its transactions. Removed transactions are deleted permanently."
            : "This will update the selected ledger record."
        }
        confirmLabel="Save changes"
        confirming={createPending}
        closeOnBackdrop={false}
        onConfirm={editingGroupId ? saveEditedGroup : saveEditedEntry}
      />

      <ConfirmDialog
        open={Boolean(pendingUngroup)}
        onOpenChange={(open) => {
          if (!open && !groupSubmitting) setPendingUngroup(null);
        }}
        title="Ungroup transactions?"
        description={`"${pendingUngroup?.label ?? ""}" will be removed and its transactions will become standalone records.`}
        confirmLabel="Ungroup"
        confirming={groupSubmitting}
        closeOnBackdrop={false}
        onConfirm={() => deleteGroup("ungroup")}
      />

      <ConfirmDialog
        open={Boolean(pendingDeleteGroup)}
        onOpenChange={(open) => {
          if (!open && !groupSubmitting) setPendingDeleteGroup(null);
        }}
        title="Delete grouped transaction?"
        description={`This will permanently remove "${pendingDeleteGroup?.group.label ?? ""}" along with its ${
          pendingDeleteGroup?.entries.length ?? 0
        } transaction(s) and their attachments.`}
        confirmLabel="Delete group"
        confirming={groupSubmitting}
        variant="danger"
        closeOnBackdrop={false}
        onConfirm={() => deleteGroup("cascade")}
      />

      <ConfirmDialog
        open={Boolean(pendingDeleteEntry)}
        onOpenChange={(open) => {
          if (!open && !entryDeleting) setPendingDeleteEntry(null);
        }}
        title="Delete ledger entry?"
        description="This will permanently remove the selected entry and all its attachments."
        confirmLabel="Delete"
        confirming={entryDeleting}
        variant="danger"
        closeOnBackdrop={false}
        onConfirm={deleteEntry}
      />

      <Modal
        open={Boolean(manageAttachmentsEntry)}
        onOpenChange={(open) => {
          if (!open && !uploadSubmitting && !attachmentDeleting) {
            setManageAttachmentsEntry(null);
            setManageAttachmentFiles([]);
          }
        }}
        title="Manage Attachments"
        dismissible={!uploadSubmitting && !attachmentDeleting}
        closeOnBackdrop={!uploadSubmitting && !attachmentDeleting}
        footer={
          <>
            <button
              className="btn-secondary"
              disabled={uploadSubmitting || attachmentDeleting}
              onClick={() => {
                setManageAttachmentsEntry(null);
                setManageAttachmentFiles([]);
              }}
            >
              Close
            </button>
            <button
              className="btn"
              disabled={uploadSubmitting || !(manageAttachmentFiles.length > 0) || !manageAttachmentsEntry}
              onClick={() => setPendingUploadEntryId(manageAttachmentsEntry?.id ?? null)}
            >
              {uploadSubmitting ? "Uploading..." : "Upload selected"}
            </button>
          </>
        }
      >
        {manageAttachmentsEntry ? (
          <div className="space-y-3">
            <p className="text-xs text-muted">
              {formatDateDisplay(manageAttachmentsEntry.entry_date)} · {manageAttachmentsEntry.type_name} · {manageAttachmentsEntry.explanation}
            </p>
            <input
              className="field"
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => setManageAttachmentFiles(Array.from(event.target.files ?? []))}
            />
            {manageAttachmentFiles.length ? (
              <ul className="space-y-1 rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] p-2 text-xs text-[rgb(var(--text))]">
                {manageAttachmentFiles.map((file, index) => (
                  <li key={`${file.name}-${file.size}-${index}`}>{file.name}</li>
                ))}
              </ul>
            ) : null}
            <ul className="space-y-2">
              {manageAttachmentsEntry.attachments.map((attachment) => (
                <li
                  key={attachment.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-2"
                >
                  <button
                    className="truncate text-left text-xs text-[rgb(var(--info))] underline"
                    onClick={() => void viewAttachment(attachment.id)}
                    disabled={attachmentViewingId === attachment.id}
                  >
                    {attachmentViewingId === attachment.id ? "Loading..." : attachment.file_name}
                  </button>
                  <button
                    className="text-xs text-[rgb(var(--danger))] underline"
                    onClick={() => setPendingDeleteAttachmentId(attachment.id)}
                    disabled={attachmentDeleting}
                  >
                    Delete
                  </button>
                </li>
              ))}
              {!manageAttachmentsEntry.attachments.length ? (
                <li className="text-xs text-muted">No attachments yet.</li>
              ) : null}
            </ul>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(pendingUploadEntryId)}
        onOpenChange={(open) => {
          if (!open && !uploadSubmitting) setPendingUploadEntryId(null);
        }}
        title="Upload attachment images?"
        description="Selected image files will be attached to this ledger entry."
        confirmLabel="Upload"
        confirming={uploadSubmitting}
        closeOnBackdrop={false}
        onConfirm={uploadAttachments}
      />

      <ConfirmDialog
        open={Boolean(pendingDeleteAttachmentId)}
        onOpenChange={(open) => {
          if (!open && !attachmentDeleting) setPendingDeleteAttachmentId(null);
        }}
        title="Delete attachment?"
        description="This will permanently remove the selected image."
        confirmLabel="Delete"
        confirming={attachmentDeleting}
        variant="danger"
        closeOnBackdrop={false}
        onConfirm={deleteAttachment}
      />

      <Modal
        open={Boolean(settlementTarget && settlementForm)}
        onOpenChange={(open) => {
          if (!open && !settlementSubmitting) closeRecordSettlement();
        }}
        title="Record Settlement"
        size="xl"
        dismissible={!settlementSubmitting}
        closeOnBackdrop={!settlementSubmitting}
        onSubmitShortcut={
          settlementSubmitting || settlementMissingHint
            ? undefined
            : () => setPendingSettlementConfirm(true)
        }
        footer={
          <>
            {settlementMissingHint ? (
              <p className="mr-auto w-full text-xs text-muted sm:w-auto">{settlementMissingHint}</p>
            ) : null}
            <button className="btn-secondary" disabled={settlementSubmitting} onClick={closeRecordSettlement}>
              Cancel
            </button>
            <button
              className="btn"
              disabled={settlementSubmitting || Boolean(settlementMissingHint)}
              onClick={() => setPendingSettlementConfirm(true)}
            >
              {settlementSubmitting ? "Saving..." : "Save"}
            </button>
          </>
        }
      >
        {settlementForm && settlementTargetRef ? (
          <BigBookEntryFields
            value={settlementForm}
            onChange={(next) => setSettlementForm(next)}
            types={initialTypes}
            subTypes={initialSubTypes}
            vendorTypes={initialVendorTypes}
            vendors={initialVendors}
            actionByOptions={initialActionBy}
            pockets={initialPockets}
            actors={initialActors}
            currencies={currencies}
            showAttachments
            attachmentFiles={settlementAttachmentFiles}
            onAttachmentFilesChange={setSettlementAttachmentFiles}
            onRemoveAttachmentAt={(index) =>
              setSettlementAttachmentFiles((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
            }
            explanationPlaceholder="What does this settlement payment cover?"
            settlesEntry={settlementTargetRef}
            hideCreditToggle
            fetchingConversionRate={fetchingConversionRate}
            onFetchConversionRate={() =>
              void fetchConversionRate(settlementForm.currency_code, settlementTargetRef.currency_code, (rate) =>
                setSettlementForm((prev) => (prev ? { ...prev, settlement_conversion_rate: rate } : prev))
              )
            }
          />
        ) : null}
      </Modal>

      <ConfirmDialog
        open={pendingSettlementConfirm}
        onOpenChange={setPendingSettlementConfirm}
        title="Record settlement?"
        description={
          settlementTarget
            ? settlementForm?.close_credit
              ? `This will create a settlement entry against "${settlementTarget.explanation}" and mark that credit as settled.`
              : `This will create a settlement entry against "${settlementTarget.explanation}". The credit stays open until marked settled.`
            : "This will create a settlement entry."
        }
        confirmLabel="Record Settlement"
        confirming={settlementSubmitting}
        closeOnBackdrop={false}
        onConfirm={recordSettlement}
      />

      <Modal
        open={Boolean(creditClosureDialog)}
        onOpenChange={(open) => {
          if (!open && !creditClosureSubmitting) {
            setCreditClosureDialog(null);
            setCreditClosureNote("");
          }
        }}
        title={
          creditClosureDialog?.settled ? "Mark credit as settled?" : "Reopen credit?"
        }
        dismissible={!creditClosureSubmitting}
        closeOnBackdrop={!creditClosureSubmitting}
        footer={
          <>
            <button
              type="button"
              className="btn-secondary"
              disabled={creditClosureSubmitting}
              onClick={() => {
                setCreditClosureDialog(null);
                setCreditClosureNote("");
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn"
              disabled={creditClosureSubmitting}
              onClick={() => void submitCreditClosure()}
            >
              {creditClosureSubmitting
                ? "Saving…"
                : creditClosureDialog?.settled
                  ? "Mark Settled"
                  : "Reopen"}
            </button>
          </>
        }
      >
        {creditClosureDialog ? (
          <div className="space-y-3 text-sm">
            <p className="text-muted">
              {creditClosureDialog.settled
                ? `Close "${creditClosureDialog.entry.explanation}" as settled. Payment amounts do not need to match the credit.`
                : `Reopen "${creditClosureDialog.entry.explanation}" so it appears in Outstanding again.`}
            </p>
            {creditClosureDialog.settled ? (
              <label className="block text-sm">
                Closure Note
                <input
                  className="field mt-1"
                  value={creditClosureNote}
                  onChange={(event) => setCreditClosureNote(event.target.value)}
                  placeholder="Why is this credit being closed? (optional)"
                />
              </label>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(settlementHistoryEntryId)}
        onOpenChange={(open) => {
          if (!open && !settlementDeleting) setSettlementHistoryEntryId(null);
        }}
        title="Settlement History"
        dismissible={!settlementDeleting}
        closeOnBackdrop={!settlementDeleting}
        footer={
          <button
            className="btn-secondary"
            disabled={settlementDeleting}
            onClick={() => setSettlementHistoryEntryId(null)}
          >
            Close
          </button>
        }
      >
        {settlementHistoryEntry ? (
          <div className="space-y-3">
            <div className="rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] p-3 text-sm">
              <p className="font-medium">{settlementHistoryEntry.explanation}</p>
              <p className="mt-1 text-xs text-muted">
                {formatDateDisplay(settlementHistoryEntry.entry_date)}
                {settlementHistoryEntry.vendor_name ? ` · ${settlementHistoryEntry.vendor_name}` : ""}
                {" · "}
                Status: {CREDIT_STATUS_LABELS[settlementHistoryEntry.credit_status ?? "open"]}
              </p>
              <p className="mt-2 text-xs text-muted">
                Credit:{" "}
                {formatAmount(settlementHistoryEntry.amount, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 4
                })}{" "}
                {settlementHistoryEntry.currency_code} · Total recorded payments:{" "}
                {formatAmount(settlementHistoryEntry.total_settled, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 4
                })}{" "}
                {settlementHistoryEntry.currency_code} · Variance (informational):{" "}
                {formatAmount(
                  settlementHistoryEntry.total_settled - settlementHistoryEntry.amount,
                  {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 4
                  }
                )}{" "}
                {settlementHistoryEntry.currency_code}
              </p>
              {settlementHistoryEntry.credit_settlement_note ? (
                <p className="mt-1 text-xs text-muted">
                  Closure note: {settlementHistoryEntry.credit_settlement_note}
                </p>
              ) : null}
            </div>
            <ul className="space-y-2">
              {settlementHistoryEntry.settlements.map((settlement) => {
                const settlementEntry = findEntryById(settlement.id);
                return (
                  <li
                    key={settlement.id}
                    className="rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3 text-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">
                          {formatDateDisplay(settlement.entry_date)} ·{" "}
                          {formatAmount(settlement.amount, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 4
                          })}{" "}
                          {settlement.currency_code}
                        </p>
                        <p className="mt-1 text-xs text-muted">{settlement.explanation}</p>
                        <p className="mt-1 text-xs text-muted">
                          Rate:{" "}
                          {formatAmount(settlement.settlement_conversion_rate, {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 8
                          })}{" "}
                          · Equivalent:{" "}
                          {formatAmount(settlement.settlement_amount_in_credit_currency, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 4
                          })}{" "}
                          {settlementHistoryEntry.currency_code}
                        </p>
                        {settlement.settlement_note ? (
                          <p className="mt-1 text-xs text-muted">Note: {settlement.settlement_note}</p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        {settlementEntry ? (
                          <button
                            type="button"
                            className="text-xs text-[rgb(var(--info))] underline"
                            disabled={settlementDeleting}
                            onClick={() => {
                              setSettlementHistoryEntryId(null);
                              startEditEntry(settlementEntry);
                            }}
                          >
                            Edit
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="text-xs text-[rgb(var(--danger))] underline"
                          disabled={settlementDeleting}
                          onClick={() => setPendingDeleteSettlementId(settlement.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
              {!settlementHistoryEntry.settlements.length ? (
                <li className="text-xs text-muted">No settlements recorded yet.</li>
              ) : null}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-muted">
            This credit is no longer on the current page. Close this dialog and reopen it from the record.
          </p>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(pendingDeleteSettlementId)}
        onOpenChange={(open) => {
          if (!open && !settlementDeleting) setPendingDeleteSettlementId(null);
        }}
        title="Delete settlement?"
        description="This will permanently remove the settlement entry. The parent credit's open/settled status is unchanged."
        confirmLabel="Delete"
        confirming={settlementDeleting}
        variant="danger"
        closeOnBackdrop={false}
        onConfirm={deleteSettlement}
      />
    </div>
  );
}
