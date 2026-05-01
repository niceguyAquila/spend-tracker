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

const OPTIONAL_HEADERS = ["sub_type_name"] as const;

type AllowedCurrency = "IDR" | "MYR" | "USDT" | "TRX";
type AllowedDirection = "spending" | "profit";

export type ParsedBigBookCsvRow = {
  entry_date: string;
  entry_direction: AllowedDirection;
  type_name: string;
  sub_type_name: string | null;
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
  const isoCandidate = value.trim();
  const monthNameCandidate = value.trim().match(/^(\d{4})-([A-Za-z]{3})-(\d{2})$/);
  let normalized = isoCandidate;

  if (monthNameCandidate) {
    const monthMap: Record<string, string> = {
      jan: "01",
      feb: "02",
      mar: "03",
      apr: "04",
      may: "05",
      jun: "06",
      jul: "07",
      aug: "08",
      sep: "09",
      oct: "10",
      nov: "11",
      dec: "12"
    };
    const [, year, monthShortRaw, day] = monthNameCandidate;
    const monthShort = monthShortRaw.toLowerCase();
    const month = monthMap[monthShort];
    if (!month) return null;
    normalized = `${year}-${month}-${day}`;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const date = new Date(`${normalized}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  const [year, month, day] = normalized.split("-").map(Number);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null;
  return normalized;
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
    const get = (header: (typeof REQUIRED_HEADERS)[number] | (typeof OPTIONAL_HEADERS)[number]) =>
      values[headerMap.get(header) ?? -1];

    const entryDateRaw = normalizeRequired(get("entry_date"));
    const entryDirectionRaw = normalizeRequired(get("entry_direction"));
    const typeName = normalizeRequired(get("type_name"));
    const subTypeName = normalizeOptional(get("sub_type_name"));
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
      errors.push(`Row ${lineNumber}: entry_date must use YYYY-MM-DD or YYYY-MMM-DD format.`);
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
      sub_type_name: subTypeName,
      explanation,
      amount,
      currency_code: currencyParsed.data,
      remark,
      actor_name: actorName
    });
  }

  return { rows: parsedRows, errors };
}
