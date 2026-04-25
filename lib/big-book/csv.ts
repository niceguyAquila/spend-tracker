import { bigBookCurrencySchema, bigBookEntryDirectionSchema } from "@/lib/validation/big-book";

const REQUIRED_HEADERS = [
  "entry_date",
  "entry_direction",
  "type_name",
  "explanation",
  "amount",
  "currency_code",
  "remark",
  "actor_name"
] as const;

type AllowedCurrency = "IDR" | "MYR" | "USDT" | "TRX";
type AllowedDirection = "spending" | "profit";

export type ParsedBigBookCsvRow = {
  entry_date: string;
  entry_direction: AllowedDirection;
  type_name: string;
  explanation: string;
  amount: number;
  currency_code: AllowedCurrency;
  remark: string | null;
  actor_name: string;
};

export type ParseBigBookCsvResult = {
  rows: ParsedBigBookCsvRow[];
  errors: string[];
};

function parseDelimitedRows(content: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    if (char === '"') {
      if (inQuotes && content[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && char === delimiter) {
      row.push(current);
      current = "";
      continue;
    }
    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && content[i + 1] === "\n") i += 1;
      row.push(current);
      if (row.some((value) => value.trim().length > 0)) {
        rows.push(row);
      }
      row = [];
      current = "";
      continue;
    }
    current += char;
  }

  row.push(current);
  if (row.some((value) => value.trim().length > 0)) {
    rows.push(row);
  }
  return rows;
}

function normalizeRequired(value: string | undefined) {
  return (value ?? "").trim();
}

function normalizeOptional(value: string | undefined) {
  const trimmed = normalizeRequired(value);
  return trimmed.length ? trimmed : null;
}

function parseDate(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null;
  return value;
}

function parseAmount(value: string): number | null {
  const parsed = Number(value.replace(/,/g, ""));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

export function parseBigBookCsv(content: string): ParseBigBookCsvResult {
  const rows = parseDelimitedRows(content, ",");
  if (!rows.length) {
    return { rows: [], errors: ["CSV file is empty."] };
  }

  const headers = rows[0].map((header) => header.trim());
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
  const parsedRows: ParsedBigBookCsvRow[] = [];

  for (let index = 0; index < dataRows.length; index += 1) {
    const lineNumber = index + 2;
    const values = dataRows[index];
    const get = (header: (typeof REQUIRED_HEADERS)[number]) => values[headerMap.get(header) ?? -1];

    const entryDateRaw = normalizeRequired(get("entry_date"));
    const entryDirectionRaw = normalizeRequired(get("entry_direction"));
    const typeName = normalizeRequired(get("type_name"));
    const explanation = normalizeRequired(get("explanation"));
    const amountRaw = normalizeRequired(get("amount"));
    const currencyRaw = normalizeRequired(get("currency_code")).toUpperCase();
    const remark = normalizeOptional(get("remark"));
    const actorName = normalizeRequired(get("actor_name"));

    if (!entryDateRaw || !entryDirectionRaw || !typeName || !explanation || !amountRaw || !currencyRaw || !actorName) {
      errors.push(`Row ${lineNumber}: required fields must not be empty.`);
      continue;
    }

    const entryDate = parseDate(entryDateRaw);
    if (!entryDate) {
      errors.push(`Row ${lineNumber}: entry_date must be in YYYY-MM-DD format.`);
      continue;
    }

    const directionParsed = bigBookEntryDirectionSchema.safeParse(entryDirectionRaw.toLowerCase());
    if (!directionParsed.success) {
      errors.push(`Row ${lineNumber}: entry_direction must be 'spending' or 'profit'.`);
      continue;
    }

    const amount = parseAmount(amountRaw);
    if (amount === null) {
      errors.push(`Row ${lineNumber}: amount must be a number greater than 0.`);
      continue;
    }

    const currencyParsed = bigBookCurrencySchema.safeParse(currencyRaw);
    if (!currencyParsed.success) {
      errors.push(`Row ${lineNumber}: currency_code must be one of IDR, MYR, USDT, TRX.`);
      continue;
    }

    parsedRows.push({
      entry_date: entryDate,
      entry_direction: directionParsed.data,
      type_name: typeName,
      explanation,
      amount,
      currency_code: currencyParsed.data,
      remark,
      actor_name: actorName
    });
  }

  return { rows: parsedRows, errors };
}
