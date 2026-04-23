type AmountFormatOptions = {
  locale?: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
};

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function formatAmount(value: number, options?: AmountFormatOptions) {
  const {
    locale = "en-US",
    minimumFractionDigits = 2,
    maximumFractionDigits = 4
  } = options ?? {};
  return value.toLocaleString(locale, {
    minimumFractionDigits,
    maximumFractionDigits
  });
}

export function getAmountColorClass(value: number) {
  if (value > 0) return "text-blue-600";
  if (value < 0) return "text-rose-600";
  return "text-slate-700";
}

function parseDisplayDateValue(value: string | Date) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (DATE_ONLY_PATTERN.test(value)) {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateParts(day: number, monthIndex: number, year: number) {
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][monthIndex];
  return `${String(day).padStart(2, "0")}/${month}/${year}`;
}

export function formatDateDisplay(value: string | Date) {
  const parsed = parseDisplayDateValue(value);
  if (!parsed) return "-";

  if (typeof value === "string" && DATE_ONLY_PATTERN.test(value)) {
    return formatDateParts(parsed.getUTCDate(), parsed.getUTCMonth(), parsed.getUTCFullYear());
  }

  return formatDateParts(parsed.getDate(), parsed.getMonth(), parsed.getFullYear());
}

export function formatDateTimeDisplay(value: string | Date) {
  const parsed = parseDisplayDateValue(value);
  if (!parsed) return "-";
  const datePart = formatDateDisplay(value);
  const hours = String(parsed.getHours()).padStart(2, "0");
  const minutes = String(parsed.getMinutes()).padStart(2, "0");
  return `${datePart} ${hours}:${minutes}`;
}
