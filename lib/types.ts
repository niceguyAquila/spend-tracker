export type AppRole = "admin" | "finance" | "viewer";

export type Brand = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
};

export type UserBrandRole = {
  brand_id: string;
  role: AppRole;
  is_active: boolean;
  brand: Brand;
};

export type ExpenseCategory = {
  id: string;
  brand_id: string;
  code: string;
  name: string;
  is_active: boolean;
};

export type ExpenseSubcategory = {
  id: string;
  brand_id: string;
  category_id: string;
  name: string;
  is_active: boolean;
};

export type Expense = {
  id: string;
  brand_id: string;
  expense_date: string;
  month_key: string;
  entry_direction: "spending" | "profit";
  amount: number;
  category_id: string;
  subcategory_id: string;
  note: string | null;
  reference: string | null;
  source: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ExpenseWithNames = Expense & {
  category_name: string;
  subcategory_name: string;
  creator_display_name: string;
  updater_display_name: string;
};

export type DashboardReportRow = {
  category_id: string;
  category_name: string;
  subcategory_id: string;
  subcategory_name: string;
  month_key: string;
  entry_direction: "spending" | "profit";
  amount: number;
};

export type WebTransaction = {
  id: string;
  brand_id: string;
  source_system: "backoffice" | "payment_gateway";
  create_time: string;
  last_update_time: string;
  external_txn_no: string;
  client_order_no: string | null;
  aggregator_order_no: string | null;
  raw_status: string;
  canonical_status: string;
  raw_type: string;
  canonical_type: string;
  product_type: string;
  currency_code: string;
  original_amount: number;
  amount: number;
  crypto_currency_code: string | null;
  crypto_amount: number | null;
  merchant_name: string | null;
  merchant_rate: number | null;
  merchant_fee: number | null;
  raw_payload: Record<string, string> | null;
  source_file_name: string | null;
  imported_at: string;
};

export type WebTransactionMetrics = {
  total_count: number;
  successful_count: number;
  gross_amount: number;
  fee_amount: number;
  net_amount: number;
  payin_count: number;
  payin_amount: number;
  payout_count: number;
  payout_amount: number;
};

export type WebTransactionComparisonOutcome =
  | "matched"
  | "mismatched"
  | "missing_in_backoffice"
  | "missing_in_gateway";

export type WebTransactionComparisonRow = {
  comparison_key: string;
  transaction_no: string;
  canonical_type: string;
  outcome: WebTransactionComparisonOutcome;
  status_matches: boolean;
  type_matches: boolean;
  amount_matches: boolean;
  backoffice: Pick<WebTransaction, "id" | "create_time" | "canonical_status" | "canonical_type" | "amount"> | null;
  payment_gateway: Pick<WebTransaction, "id" | "create_time" | "canonical_status" | "canonical_type" | "amount"> | null;
};

export type WebTransactionComparisonSourceMetrics = {
  total_count: number;
  total_amount: number;
  payin_count: number;
  payin_amount: number;
  payout_count: number;
  payout_amount: number;
};

export type WebTransactionComparisonMetrics = {
  backoffice: WebTransactionComparisonSourceMetrics;
  payment_gateway: WebTransactionComparisonSourceMetrics;
  matched_count: number;
  mismatched_count: number;
  missing_in_backoffice_count: number;
  missing_in_gateway_count: number;
};

export type WebTransactionComparisonResult = {
  rows: WebTransactionComparisonRow[];
  metrics: WebTransactionComparisonMetrics;
};

export type BigBookLedgerType = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type BigBookLedgerSubType = {
  id: string;
  entry_type_id: string;
  code: string;
  name: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
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
  linked_brand_id: string | null;
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
};

export type BigBookCreditStatus = "open" | "settled";

export type BigBookSettlementRef = {
  id: string;
  entry_date: string;
  amount: number;
  currency_code: "IDR" | "MYR" | "USDT" | "TRX";
  settlement_conversion_rate: number;
  settlement_amount_in_credit_currency: number;
  settlement_note: string | null;
  explanation: string;
};

export type BigBookSettlementTargetRef = {
  id: string;
  entry_date: string;
  explanation: string;
  amount: number;
  currency_code: "IDR" | "MYR" | "USDT" | "TRX";
  vendor_name: string | null;
  credit_status: BigBookCreditStatus;
  credit_settled_at: string | null;
};

export type BigBookEntry = {
  id: string;
  group_id: string | null;
  entry_date: string;
  entry_direction: "spending" | "profit";
  entry_type_id: string;
  entry_sub_type_id: string | null;
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
  settles_entry_id: string | null;
  settlement_conversion_rate: number | null;
  settlement_amount_in_credit_currency: number | null;
  settlement_note: string | null;
  credit_settled_at: string | null;
  credit_settled_by: string | null;
  credit_settlement_note: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  type_name: string;
  type_code: string;
  sub_type_name: string | null;
  sub_type_code: string | null;
  vendor_type_name: string | null;
  vendor_name: string | null;
  pocket_name: string | null;
  action_by_name: string | null;
  actor_code: "A" | "B";
  actor_display_name: string;
  creator_display_name: string;
  updater_display_name: string;
  credit_settled_by_display_name: string;
  attachments: BigBookAttachment[];
  total_settled: number;
  credit_status: BigBookCreditStatus | null;
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
  big_book_net: number;
  web_spending_net: number;
  linked_brand_id: string | null;
  linked_brand_name: string | null;
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
  actor_id: string;
  actor_code: "A" | "B";
  actor_display_name: string;
  currency: BigBookCashflowCurrency;
  outstanding: number;
  open_credit_count: number;
};

export type CreditBookLedgerType = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type CreditBookLedgerSubType = {
  id: string;
  entry_type_id: string;
  code: string;
  name: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type CreditBookActor = {
  id: string;
  actor_code: "A" | "B";
  display_name: string;
  user_id: string | null;
};

export type CreditBookAttachment = {
  id: string;
  ledger_entry_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  uploaded_by: string | null;
  created_at: string;
};

export type CreditBookSettlementAttachment = {
  id: string;
  settlement_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  uploaded_by: string | null;
  created_at: string;
};

export type CreditBookSettlement = {
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
  creator_display_name: string;
  updater_display_name: string;
  attachments: CreditBookSettlementAttachment[];
};

export type CreditBookEntryStatus = "open" | "partial" | "settled";

export type CreditBookEntry = {
  id: string;
  entry_date: string;
  entry_direction: "credit" | "debt";
  entry_type_id: string;
  entry_sub_type_id: string | null;
  explanation: string;
  amount: number;
  currency_code: "IDR" | "MYR" | "USDT" | "TRX";
  remark: string | null;
  responsible_actor_id: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  type_name: string;
  type_code: string;
  sub_type_name: string | null;
  sub_type_code: string | null;
  actor_code: "A" | "B";
  actor_display_name: string;
  creator_display_name: string;
  updater_display_name: string;
  attachments: CreditBookAttachment[];
  total_settled: number;
  outstanding: number;
  status: CreditBookEntryStatus;
  settlements: CreditBookSettlement[];
};

export type CreditBookAllowedUserOption = {
  id: string;
  display_name: string;
  email: string;
};

export type CreditBookActorCurrencyMetrics = {
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

export type CreditBookActorOutstandingMetrics = {
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

export type CreditBookCashflowCurrency = "IDR" | "MYR" | "USDT" | "TRX";

export type CreditBookTypeCashflowRow = {
  row_key: string;
  actor_id: string;
  actor_display_name: string;
  type_id: string;
  type_code: string;
  type_name: string;
  inflow: number;
  outflow: number;
  net: number;
  outstanding: number;
};

export type CreditBookTypeCashflowByCurrency = {
  currency: CreditBookCashflowCurrency;
  rows: CreditBookTypeCashflowRow[];
  combined: {
    inflow: number;
    outflow: number;
    net: number;
    outstanding: number;
  };
};
