import { beforeEach, describe, expect, it, vi } from "vitest";

const GROUP_ID = "99999999-9999-4999-8999-999999999999";
const OBLIGATION = "11111111-1111-4111-8111-111111111111";
const PAYMENT = "22222222-2222-4222-8222-222222222222";
const PLAIN = "33333333-3333-4333-8333-333333333333";
const OUTSIDE_GAS_FEE = "44444444-4444-4444-8444-444444444444";

const rpcMock = vi.fn();
const fromMock = vi.fn();
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
  createClient: vi.fn(async () => ({ rpc: rpcMock, from: fromMock }))
}));

const purgeMock = vi.fn();
vi.mock("@/lib/big-book/attachment-purge", () => ({
  purgeQueuedAttachmentFiles: purgeMock
}));

function deleteRequest(query: string) {
  return new Request(`https://app.localhost/api/big-book/groups?${query}`, { method: "DELETE" });
}

describe("big book groups route DELETE (cascade)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertCsrfAndOriginMock.mockResolvedValue(true);
    requireAdminApiMock.mockResolvedValue({ ok: true, user: { id: "auth-user-1" } });
    fromMock.mockImplementation(() => {
      throw new Error("cascade group delete must go through big_book_delete_group, not table writes");
    });
  });

  it("deletes through big_book_delete_group with the expected member ids", async () => {
    rpcMock.mockResolvedValue({
      data: { deleted_ids: [OBLIGATION, PAYMENT], linked_ids: [] },
      error: null
    });
    const { DELETE } = await import("@/app/api/big-book/groups/route");
    const response = await DELETE(
      deleteRequest(`id=${GROUP_ID}&mode=cascade&expected=${OBLIGATION},${PAYMENT}`)
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({ ok: true, deleted_ids: [OBLIGATION, PAYMENT], linked_ids: [] });
    expect(rpcMock).toHaveBeenCalledWith("big_book_delete_group", {
      p_group_id: GROUP_ID,
      p_expected_entry_ids: [OBLIGATION, PAYMENT],
      p_cascade_linked: false,
      p_expected_linked_ids: null
    });
    expect(purgeMock).toHaveBeenCalledTimes(1);
  });

  it("defaults to cascade and skips the membership check when no expected ids are sent", async () => {
    rpcMock.mockResolvedValue({ data: { deleted_ids: [], linked_ids: [] }, error: null });
    const { DELETE } = await import("@/app/api/big-book/groups/route");
    await DELETE(deleteRequest(`id=${GROUP_ID}`));
    expect(rpcMock.mock.calls[0][1]).toMatchObject({ p_expected_entry_ids: null, p_cascade_linked: false });
  });

  it("returns the outside settlement rows that need confirmation", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        code: "PT409",
        message: "linked_set_requires_confirmation",
        details: "This group is linked to settlement records outside the group.",
        hint: JSON.stringify({ member_ids: [OUTSIDE_GAS_FEE] })
      }
    });
    const { DELETE } = await import("@/app/api/big-book/groups/route");
    const response = await DELETE(deleteRequest(`id=${GROUP_ID}&mode=cascade`));
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data).toMatchObject({ code: "linked_set_requires_confirmation", member_ids: [OUTSIDE_GAS_FEE] });
  });

  it("passes the confirmed linked set through", async () => {
    rpcMock.mockResolvedValue({
      data: { deleted_ids: [OBLIGATION, OUTSIDE_GAS_FEE], linked_ids: [OUTSIDE_GAS_FEE] },
      error: null
    });
    const { DELETE } = await import("@/app/api/big-book/groups/route");
    const response = await DELETE(
      deleteRequest(`id=${GROUP_ID}&mode=cascade&cascadeLinked=1&linkedSet=${OUTSIDE_GAS_FEE}`)
    );

    expect(response.status).toBe(200);
    expect(rpcMock.mock.calls[0][1]).toMatchObject({
      p_cascade_linked: true,
      p_expected_linked_ids: [OUTSIDE_GAS_FEE]
    });
  });

  it("maps a changed group to 409 and a missing group to 404", async () => {
    const { DELETE } = await import("@/app/api/big-book/groups/route");

    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { code: "PT409", message: "group_changed", hint: JSON.stringify({ member_ids: [PLAIN] }) }
    });
    const changed = await DELETE(deleteRequest(`id=${GROUP_ID}&expected=${OBLIGATION}`));
    expect(changed.status).toBe(409);
    expect(await changed.json()).toMatchObject({ code: "group_changed", member_ids: [PLAIN] });

    rpcMock.mockResolvedValueOnce({ data: null, error: { code: "PT404", message: "group_not_found" } });
    const missing = await DELETE(deleteRequest(`id=${GROUP_ID}`));
    expect(missing.status).toBe(404);
  });

  it("reports a missing database function as a migration problem", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "Could not find the function public.big_book_delete_group" }
    });
    const { DELETE } = await import("@/app/api/big-book/groups/route");
    const response = await DELETE(deleteRequest(`id=${GROUP_ID}`));
    const data = await response.json();
    expect(response.status).toBe(500);
    expect(data.error).toContain("Apply supabase migrations");
  });
});

