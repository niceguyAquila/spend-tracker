import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminApiMock = vi.fn();
const hasTrustedOriginMock = vi.fn();
const uploadMock = vi.fn();
const removeMock = vi.fn();
const createSignedUrlMock = vi.fn();
const insertMock = vi.fn();
const maybeSingleMock = vi.fn();

vi.mock("@/lib/auth-api", () => ({
  requireAdminApi: requireAdminApiMock
}));

vi.mock("@/lib/security/origin", () => ({
  hasTrustedOrigin: hasTrustedOriginMock
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
      if (table === "business_ledger_attachments") {
        return {
          insert: insertMock,
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: maybeSingleMock
              }))
            }))
          }))
        };
      }
      return {};
    })
  }))
}));

describe("big book attachments routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasTrustedOriginMock.mockReturnValue(true);
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
        storage_path: "brand-1/entry-1/file.png",
        file_name: "file.png"
      },
      error: null
    });
  });

  it("uploads attachment and stores metadata", async () => {
    const { POST } = await import("@/app/api/big-book/attachments/route");
    const formData = new FormData();
    formData.append("ledger_entry_id", "11111111-1111-4111-8111-111111111111");
    formData.append("file", new File(["img"], "proof.png", { type: "image/png" }));
    const request = new Request("https://app.localhost/api/big-book/attachments", {
      method: "POST",
      body: formData
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.id).toBe("att-1");
    expect(uploadMock).toHaveBeenCalledTimes(1);
  });

  it("returns signed URL for attachment viewing", async () => {
    const { GET } = await import("@/app/api/big-book/attachments/view/route");
    const request = new Request("https://app.localhost/api/big-book/attachments/view?id=att-1");

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.url).toContain("https://cdn.local/signed");
  });
});
