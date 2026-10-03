/**
 * Client helpers for CSV export downloads.
 * Guards against auth redirects / Next error pages being saved as .csv files.
 */

export async function readExportErrorMessage(
  response: Response,
  fallback = "Failed to export ledger entries."
): Promise<string> {
  try {
    const data = (await response.clone().json()) as { error?: unknown; message?: unknown };
    if (typeof data?.error === "string" && data.error.trim()) return data.error;
    if (typeof data?.message === "string" && data.message.trim()) return data.message;
  } catch {
    // not JSON
  }
  try {
    const text = (await response.clone().text()).trim();
    if (text.startsWith("<!DOCTYPE") || text.startsWith("<html")) {
      return "Export failed: received an HTML error page instead of CSV.";
    }
  } catch {
    // ignore
  }
  return fallback;
}

export function isCsvContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  const normalized = contentType.toLowerCase();
  return normalized.includes("text/csv") || normalized.includes("application/csv");
}

export async function downloadCsvBlob(response: Response, filename: string): Promise<void> {
  if (!isCsvContentType(response.headers.get("content-type"))) {
    throw new Error(await readExportErrorMessage(response, "Export failed: response was not CSV."));
  }
  const blob = await response.blob();
  const downloadUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = downloadUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(downloadUrl);
}
