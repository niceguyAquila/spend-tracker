import { beforeEach, describe, expect, it, vi } from "vitest";

const ENTRY_A = "11111111-1111-4111-8111-111111111111";
const ENTRY_B = "22222222-2222-4222-8222-222222222222";

const callOrder: string[] = [];

const entrySelectInMock = vi.fn();
const entryUpdatePayloadMock = vi.fn();
const assignSelectMock = vi.fn();
const detachEqMock = vi.fn();

const groupInsertMock = vi.fn();
const groupInsertSingleMock = vi.fn();
const groupDeleteEqMock = vi.fn();

const requireAdminApiMock = vi.fn();
const assertCsrfAndOriginMock = vi.fn();

vi.mock("@/lib/security/origin", () => ({
  assertCsrfAndOrigin: assertCsrfAndOriginMock,
  hasTrustedOrigin: vi.fn(() => true)
}));

vi.mock("@/lib/auth-api", () => ({
  requireAdminApi: requireAdminApiMock
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: vi.fn((table: string) => {
      if (table === "business_ledger_entries") {
        return {
          select: vi.fn(() => ({ in: entrySelectInMock })),
          update: vi.fn((payload: Record<string, unknown>) => {
            entryUpdatePayloadMock(payload);
            return {
              in: vi.fn(() => ({
                is: vi.fn(() => ({ select: assignSelectMock }))
              })),
              eq: detachEqMock
            };
          })
        };
      }
      if (table === "business_ledger_entry_groups") {
        return {
          insert: groupInsertMock,
          delete: vi.fn(() => ({ eq: groupDeleteEqMock }))
        };
      }
      return {};
    })
  }))
}));

function buildRequest(body: unknown) {
  return new Request("https://app.localhost/api/big-book/groups/assign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("big book groups assign route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    callOrder.length = 0;

    assertCsrfAndOriginMock.mockResolvedValue(true);
    requireAdminApiMock.mockResolvedValue({
      ok: true,
      activeBrandId: "brand-1",
      user: { id: "auth-user-1" }
    });

    entrySelectInMock.mockResolvedValue({
      data: [
        { id: ENTRY_A, group_id: null },
        { id: ENTRY_B, group_id: null }
      ],
      error: null
    });

    groupInsertMock.mockReturnValue({
      select: vi.fn(() => ({ single: groupInsertSingleMock }))
    });
    groupInsertSingleMock.mockResolvedValue({ data: { id: "group-1" }, error: null });

    assignSelectMock.mockImplementation(async () => {
      callOrder.push("assign");
      return { data: [{ id: ENTRY_A }, { id: ENTRY_B }], error: null };
    });

    detachEqMock.mockImplementation(async () => {
      callOrder.push("detach");
      return { data: null, error: null };
    });

    groupDeleteEqMock.mockImplementation(async () => {
      callOrder.push("delete-group");
      return { data: null, error: null };
    });
  });

  it("creates a group and assigns the selected entries", async () => {
    const { POST } = await import("@/app/api/big-book/groups/assign/route");
    const response = await POST(
      buildRequest({ label: "October settlement", remark: "batch", entry_ids: [ENTRY_A, ENTRY_B] })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({ id: "group-1", assigned: 2 });
    expect(groupInsertMock.mock.calls[0][0]).toMatchObject({
      label: "October settlement",
      remark: "batch",
      created_by: "auth-user-1"
    });
    expect(entryUpdatePayloadMock).toHaveBeenCalledWith({ group_id: "group-1", updated_by: "auth-user-1" });
    expect(groupDeleteEqMock).not.toHaveBeenCalled();
  });

  it("rejects a selection of fewer than two entries", async () => {
    const { POST } = await import("@/app/api/big-book/groups/assign/route");
    const response = await POST(buildRequest({ label: "Solo", entry_ids: [ENTRY_A] }));

    expect(response.status).toBe(400);
    expect(groupInsertMock).not.toHaveBeenCalled();
  });

  it("rejects duplicate entry ids", async () => {
    const { POST } = await import("@/app/api/big-book/groups/assign/route");
    const response = await POST(buildRequest({ label: "Dupes", entry_ids: [ENTRY_A, ENTRY_A] }));

    expect(response.status).toBe(400);
    expect(groupInsertMock).not.toHaveBeenCalled();
  });

  it("refuses entries that already belong to a group", async () => {
    entrySelectInMock.mockResolvedValue({
      data: [
        { id: ENTRY_A, group_id: null },
        { id: ENTRY_B, group_id: "existing-group" }
      ],
      error: null
    });

    const { POST } = await import("@/app/api/big-book/groups/assign/route");
    const response = await POST(buildRequest({ label: "Mixed", entry_ids: [ENTRY_A, ENTRY_B] }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("already belong to a group");
    expect(groupInsertMock).not.toHaveBeenCalled();
  });

  it("refuses a selection containing an entry that no longer exists", async () => {
    entrySelectInMock.mockResolvedValue({ data: [{ id: ENTRY_A, group_id: null }], error: null });

    const { POST } = await import("@/app/api/big-book/groups/assign/route");
    const response = await POST(buildRequest({ label: "Stale", entry_ids: [ENTRY_A, ENTRY_B] }));

    expect(response.status).toBe(400);
    expect(groupInsertMock).not.toHaveBeenCalled();
  });

  it("detaches entries before deleting the group when the assignment is partial", async () => {
    assignSelectMock.mockImplementation(async () => {
      callOrder.push("assign");
      return { data: [{ id: ENTRY_A }], error: null };
    });

    const { POST } = await import("@/app/api/big-book/groups/assign/route");
    const response = await POST(buildRequest({ label: "Racy", entry_ids: [ENTRY_A, ENTRY_B] }));

    expect(response.status).toBe(400);
    // group_id is ON DELETE CASCADE, so detaching must happen first or the
    // rollback would delete the caller's pre-existing transactions.
    expect(callOrder).toEqual(["assign", "detach", "delete-group"]);
    expect(entryUpdatePayloadMock).toHaveBeenLastCalledWith({ group_id: null, updated_by: "auth-user-1" });
  });

  it("returns 403 when the CSRF check fails", async () => {
    assertCsrfAndOriginMock.mockResolvedValue(false);

    const { POST } = await import("@/app/api/big-book/groups/assign/route");
    const response = await POST(buildRequest({ label: "Nope", entry_ids: [ENTRY_A, ENTRY_B] }));

    expect(response.status).toBe(403);
    expect(groupInsertMock).not.toHaveBeenCalled();
  });
});
