export type AppRole = "admin" | "finance" | "viewer";


export type BigBookLedgerType = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

/** Invoice PIC + PDF styling preset for a ledger type (group). */
export type BigBookLedgerTypeInvoiceProfile = {
  type_id: string;
  pic_name: string;
  pic_passport: string;
  pic_address: string;
  pic_phone: string;
  bill_to_company: string;
  background_color: string | null;
  created_at: string;
  updated_at: string;
  type_name?: string;
  type_code?: string;
  type_is_active?: boolean;
};

export type BigBookVendorType = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

/** 1:1 Type → Vendor Type mapping used to auto-fill Vendor Type on ledger create/edit. */
export type BigBookTypeVendorTypeMap = {
  id: string;
  entry_type_id: string;
  vendor_type_id: string;
  created_at: string;
  updated_at: string;
  type_name?: string;
  type_code?: string;
  vendor_type_name?: string;
  vendor_type_code?: string;
};

export type BigBookActionBy = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type BigBookVendor = {
  id: string;
  vendor_type_id: string;
  code: string;
  name: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type BigBookActor = {
  id: string;
  actor_code: "A" | "B";
  display_name: string;
  user_id: string | null;
};

export type BigBookActorPocket = {
  id: string;
  actor_id: string;
  code: string;
  name: string;
  currency_code: "IDR";
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

/** Payment wallet printed on invoice PDF notes (Settings CRUD). */
export type BigBookInvoiceWallet = {
  id: string;
  name: string;
  network: string;
  address: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type BigBookAttachment = {
  id: string;
  ledger_entry_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  uploaded_by: string | null;
  created_at: string;
};

export type BigBookEntryGroup = {
  id: string;
  label: string;
  remark: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  updater_display_name: string;
};

export type BigBookEntryAuditAction = "insert" | "update" | "delete";

export type BigBookEntryAuditLog = {
  id: string;
  entry_id: string;
  action: BigBookEntryAuditAction;
  changed_by: string | null;
  changed_at: string;
  old_row: Record<string, unknown> | null;
  new_row: Record<string, unknown> | null;
  changer_display_name: string;
};

export type BigBookCreditStatus = "open" | "settled";
export type BigBookDebtStatus = "open" | "settled";

export type BigBookSettlementRef = {
  id: string;
  entry_date: string;
  amount: number;
  currency_code: "IDR" | "MYR" | "USDT" | "TRX";
  /** Null when USDT settle omitted optional FX rate. */
  settlement_conversion_rate: number | null;
  settlement_amount_in_credit_currency: number | null;
  settlement_note: string | null;
  explanation: string;
  updated_at: string;
};

export type BigBookSettlementTargetRef = {
  id: string;
  entry_date: string;
  explanation: string;
  amount: number;
  currency_code: "IDR" | "MYR" | "USDT" | "TRX";
  vendor_name: string | null;
  /** True when the settlement target is a debt obligation (pay outflow). */
  is_debt: boolean;
  /** True when the settlement target is Future Credit (still settleable; excluded from cash totals until actualized). */
  is_future_credit: boolean;
  credit_status: BigBookCreditStatus | null;
  credit_settled_at: string | null;
  debt_status: BigBookDebtStatus | null;
  debt_settled_at: string | null;
};

export type BigBookEntry = {
  id: string;
  group_id: string | null;
  entry_date: string;
  entry_direction: "spending" | "profit";
  entry_type_id: string;
  vendor_type_id: string | null;
  vendor_id: string | null;
  pocket_id: string | null;
  action_by_id: string | null;
  explanation: string;
  amount: number;
  currency_code: "IDR" | "MYR" | "USDT" | "TRX";
  remark: string | null;
  responsible_actor_id: string;
  is_credit: boolean;
  /** True when credit is not yet actualized (excluded from cash totals). Implies is_credit. */
  is_future_credit: boolean;
  is_debt: boolean;
  settles_entry_id: string | null;
  settlement_conversion_rate: number | null;
  settlement_amount_in_credit_currency: number | null;
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
  type_name: string;
  type_code: string;
  vendor_type_name: string | null;
  vendor_name: string | null;
  pocket_name: string | null;
  action_by_name: string | null;
  actor_code: "A" | "B";
  actor_display_name: string;
  creator_display_name: string;
  updater_display_name: string;
  credit_settled_by_display_name: string;
  debt_settled_by_display_name: string;
  attachments: BigBookAttachment[];
  total_settled: number;
  credit_status: BigBookCreditStatus | null;
  debt_status: BigBookDebtStatus | null;
  settlements: BigBookSettlementRef[];
  settles_entry: BigBookSettlementTargetRef | null;
};

export type BigBookLedgerRow =
  | { kind: "entry"; sort_date: string; entry: BigBookEntry }
  | { kind: "group"; sort_date: string; group: BigBookEntryGroup; entries: BigBookEntry[] };

export type BigBookAllowedUserOption = {
  id: string;
  display_name: string;
  email: string;
};

export type BigBookActorCurrencyMetrics = {
  actor_id: string;
  actor_code: "A" | "B";
  actor_display_name: string;
  totals: {
    IDR: number;
    MYR: number;
    USDT: number;
    TRX: number;
  };
};

export type BigBookPocketMetrics = {
  pocket_id: string;
  pocket_name: string;
  is_active: boolean;
  net: number;
};

export type BigBookActorPocketMetrics = {
  actor_id: string;
  actor_code: "A" | "B";
  actor_display_name: string;
  pockets: BigBookPocketMetrics[];
};

export type BigBookMonthlyCurrencyRow = {
  month_index: number;
  month_label: string;
  totals: {
    IDR: number;
    MYR: number;
    USDT: number;
  };
};

export type BigBookCashflowCurrency = "IDR" | "MYR" | "USDT" | "TRX";

export type BigBookTypeCashflowRow = {
  row_key: string;
  actor_id: string;
  actor_display_name: string;
  type_id: string;
  type_code: string;
  type_name: string;
  inflow: number;
  outflow: number;
  net: number;
};

export type BigBookTypeCashflowByCurrency = {
  currency: BigBookCashflowCurrency;
  rows: BigBookTypeCashflowRow[];
  combined: {
    inflow: number;
    outflow: number;
    net: number;
  };
};

export type BigBookVendorActorOutstandingRow = {
  row_key: string;
  vendor_id: string | null;
  vendor_name: string;
  vendor_type_id: string | null;
  vendor_type_name: string;
  /**
   * Ledger entry type. Credit and Future Credit outstanding are both bucketed by
   * ledger Type + Actor + Currency.
   */
  entry_type_id: string | null;
  type_name: string;
  actor_id: string;
  actor_code: "A" | "B";
  actor_display_name: string;
  currency: BigBookCashflowCurrency;
  outstanding: number;
  open_credit_count: number;
  /**
   * For Future Credit outstanding rows this equals open_credit_count.
   * For actualized Credit outstanding rows this is always 0 (Future is aggregated separately).
   */
  open_future_credit_count: number;
};

export type BigBookVendorActorOutstandingDebtRow = {
  row_key: string;
  /** Set when open debts belong to a ledger group; null for standalone debts. */
  group_id: string | null;
  group_label: string;
  /** Standalone (ungrouped) open debt id; null when row is a group aggregate. */
  entry_id: string | null;
  vendor_type_id: string | null;
  vendor_type_name: string;
  actor_id: string;
  actor_code: "A" | "B";
  actor_display_name: string;
  currency: BigBookCashflowCurrency;
  outstanding: number;
  open_debt_count: number;
};

export type BigBookVendorActorOutstandingEntry = {
  id: string;
  entry_date: string;
  entry_direction: "spending" | "profit";
  entry_type_id: string | null;
  type_name: string;
  /** Populated for actualized Credit detail rows (vendor type buckets). */
  vendor_name?: string;
  explanation: string;
  amount: number;
  currency_code: BigBookCashflowCurrency;
  remark: string | null;
  is_future_credit: boolean;
  /** Optimistic-lock timestamp for Actualize / settle mutations. */
  updated_at: string;
};

export type BigBookVendorActorOutstandingEntriesResult = {
  rows: BigBookVendorActorOutstandingEntry[];
  totalCount: number;
};

export type BigBookVendorActorOutstandingDebtEntriesResult = {
  rows: BigBookVendorActorOutstandingEntry[];
  totalCount: number;
};
