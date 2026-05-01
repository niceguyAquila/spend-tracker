import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminApiMock = vi.fn();
const assertCsrfAndOriginMock = vi.fn();
const uploadMock = vi.fn();
const removeMock = vi.fn();
const createSignedUrlMock = vi.fn();
const insertMock = vi.fn();
const maybeSingleMock = vi.fn();

vi.mock("@/lib/auth-api", () => ({
  requireAdminApi: requireAdminApiMock
}));

vi.mock("@/lib/security/origin", () => ({
  assertCsrfAndOrigin: assertCsrfAndOriginMock,
  hasTrustedOrigin: vi.fn(() => true)
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        upload: uploadMock,
        remove: removeMock,
        createSignedUrl: createSignedUrlMock
      }))
    }
  }))
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: vi.fn((table: string) => {
      if (table === "credit_ledger_settlement_attachments") {
        return {
          insert: insertMock,
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: maybeSingleMock
            }))
          })),
          delete: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: null })
          }))
        };
      }
      return {};
    })
  }))
}));

describe("credit big book settlement attachments routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertCsrfAndOriginMock.mockResolvedValue(true);
    requireAdminApiMock.mockResolvedValue({
      ok: true,
      user: { id: "admin-1" },
      activeBrandId: "brand-1"
    });
    uploadMock.mockResolvedValue({ error: null });
    removeMock.mockResolvedValue({ error: null });
    createSignedUrlMock.mockResolvedValue({
      data: { signedUrl: "https://cdn.local/signed" },
      error: null
    });
    insertMock.mockReturnValue({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({ data: { id: "att-1" }, error: null })
      }))
    });
    maybeSingleMock.mockResolvedValue({
      data: {
        id: "att-1",
        storage_path: "settlements/settlement-1/file.png",
        file_name: "file.png"
      },
      error: null
    });
  });

  it("uploads settlement attachment and stores metadata", async () => {
    const { POST } = await import("@/app/api/credit-big-book/settlements/attachments/route");
    const formData = new FormData();
    formData.append("settlement_id", "11111111-1111-4111-8111-111111111111");
    formData.append("file", new File(["img"], "proof.png", { type: "image/png" }));
    const request = new Request(
      "https://app.localhost/api/credit-big-book/settlements/attachments",
      {
        method: "POST",
        body: formData
      }
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.id).toBe("att-1");
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(uploadMock.mock.calls[0][0]).toMatch(/^settlements\/11111111-1111-4111-8111-111111111111\//);
  });

  it("returns 400 when settlement_id is missing", async () => {
    const { POST } = await import("@/app/api/credit-big-book/settlements/attachments/route");
    const formData = new FormData();
    formData.append("file", new File(["img"], "proof.png", { type: "image/png" }));
    const request = new Request(
      "https://app.localhost/api/credit-big-book/settlements/attachments",
      {
        method: "POST",
        body: formData
      }
    );

    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("returns 403 when non-admin attempts to upload", async () => {
    requireAdminApiMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      message: "Admin access required"
    });
    const { POST } = await import("@/app/api/credit-big-book/settlements/attachments/route");
    const formData = new FormData();
    formData.append("settlement_id", "11111111-1111-4111-8111-111111111111");
    formData.append("file", new File(["img"], "proof.png", { type: "image/png" }));
    const request = new Request(
      "https://app.localhost/api/credit-big-book/settlements/attachments",
      {
        method: "POST",
        body: formData
      }
    );

    const response = await POST(request);
    expect(response.status).toBe(403);
  });

  it("returns signed URL for settlement attachment viewing", async () => {
    const { GET } = await import(
      "@/app/api/credit-big-book/settlements/attachments/view/route"
    );
    const request = new Request(
      "https://app.localhost/api/credit-big-book/settlements/attachments/view?id=44444444-4444-4444-8444-444444444444"
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.url).toContain("https://cdn.local/signed");
  });
});
