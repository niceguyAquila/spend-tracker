/**
 * Shared CSV helpers used by module-specific parsers and export routes.
 * Big Book / Credit Big Book still carry local copies; new modules should
 * import from here instead of duplicating again.
 */

export function parseDelimitedRows(content: string, delimiter: string): string[][] {
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

export function normalizeRequired(value: string | undefined) {
  return (value ?? "").trim();
}

export function normalizeOptional(value: string | undefined) {
  const trimmed = normalizeRequired(value);
  return trimmed.length ? trimmed : null;
}

export function normalizeHeader(value: string) {
  return value.replace(/^\uFEFF/, "").trim();
}

export function firstLine(content: string): string {
  const end = content.search(/\r\n|\n|\r/);
  return end === -1 ? content : content.slice(0, end);
}

/** Accepts YYYY-MM-DD or YYYY-MMM-DD (case-insensitive 3-letter month). */
export function parseDate(value: string): string | null {
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
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) {
    return null;
  }
  return normalized;
}

/** Strips thousands commas; requires a finite number greater than zero. */
export function parseAmount(value: string): number | null {
  const parsed = Number(value.replace(/,/g, ""));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

export function escapeCsvCell(value: string | null | undefined): string {
  const str = value == null ? "" : String(value);
  if (str.length === 0) return "";
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function formatAmountForCsv(amount: number): string {
  if (!Number.isFinite(amount)) return "0";
  const fixed = Number(amount).toFixed(4);
  return fixed.replace(/\.?0+$/, "");
}

/**
 * Prefer the delimiter that yields the most recognized required headers
 * (Excel locales often use `;`).
 */
export function detectDelimiter(content: string, requiredHeaders: readonly string[]): string {
  const candidates = [",", ";", "\t"] as const;
  let best: (typeof candidates)[number] = ",";
  let bestScore = -1;

  for (const delimiter of candidates) {
    const cells = parseDelimitedRows(`${firstLine(content)}\n`, delimiter)[0] ?? [];
    const headers = cells.map(normalizeHeader);
    const score = requiredHeaders.reduce(
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

/**
 * Excel (wrong list-separator locale) often stores each CSV line as one quoted
 * cell. Unwrap that so normal delimiter parsing can run.
 */
export function unwrapExcelSingleColumn(content: string, requiredHeaders: readonly string[]): string {
  const header = firstLine(content).trim();
  if (header.length < 2 || !header.startsWith('"') || !header.endsWith('"')) {
    return content;
  }

  for (const delimiter of [",", ";", "\t"] as const) {
    const rows = parseDelimitedRows(content, delimiter);
    if (!rows.length || rows[0].length !== 1) continue;
    const firstCell = normalizeHeader(rows[0][0]);
    const parts = firstCell.split(/[,;\t]/).map((part) => part.trim());
    const matched = requiredHeaders.filter((name) => parts.includes(name)).length;
    if (matched < requiredHeaders.length) continue;
    if (!rows.every((row) => row.length === 1)) continue;
    return rows.map((row) => row[0] ?? "").join("\n");
  }
  return content;
}
