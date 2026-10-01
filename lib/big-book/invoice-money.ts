/** Currency + amount with comma thousand separators (e.g. `RM 3,006,610.00`). */
export function formatInvoiceMoney(value: number, currency: string) {
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4
  });
  const code = currency.trim();
  return code ? `${code} ${formatted}` : formatted;
}
