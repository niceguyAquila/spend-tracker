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

export type BigBookActor = {
  id: string;
  actor_code: "A" | "B";
  display_name: string;
  user_id: string | null;
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

export type BigBookEntry = {
  id: string;
  entry_date: string;
  entry_direction: "spending" | "profit";
  entry_type_id: string;
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
  actor_code: "A" | "B";
  actor_display_name: string;
  creator_display_name: string;
  updater_display_name: string;
  attachments: BigBookAttachment[];
};

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
