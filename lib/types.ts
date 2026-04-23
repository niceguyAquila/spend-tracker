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
};
