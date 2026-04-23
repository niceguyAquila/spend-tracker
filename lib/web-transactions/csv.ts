export type WebTransactionSourceSystem = "backoffice" | "payment_gateway";

export type ParsedWebTransactionRow = {
  source_system: WebTransactionSourceSystem;
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
  raw_payload: Record<string, string>;
};

export type ParseCsvResult = {
  rows: ParsedWebTransactionRow[];
  errors: string[];
};

const REQUIRED_PAYMENT_GATEWAY_HEADERS = [
  "Create Time",
  "Last Update Time",
  "Client Order No",
  "Status",
  "Payment Type",
  "Product Type",
  "Currency Code",
  "Original Amount",
  "Amount"
] as const;

const REQUIRED_BACKOFFICE_HEADERS = [
  "Transaction No",
  "Type",
  "Status",
  "Currency",
  "Amount",
  "Created Date"
] as const;

const STATUS_OVERRIDES: Record<string, string> = {
  approved: "Successful",
  successful: "Successful",
  success: "Successful",
  rejected: "Failed",
  failed: "Failed",
  cancelled: "Cancelled",
  canceled: "Cancelled",
  pending: "Pending",
  processing: "Pending"
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

function normalizeValue(value: string | undefined) {
  if (!value) return "";
  return value.trim();
}

function normalizeOptional(value: string | undefined) {
  const trimmed = normalizeValue(value);
  if (!trimmed || trimmed === "-") return null;
  return trimmed;
}

function parseNumber(value: string | undefined): number | null {
  const normalized = normalizeOptional(value);
  if (normalized === null) return null;
  const parsed = Number(normalized.replace(/,/g, ""));
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function parseDateTime(value: string | undefined): string | null {
  const normalized = normalizeValue(value);
  const match = normalized.match(
    /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})\s+([+-]\d{2}:\d{2})$/
  );
  if (!match) return null;
  const [, dd, mm, yyyy, hh, min, sec, offset] = match;
  return `${yyyy}-${mm}-${dd}T${hh}:${min}:${sec}${offset}`;
}

function parseBackofficeDateTime(value: string | undefined): string | null {
  const normalized = normalizeValue(value);
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, yyyy, mm, dd, hh, min, sec] = match;
  return `${yyyy}-${mm}-${dd}T${hh}:${min}:${sec}+07:00`;
}

function normalizeStatus(rawStatus: string): string {
  const normalized = rawStatus.trim().toLowerCase();
  if (!normalized) return "Unknown";
  if (STATUS_OVERRIDES[normalized]) return STATUS_OVERRIDES[normalized];
  if (normalized.includes("success") || normalized.includes("approve")) return "Successful";
  if (normalized.includes("reject") || normalized.includes("fail")) return "Failed";
  if (normalized.includes("pending") || normalized.includes("process")) return "Pending";
  if (normalized.includes("cancel")) return "Cancelled";
  return "Unknown";
}

function normalizeType(rawType: string): string {
  const normalized = rawType.trim().toLowerCase();
  if (normalized === "deposit" || normalized === "payin") return "Payin";
  if (normalized === "withdraw" || normalized === "payout") return "Payout";
  return "Other";
}

function parsePaymentGatewayRows(dataRows: string[][], headerMap: Map<string, number>, errors: string[]) {
  const rows: ParsedWebTransactionRow[] = [];
  const seenTransactionNos = new Set<string>();

  for (let rowIndex = 0; rowIndex < dataRows.length; rowIndex += 1) {
    const lineNumber = rowIndex + 2;
    const values = dataRows[rowIndex];
    const get = (header: string) => values[headerMap.get(header) ?? -1];
    const externalTxnNo = normalizeValue(get("Client Order No"));
    if (!externalTxnNo) {
      errors.push(`Row ${lineNumber}: Client Order No is required.`);
      continue;
    }
    if (seenTransactionNos.has(externalTxnNo)) continue;
    seenTransactionNos.add(externalTxnNo);

    const createTime = parseDateTime(get("Create Time"));
    const lastUpdateTime = parseDateTime(get("Last Update Time"));
    if (!createTime || !lastUpdateTime) {
      errors.push(`Row ${lineNumber}: invalid Create Time or Last Update Time.`);
      continue;
    }

    const originalAmount = parseNumber(get("Original Amount"));
    const amount = parseNumber(get("Amount"));
    if (originalAmount === null || amount === null) {
      errors.push(`Row ${lineNumber}: invalid Original Amount or Amount.`);
      continue;
    }

    const rawStatus = normalizeValue(get("Status"));
    const rawType = normalizeValue(get("Payment Type"));
    const payload: Record<string, string> = {};
    for (const [key, idx] of headerMap.entries()) {
      payload[key] = normalizeValue(values[idx]);
    }

    rows.push({
      source_system: "payment_gateway",
      create_time: createTime,
      last_update_time: lastUpdateTime,
      external_txn_no: externalTxnNo,
      client_order_no: externalTxnNo,
      aggregator_order_no: normalizeOptional(get("Aggregator Order No")),
      raw_status: rawStatus,
      canonical_status: normalizeStatus(rawStatus),
      raw_type: rawType,
      canonical_type: normalizeType(rawType),
      product_type: normalizeValue(get("Product Type")),
      currency_code: normalizeValue(get("Currency Code")),
      original_amount: originalAmount,
      amount,
      crypto_currency_code: normalizeOptional(get("Crypto Currency Code")),
      crypto_amount: parseNumber(get("Crypto Amount")),
      merchant_name: normalizeOptional(get("Merchant Name")),
      merchant_rate: parseNumber(normalizeValue(get("Merchant Rate")).replace("%", "")),
      merchant_fee: parseNumber(get("Merchant Fee")),
      raw_payload: payload
    });
  }

  return rows;
}

