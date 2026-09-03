import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminApiMock = vi.fn();
const getBigBookVendorActorOutstandingEntriesMock = vi.fn();

vi.mock("@/lib/auth-api", () => ({
  requireAdminApi: requireAdminApiMock
}));

vi.mock("@/lib/db/queries", () => ({
  getBigBookVendorActorOutstandingEntries: getBigBookVendorActorOutstandingEntriesMock
}));

const ACTOR_ID = "22222222-2222-4222-8222-222222222222";
const VENDOR_ID = "77777777-7777-4777-8777-777777777777";

describe("big book vendor-actor outstanding entries route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminApiMock.mockResolvedValue({
      ok: true,
      activeBrandId: "brand-1",
      user: { id: "auth-user-1" }
    });
    getBigBookVendorActorOutstandingEntriesMock.mockResolvedValue({
      rows: [],
      totalCount: 0
    });
  });

  it("returns 403 when the caller is not admin", async () => {
    requireAdminApiMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      message: "Admin access required"
    });
    const { GET } = await import("@/app/api/big-book/vendor-actor-outstanding/entries/route");
    const request = new Request(
      `https://app.localhost/api/big-book/vendor-actor-outstanding/entries?actorId=${ACTOR_ID}&currency=MYR&vendorId=none`
    );

    const response = await GET(request);
    expect(response.status).toBe(403);
    expect(getBigBookVendorActorOutstandingEntriesMock).not.toHaveBeenCalled();
  });

  it("returns 400 when actorId or currency is missing", async () => {
    const { GET } = await import("@/app/api/big-book/vendor-actor-outstanding/entries/route");
    const request = new Request(
      "https://app.localhost/api/big-book/vendor-actor-outstanding/entries?vendorId=none"
    );

    const response = await GET(request);
    expect(response.status).toBe(400);
    expect(getBigBookVendorActorOutstandingEntriesMock).not.toHaveBeenCalled();
  });

  it("maps vendorId=none to a null vendor lookup", async () => {
    const { GET } = await import("@/app/api/big-book/vendor-actor-outstanding/entries/route");
    const request = new Request(
      `https://app.localhost/api/big-book/vendor-actor-outstanding/entries?actorId=${ACTOR_ID}&currency=MYR&vendorId=none&dateFrom=2026-01-01&dateTo=2026-01-31`
    );

    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(getBigBookVendorActorOutstandingEntriesMock).toHaveBeenCalledWith({
      vendorId: null,
      actorId: ACTOR_ID,
      currency: "MYR",
      dateFrom: "2026-01-01",
      dateTo: "2026-01-31"
    });
  });

  it("forwards a vendor uuid and returns the query result", async () => {
    getBigBookVendorActorOutstandingEntriesMock.mockResolvedValueOnce({
      rows: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          entry_date: "2026-09-01",
          entry_direction: "spending",
          type_name: "Credit",
          explanation: "HCM float",
          amount: 215460.55,
          currency_code: "MYR",
          remark: null
        }
      ],
      totalCount: 1
    });
    const { GET } = await import("@/app/api/big-book/vendor-actor-outstanding/entries/route");
    const request = new Request(
      `https://app.localhost/api/big-book/vendor-actor-outstanding/entries?actorId=${ACTOR_ID}&currency=MYR&vendorId=${VENDOR_ID}`
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(getBigBookVendorActorOutstandingEntriesMock).toHaveBeenCalledWith({
      vendorId: VENDOR_ID,
      actorId: ACTOR_ID,
      currency: "MYR",
      dateFrom: undefined,
      dateTo: undefined
    });
    expect(data.totalCount).toBe(1);
    expect(data.rows).toHaveLength(1);
  });
});
