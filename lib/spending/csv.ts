import {
  detectDelimiter,
  normalizeHeader,
  normalizeOptional,
  normalizeRequired,
  parseAmount,
  parseDate,
  parseDelimitedRows,
  unwrapExcelSingleColumn
} from "@/lib/csv/primitives";
import { spendingCurrencySchema } from "@/lib/validation/expense";

const REQUIRED_HEADERS = [
  "date",
  "type",
  "category",
  "description",
  "staff",
  "currency",
  "amount",
  "cash_flow",
  "remarks"
] as const;

/** Full import column order. type / category / description / staff / remarks may be blank. */
export const SPENDING_CSV_HEADERS = [
  "date",
  "type",
  "category",
  "description",
  "staff",
  "currency",
  "amount",
  "cash_flow",
  "remarks"
] as const;

export const SPENDING_CSV_EXPORT_HEADERS = [...SPENDING_CSV_HEADERS, "source", "created_by_name"] as const;

export type ParsedSpendingCsvRow = {
  expense_date: string;
  entry_direction: "spending" | "profit";
  currency_code: "IDR" | "MYR" | "USDT" | "TRX";
  type_name: string | null;
  category_name: string | null;
  staff_name: string | null;
  amount: number;
  description: string | null;
  remarks: string | null;
};

export type ParseSpendingCsvResult = {
  rows: ParsedSpendingCsvRow[];
  errors: string[];
};

export function buildSpendingImportTemplateCsv(): string {
  const outflowRow = [
    "2026-04-25",
    "Ads",
    "Facebook",
    "April boost",
    "John",
    "IDR",
    "150000",
    "spending",
    "INV-001"
  ];
  const inflowRow = ["2026-04-26", "", "Ads", "Rebate", "", "IDR", "50000", "profit", ""];
  const uncategorizedRow = ["2026-04-27", "", "", "Misc cash out", "", "USDT", "25", "spending", ""];
  // UTF-8 BOM helps Excel on Windows keep columns when opening the template.
  return `\uFEFF${[SPENDING_CSV_HEADERS.join(","), outflowRow.join(","), inflowRow.join(","), uncategorizedRow.join(",")].join("\r\n")}\r\n`;
}

export function parseSpendingCsv(content: string): ParseSpendingCsvResult {
  const withoutBom = content.replace(/^\uFEFF/, "");
  const normalizedContent = unwrapExcelSingleColumn(withoutBom, REQUIRED_HEADERS);
  const rows = parseDelimitedRows(normalizedContent, detectDelimiter(normalizedContent, REQUIRED_HEADERS));
  if (!rows.length) {
    return { rows: [], errors: ["CSV file is empty."] };
  }

  const headers = rows[0].map(normalizeHeader);
  const headerMap = new Map<string, number>();
  headers.forEach((header, index) => headerMap.set(header, index));

  const errors: string[] = [];
  for (const required of REQUIRED_HEADERS) {
    if (!headerMap.has(required)) {
      errors.push(`Missing required header: ${required}`);
    }
  }
  if (errors.length) return { rows: [], errors };

  const dataRows = rows.slice(1);
  const parsedRows: ParsedSpendingCsvRow[] = [];

  for (let index = 0; index < dataRows.length; index += 1) {
    const lineNumber = index + 2;
    const values = dataRows[index];
    const get = (header: (typeof REQUIRED_HEADERS)[number]) => values[headerMap.get(header) ?? -1];

    const expenseDateRaw = normalizeRequired(get("date"));
    const cashFlowRaw = normalizeRequired(get("cash_flow"));
    const currencyRaw = normalizeRequired(get("currency")).toUpperCase();
    const typeName = normalizeOptional(get("type"));
    const categoryName = normalizeOptional(get("category"));
    const staffName = normalizeOptional(get("staff"));
    const amountRaw = normalizeRequired(get("amount"));
    const description = normalizeOptional(get("description"));
    const remarks = normalizeOptional(get("remarks"));

    if (!expenseDateRaw || !cashFlowRaw || !amountRaw || !currencyRaw) {
      errors.push(`Row ${lineNumber}: date, cash_flow, currency, and amount are required.`);
      continue;
    }

    const expenseDate = parseDate(expenseDateRaw);
    if (!expenseDate) {
      errors.push(`Row ${lineNumber}: date must use YYYY-MM-DD or YYYY-MMM-DD format.`);
      continue;
    }

    const direction = cashFlowRaw.toLowerCase();
    if (direction !== "spending" && direction !== "profit") {
      errors.push(`Row ${lineNumber}: cash_flow must be 'spending' or 'profit'.`);
      continue;
    }

    const currencyParsed = spendingCurrencySchema.safeParse(currencyRaw);
    if (!currencyParsed.success) {
      errors.push(`Row ${lineNumber}: currency must be one of IDR, MYR, USDT, TRX.`);
      continue;
    }

    const amount = parseAmount(amountRaw);
    if (amount === null) {
      errors.push(`Row ${lineNumber}: amount must be a number greater than 0.`);
      continue;
    }

    parsedRows.push({
      expense_date: expenseDate,
      entry_direction: direction,
      currency_code: currencyParsed.data,
      type_name: typeName,
      category_name: categoryName,
      staff_name: staffName,
      amount,
      description,
      remarks
    });
  }

  return { rows: parsedRows, errors };
}

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

/** Key matching uq_expenses_dedupe (expression-based uniqueness). */
export function spendingDedupeKey(row: {
  entry_direction: string;
  expense_date: string;
  currency_code: string;
  amount: number;
  category_id: string;
  type_id: string | null;
  staff_id: string | null;
  description: string | null;
  remarks: string | null;
}): string {
  return [
    row.entry_direction,
    row.expense_date,
    row.currency_code,
    String(row.amount),
    row.category_id,
    row.type_id ?? NIL_UUID,
    row.staff_id ?? NIL_UUID,
    (row.description ?? "").trim(),
    (row.remarks ?? "").trim()
  ].join("|");
}