function parseBackofficeRows(dataRows: string[][], headerMap: Map<string, number>, errors: string[]) {
  const rows: ParsedWebTransactionRow[] = [];
  const seenTransactionNos = new Set<string>();

  for (let rowIndex = 0; rowIndex < dataRows.length; rowIndex += 1) {
    const lineNumber = rowIndex + 2;
    const values = dataRows[rowIndex];
    const get = (header: string) => values[headerMap.get(header) ?? -1];

    const externalTxnNo = normalizeValue(get("Transaction No"));
    if (!externalTxnNo) {
      errors.push(`Row ${lineNumber}: Transaction No is required.`);
      continue;
    }
    if (seenTransactionNos.has(externalTxnNo)) continue;
    seenTransactionNos.add(externalTxnNo);

    const createdDate = parseBackofficeDateTime(get("Created Date"));
    if (!createdDate) {
      errors.push(`Row ${lineNumber}: invalid Created Date.`);
      continue;
    }

    const amount = parseNumber(get("Amount"));
    if (amount === null) {
      errors.push(`Row ${lineNumber}: invalid Amount.`);
      continue;
    }

    const rawStatus = normalizeValue(get("Status"));
    const rawType = normalizeValue(get("Type"));
    const payload: Record<string, string> = {};
    for (const [key, idx] of headerMap.entries()) {
      payload[key] = normalizeValue(values[idx]);
    }

    rows.push({
      source_system: "backoffice",
      create_time: createdDate,
      last_update_time: createdDate,
      external_txn_no: externalTxnNo,
      client_order_no: null,
      aggregator_order_no: null,
      raw_status: rawStatus,
      canonical_status: normalizeStatus(rawStatus),
      raw_type: rawType,
      canonical_type: normalizeType(rawType),
      product_type: normalizeValue(get("Transfer Type")) || "BACKOFFICE",
      currency_code: normalizeValue(get("Currency")) || "IDR",
      original_amount: amount,
      amount,
      crypto_currency_code: null,
      crypto_amount: null,
      merchant_name: normalizeOptional(get("Bank")),
      merchant_rate: null,
      merchant_fee: 0,
      raw_payload: payload
    });
  }

  return rows;
}

export function parseWebTransactionsCsv(content: string, sourceSystem: WebTransactionSourceSystem): ParseCsvResult {
  const delimiter = sourceSystem === "payment_gateway" ? ";" : ",";
  const rows = parseDelimitedRows(content, delimiter);
  if (!rows.length) {
    return { rows: [], errors: ["CSV file is empty."] };
  }
  const headers = rows[0].map((header) => header.trim());
  const headerMap = new Map<string, number>();
  headers.forEach((header, index) => headerMap.set(header, index));

  const errors: string[] = [];
  const requiredHeaders =
    sourceSystem === "payment_gateway" ? REQUIRED_PAYMENT_GATEWAY_HEADERS : REQUIRED_BACKOFFICE_HEADERS;
  for (const requiredHeader of requiredHeaders) {
    if (!headerMap.has(requiredHeader)) {
      errors.push(`Missing required header: ${requiredHeader}`);
    }
  }
  if (errors.length) {
    return { rows: [], errors };
  }
  const dataRows = rows.slice(1);
  const parsedRows =
    sourceSystem === "payment_gateway"
      ? parsePaymentGatewayRows(dataRows, headerMap, errors)
      : parseBackofficeRows(dataRows, headerMap, errors);
  return { rows: parsedRows, errors };
}
