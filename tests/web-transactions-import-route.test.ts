import { beforeEach, describe, expect, it, vi } from "vitest";

const upsertMock = vi.fn();
const requireFinanceApiMock = vi.fn();
const hasTrustedOriginMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: vi.fn(() => ({
      upsert: upsertMock
    }))
  }))
}));

vi.mock("@/lib/auth-api", () => ({
  requireFinanceApi: requireFinanceApiMock
}));

vi.mock("@/lib/security/origin", () => ({
  hasTrustedOrigin: hasTrustedOriginMock
}));

describe("POST /api/web-transactions/import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasTrustedOriginMock.mockReturnValue(true);
    requireFinanceApiMock.mockResolvedValue({
      ok: true,
      activeBrandId: "brand-1",
      user: { id: "user-1" }
    });
    upsertMock.mockResolvedValue({ error: null });
  });

  it("imports valid csv rows and performs upsert", async () => {
    const { POST } = await import("@/app/api/web-transactions/import/route");
    const csv = [
      "Create Time;Last Update Time;Client Order No;Aggregator Order No;Status;Payment Type;Product Type;Currency Code;Original Amount;Amount;Crypto Currency Code;Crypto Amount;Merchant Name;Merchant Rate;Merchant Fee",
      "23/04/2026 14:13:28 +07:00;23/04/2026 14:14:00 +07:00;A001;X1;Successful;Payin;QR;IDR;60000;60000;-;-;m01;1.60%;-960"
    ].join("\n");
    const formData = new FormData();
    formData.append("file", new File([csv], "portal.csv", { type: "text/csv" }));
    formData.append("sourceSystem", "payment_gateway");
    const request = new Request("https://app.localhost/api/web-transactions/import", {
      method: "POST",
      body: formData
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.processed).toBe(1);
    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(upsertMock.mock.calls[0]?.[1]?.onConflict).toBe("brand_id,source_system,external_txn_no");
  });
});
