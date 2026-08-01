import { describe, expect, it, vi } from "vitest";
import { replaceUserBrandRoles, validateBrandRoles } from "@/lib/db/user-brand-roles";

const ALLOWED_USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BRAND_A = "11111111-1111-4111-8111-111111111111";
const BRAND_B = "22222222-2222-4222-8222-222222222222";

type RecordedCall =
  | { kind: "upsert"; rows: Array<Record<string, unknown>>; options: unknown }
  | { kind: "prune"; allowedUserId: string; column: string; operator: string; filter: string };

function createAdminClientStub(
  errors: { upsert?: { message: string }; prune?: { message: string } } = {}
) {
  const calls: RecordedCall[] = [];

  const client = {
    from: vi.fn(() => ({
      upsert: vi.fn(async (rows: Array<Record<string, unknown>>, options: unknown) => {
        calls.push({ kind: "upsert", rows, options });
        return { error: errors.upsert ?? null };
      }),
      delete: vi.fn(() => ({
        eq: vi.fn((_column: string, allowedUserId: string) => ({
          not: vi.fn(async (column: string, operator: string, filter: string) => {
            calls.push({ kind: "prune", allowedUserId, column, operator, filter });
            return { error: errors.prune ?? null };
          })
        }))
      }))
    }))
  };

  return { client: client as unknown as Parameters<typeof replaceUserBrandRoles>[0], calls };
}

describe("validateBrandRoles", () => {
  it("rejects an empty set so a revoke cannot lock the user out", () => {
    expect(validateBrandRoles([])).toMatch(/at least one brand/i);
  });

  it("rejects the same brand listed twice", () => {
    expect(
      validateBrandRoles([
        { brand_id: BRAND_A, role: "admin" },
        { brand_id: BRAND_A, role: "viewer" }
      ])
    ).toMatch(/only be listed once/i);
  });

  it("accepts a distinct, non-empty set", () => {
    expect(
      validateBrandRoles([
        { brand_id: BRAND_A, role: "admin" },
        { brand_id: BRAND_B, role: "finance" }
      ])
    ).toBeNull();
  });
});

describe("replaceUserBrandRoles", () => {
  it("grants before pruning so the membership set is never momentarily empty", async () => {
    const { client, calls } = createAdminClientStub();

    const result = await replaceUserBrandRoles(client, ALLOWED_USER_ID, [
      { brand_id: BRAND_A, role: "admin" },
      { brand_id: BRAND_B, role: "finance" }
    ]);

    expect(result.ok).toBe(true);
    expect(calls.map((call) => call.kind)).toEqual(["upsert", "prune"]);
  });

  it("upserts every supplied role against the user/brand unique constraint", async () => {
    const { client, calls } = createAdminClientStub();

    await replaceUserBrandRoles(client, ALLOWED_USER_ID, [
      { brand_id: BRAND_A, role: "admin" },
      { brand_id: BRAND_B, role: "finance", is_active: false }
    ]);

    const upsert = calls.find((call) => call.kind === "upsert");
    expect(upsert).toBeDefined();
    if (upsert?.kind !== "upsert") throw new Error("expected an upsert call");

    expect(upsert.options).toEqual({ onConflict: "allowed_user_id,brand_id" });
    expect(upsert.rows).toEqual([
      { allowed_user_id: ALLOWED_USER_ID, brand_id: BRAND_A, role: "admin", is_active: true },
      { allowed_user_id: ALLOWED_USER_ID, brand_id: BRAND_B, role: "finance", is_active: false }
    ]);
  });

  it("prunes only rows outside the supplied set, scoped to the one user", async () => {
    const { client, calls } = createAdminClientStub();

    await replaceUserBrandRoles(client, ALLOWED_USER_ID, [{ brand_id: BRAND_A, role: "admin" }]);

    const prune = calls.find((call) => call.kind === "prune");
    if (prune?.kind !== "prune") throw new Error("expected a prune call");

    expect(prune.allowedUserId).toBe(ALLOWED_USER_ID);
    expect(prune.column).toBe("brand_id");
    expect(prune.operator).toBe("in");
    expect(prune.filter).toBe(`("${BRAND_A}")`);
  });

  it("leaves existing access untouched when the grant fails", async () => {
    const { client, calls } = createAdminClientStub({ upsert: { message: "insert blew up" } });

    const result = await replaceUserBrandRoles(client, ALLOWED_USER_ID, [
      { brand_id: BRAND_A, role: "admin" }
    ]);

    expect(result).toEqual({ ok: false, message: "insert blew up" });
    expect(calls.some((call) => call.kind === "prune")).toBe(false);
  });

  it("never touches the database for an invalid set", async () => {
    const { client, calls } = createAdminClientStub();

    const result = await replaceUserBrandRoles(client, ALLOWED_USER_ID, []);

    expect(result.ok).toBe(false);
    expect(calls).toEqual([]);
  });
});