describe("big book groups route PATCH", () => {
  function entryPayload(id: string | null, overrides: Record<string, unknown> = {}) {
    return {
      ...(id ? { id } : {}),
      entry_date: "2026-10-01",
      entry_direction: "spending",
      entry_type_id: "55555555-5555-4555-8555-555555555555",
      explanation: "Row",
      amount: 10,
      currency_code: "IDR",
      responsible_actor_id: "66666666-6666-4666-8666-666666666666",
      ...overrides
    };
  }

  function patchRequest(body: Record<string, unknown>) {
    return new Request("https://app.localhost/api/big-book/groups", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: GROUP_ID, label: "Group", remark: "", ...body })
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    assertCsrfAndOriginMock.mockResolvedValue(true);
    requireAdminApiMock.mockResolvedValue({ ok: true, user: { id: "auth-user-1" } });
    fromMock.mockImplementation(() => {
      throw new Error("group edit must save through big_book_update_group, not table writes");
    });
  });

  it("saves the whole form in one big_book_update_group call", async () => {
    rpcMock.mockResolvedValue({
      data: { updated_ids: [PLAIN], inserted_ids: ["new-1"], deleted_ids: [] },
      error: null
    });
    const { PATCH } = await import("@/app/api/big-book/groups/route");
    const response = await PATCH(
      patchRequest({
        entries: [
          entryPayload(PLAIN, { is_debt: true, remark: "" }),
          entryPayload(null, { is_credit: true, is_future_credit: true })
        ],
        expected_entry_ids: [PLAIN]
      })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({ ok: true, updated_ids: [PLAIN], inserted_ids: ["new-1"] });
    expect(rpcMock).toHaveBeenCalledTimes(1);
    const [fn, args] = rpcMock.mock.calls[0];
    expect(fn).toBe("big_book_update_group");
    expect(args).toMatchObject({
      p_group_id: GROUP_ID,
      p_label: "Group",
      p_remark: null,
      p_expected_entry_ids: [PLAIN]
    });
    expect(args.p_entries[0]).toMatchObject({
      id: PLAIN,
      is_credit: false,
      is_debt: true,
      is_future_credit: false,
      remark: null,
      vendor_id: null
    });
    expect(args.p_entries[1]).toMatchObject({ id: null, is_credit: true, is_future_credit: true });
    expect(purgeMock).not.toHaveBeenCalled();
  });

  it("drains the attachment purge queue when rows were removed", async () => {
    rpcMock.mockResolvedValue({
      data: { updated_ids: [], inserted_ids: [], deleted_ids: [PAYMENT] },
      error: null
    });
    const { PATCH } = await import("@/app/api/big-book/groups/route");
    const response = await PATCH(patchRequest({ entries: [entryPayload(PLAIN), entryPayload(OBLIGATION)] }));

    expect(response.status).toBe(200);
    expect(rpcMock.mock.calls[0][1].p_expected_entry_ids).toBeNull();
    expect(purgeMock).toHaveBeenCalledTimes(1);
  });

  it("maps a settlement row removal to 409 with its ids", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        code: "PT409",
        message: "settlement_rows_in_removal",
        hint: JSON.stringify({ ids: [OBLIGATION] })
      }
    });
    const { PATCH } = await import("@/app/api/big-book/groups/route");
    const response = await PATCH(patchRequest({ entries: [entryPayload(PAYMENT), entryPayload(PLAIN)] }));
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data).toMatchObject({ code: "settlement_rows_in_removal", ids: [OBLIGATION] });
    expect(purgeMock).not.toHaveBeenCalled();
  });

  it("surfaces the settlement guard trigger message as 409 (whole save rolled back)", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        code: "PT409",
        message:
          "A settlement payment's amount, currency, rate, and cash flow cannot change. Delete the linked set and record it again."
      }
    });
    const { PATCH } = await import("@/app/api/big-book/groups/route");
    const response = await PATCH(patchRequest({ entries: [entryPayload(PAYMENT), entryPayload(PLAIN)] }));
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.code).toBe("settlement_locked");
    expect(data.error).toContain("cannot change");
  });

  it("maps group_changed, entry_not_in_group and group_not_found", async () => {
    const { PATCH } = await import("@/app/api/big-book/groups/route");
    const send = () => PATCH(patchRequest({ entries: [entryPayload(PLAIN), entryPayload(OBLIGATION)] }));

    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { code: "PT409", message: "group_changed", hint: JSON.stringify({ member_ids: [PLAIN, PAYMENT] }) }
    });
    const changed = await send();
    expect(changed.status).toBe(409);
    expect(await changed.json()).toMatchObject({ code: "group_changed", member_ids: [PLAIN, PAYMENT] });

    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { code: "PT422", message: "entry_not_in_group", hint: JSON.stringify({ ids: [PAYMENT] }) }
    });
    expect((await send()).status).toBe(400);

    rpcMock.mockResolvedValueOnce({ data: null, error: { code: "PT404", message: "group_not_found" } });
    expect((await send()).status).toBe(404);
  });
});
