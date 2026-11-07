import { beforeEach, describe, expect, it, vi } from "vitest";

const queueRows = vi.fn();
const removeMock = vi.fn();
const dequeueInMock = vi.fn();
const dequeueEqMock = vi.fn();
const updatePayloadMock = vi.fn();
const createAdminClientMock = vi.fn();

function adminClient() {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => ({ limit: queueRows }))
      })),
      delete: vi.fn(() => ({
        eq: vi.fn((column: string, value: string) => {
          dequeueEqMock(column, value);
          return { in: dequeueInMock };
        })
      })),
      update: vi.fn((payload: unknown) => {
        updatePayloadMock(payload);
        return { eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })) };
      })
    })),
    storage: { from: vi.fn(() => ({ remove: removeMock })) }
  };
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock
}));

describe("purgeQueuedAttachmentFiles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createAdminClientMock.mockImplementation(adminClient);
    dequeueInMock.mockResolvedValue({ error: null });
  });

  it("removes queued files from storage and dequeues them", async () => {
    queueRows.mockResolvedValue({
      data: [
        { bucket_id: "big-book-attachments", storage_path: "entries/a/1.png", attempts: 0 },
        { bucket_id: "big-book-attachments", storage_path: "entries/b/2.png", attempts: 0 }
      ],
      error: null
    });
    removeMock.mockResolvedValue({ data: [], error: null });

    const { purgeQueuedAttachmentFiles } = await import("@/lib/big-book/attachment-purge");
    const result = await purgeQueuedAttachmentFiles();

    expect(result).toEqual({ removed: 2, failed: 0, error: null });
    expect(removeMock).toHaveBeenCalledWith(["entries/a/1.png", "entries/b/2.png"]);
    expect(dequeueEqMock).toHaveBeenCalledWith("bucket_id", "big-book-attachments");
    expect(dequeueInMock).toHaveBeenCalledWith("storage_path", ["entries/a/1.png", "entries/b/2.png"]);
  });

  it("keeps files queued and records the error when storage fails", async () => {
    queueRows.mockResolvedValue({
      data: [{ bucket_id: "big-book-attachments", storage_path: "entries/a/1.png", attempts: 2 }],
      error: null
    });
    removeMock.mockResolvedValue({ data: null, error: { message: "storage down" } });

    const { purgeQueuedAttachmentFiles } = await import("@/lib/big-book/attachment-purge");
    const result = await purgeQueuedAttachmentFiles();

    expect(result).toEqual({ removed: 0, failed: 1, error: "storage down" });
    expect(dequeueInMock).not.toHaveBeenCalled();
    expect(updatePayloadMock).toHaveBeenCalledWith(
      expect.objectContaining({ attempts: 3, last_error: "storage down" })
    );
  });

  it("does nothing when the queue is empty", async () => {
    queueRows.mockResolvedValue({ data: [], error: null });
    const { purgeQueuedAttachmentFiles } = await import("@/lib/big-book/attachment-purge");
    expect(await purgeQueuedAttachmentFiles()).toEqual({ removed: 0, failed: 0, error: null });
    expect(removeMock).not.toHaveBeenCalled();
  });

  it("never throws, even without admin credentials", async () => {
    createAdminClientMock.mockImplementation(() => {
      throw new Error("Missing admin Supabase env vars.");
    });
    const { purgeQueuedAttachmentFiles } = await import("@/lib/big-book/attachment-purge");
    const result = await purgeQueuedAttachmentFiles();
    expect(result.error).toContain("Missing admin Supabase env vars");
  });
});
