import { describe, expect, it } from "vitest";

import { isCsvContentType, readExportErrorMessage } from "@/lib/client/csv-download";

describe("csv-download client helpers", () => {
  it("accepts text/csv and application/csv content types", () => {
    expect(isCsvContentType("text/csv; charset=utf-8")).toBe(true);
    expect(isCsvContentType("application/csv")).toBe(true);
    expect(isCsvContentType("application/json")).toBe(false);
    expect(isCsvContentType("text/html; charset=utf-8")).toBe(false);
    expect(isCsvContentType(null)).toBe(false);
  });

  it("reads JSON export errors", async () => {
    const response = new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
    await expect(readExportErrorMessage(response)).resolves.toBe("Unauthorized");
  });

  it("detects HTML error bodies instead of treating them as CSV", async () => {
    const response = new Response("<!DOCTYPE html><html><body>Login</body></html>", {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" }
    });
    await expect(readExportErrorMessage(response)).resolves.toBe(
      "Export failed: received an HTML error page instead of CSV."
    );
  });
});
