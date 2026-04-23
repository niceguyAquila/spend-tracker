export type ExpenseCategory = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
};

export type ExpenseSubcategory = {
  id: string;
  category_id: string;
  name: string;
  is_active: boolean;
};

export type Expense = {
  id: string;
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
