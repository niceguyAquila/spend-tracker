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

const REQUIRED_HEADERS = [
  "expense_date",
  "entry_direction",
  "category_name",
  "subcategory_name",
  "amount",
  "note",
  "reference"
] as const;

/** Full import column order. category_name / subcategory_name / note / reference may be blank. */
export const SPENDING_CSV_HEADERS = [
  "expense_date",
  "entry_direction",
  "category_name",
  "subcategory_name",
  "amount",
  "note",
  "reference"
] as const;

export const SPENDING_CSV_EXPORT_HEADERS = [...SPENDING_CSV_HEADERS, "source", "created_by_name"] as const;

export type ParsedSpendingCsvRow = {
  expense_date: string;
  entry_direction: "spending" | "profit";
  category_name: string | null;
  subcategory_name: string | null;
  amount: number;
  note: string | null;
  reference: string | null;
};

export type ParseSpendingCsvResult = {
  rows: ParsedSpendingCsvRow[];
  errors: string[];
};

export function buildSpendingImportTemplateCsv(): string {
  const outflowRow = ["2026-04-25", "spending", "Ads", "Facebook", "150000", "April boost", "INV-001"];
  const inflowRow = ["2026-04-26", "profit", "Ads", "", "50000", "Rebate", ""];
  const uncategorizedRow = ["2026-04-27", "spending", "", "", "25000", "Misc cash out", ""];
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

    const expenseDateRaw = normalizeRequired(get("expense_date"));
    const entryDirectionRaw = normalizeRequired(get("entry_direction"));
    const categoryName = normalizeOptional(get("category_name"));
    const subcategoryName = normalizeOptional(get("subcategory_name"));
    const amountRaw = normalizeRequired(get("amount"));
    const note = normalizeOptional(get("note"));
    const reference = normalizeOptional(get("reference"));

    if (!expenseDateRaw || !entryDirectionRaw || !amountRaw) {
      errors.push(`Row ${lineNumber}: expense_date, entry_direction, and amount are required.`);
      continue;
    }

    const expenseDate = parseDate(expenseDateRaw);
    if (!expenseDate) {
      errors.push(`Row ${lineNumber}: expense_date must use YYYY-MM-DD or YYYY-MMM-DD format.`);
      continue;
    }

    const direction = entryDirectionRaw.toLowerCase();
    if (direction !== "spending" && direction !== "profit") {
      errors.push(`Row ${lineNumber}: entry_direction must be 'spending' or 'profit'.`);
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
      category_name: categoryName,
      subcategory_name: subcategoryName,
      amount,
      note,
      reference
    });
  }

  return { rows: parsedRows, errors };
}

/** Key matching uq_expenses_dedupe (expression-based uniqueness). */
export function spendingDedupeKey(row: {
  entry_direction: string;
  expense_date: string;
  amount: number;
  category_id: string;
  subcategory_id: string;
  note: string | null;
  reference: string | null;
}): string {
  return [
    row.entry_direction,
    row.expense_date,
    String(row.amount),
    row.category_id,
    row.subcategory_id,
    (row.note ?? "").trim(),
    (row.reference ?? "").trim()
  ].join("|");
}
