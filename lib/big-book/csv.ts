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

/** Full import/export column order (required + optional). */
export const BIG_BOOK_CSV_HEADERS = [
  "entry_date",
  "entry_direction",
  "type_name",
  "sub_type_name",
  "explanation",
  "amount",
  "currency_code",
  "remark",
  "actor_name"
] as const;

export function buildBigBookImportTemplateCsv(): string {
  const exampleRow = [
    "2026-04-25",
    "spending",
    "Office Supplies",
    "Stationery",
    "Printer ink",
    "350000",
    "IDR",
    "Restock",
    "Actor A"
  ];
  // UTF-8 BOM helps Excel on Windows keep columns when opening the template.
  return `\uFEFF${[BIG_BOOK_CSV_HEADERS.join(","), exampleRow.join(",")].join("\r\n")}\r\n`;
}

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

function normalizeHeader(value: string) {
  return value.replace(/^\uFEFF/, "").trim();
}

function firstLine(content: string): string {
  const end = content.search(/\r\n|\n|\r/);
  return end === -1 ? content : content.slice(0, end);
}

/**
 * Excel (wrong list-separator locale) often stores each CSV line as one quoted cell.
 * Unwrap that so normal delimiter parsing can run.
 */
function unwrapExcelSingleColumn(content: string): string {
  for (const delimiter of [",", ";", "\t"] as const) {
    const rows = parseDelimitedRows(content, delimiter);
    if (!rows.length || rows[0].length !== 1) continue;
    const firstCell = normalizeHeader(rows[0][0]);
    const parts = firstCell.split(/[,;\t]/).map((part) => part.trim());
    const matched = REQUIRED_HEADERS.filter((header) => parts.includes(header)).length;
    if (matched < REQUIRED_HEADERS.length) continue;
    if (!rows.every((row) => row.length === 1)) continue;
    return rows.map((row) => row[0] ?? "").join("\n");
  }
  return content;
}

/** Prefer the delimiter that yields the most recognized required headers (Excel often uses `;`). */
function detectDelimiter(content: string): string {
  const candidates = [",", ";", "\t"] as const;
  let best: (typeof candidates)[number] = ",";
  let bestScore = -1;

  for (const delimiter of candidates) {
    const cells = parseDelimitedRows(`${firstLine(content)}\n`, delimiter)[0] ?? [];
    const headers = cells.map(normalizeHeader);
    const score = REQUIRED_HEADERS.reduce(
      (count, header) => count + (headers.includes(header) ? 1 : 0),
      0
    );
    if (score > bestScore) {
      bestScore = score;
      best = delimiter;
    }
  }

  return best;
}

export function parseBigBookCsv(content: string): ParseBigBookCsvResult {
  const withoutBom = content.replace(/^\uFEFF/, "");
  const normalizedContent = unwrapExcelSingleColumn(withoutBom);
  const rows = parseDelimitedRows(normalizedContent, detectDelimiter(normalizedContent));
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
