import { describe, expect, it, vi } from "vitest";
import {
  ensureUncategorizedCategory,
  ensureUncategorizedSubcategory,
  UNCATEGORIZED_CATEGORY_CODE,
  UNCATEGORIZED_NAME
} from "@/lib/spending/uncategorized";

const BRAND_ID = "brand-1";
const CATEGORY_ID = "cat-1";

function createClient(handlers: {
  categoryLookup?: { data: unknown; error: unknown };
  categoryInsert?: { data: unknown; error: unknown };
  categoryRaced?: { data: unknown; error: unknown };
  subLookup?: { data: unknown; error: unknown };
  subInsert?: { data: unknown; error: unknown };
  subRaced?: { data: unknown; error: unknown };
}) {
  let categorySelectCount = 0;
  let subSelectCount = 0;

  return {
    from: vi.fn((table: string) => {
      if (table === "expense_categories") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => {
                  categorySelectCount += 1;
                  if (categorySelectCount === 1) {
                    return handlers.categoryLookup ?? { data: null, error: null };
                  }
                  return handlers.categoryRaced ?? { data: null, error: null };
                })
              }))
            }))
          })),
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => handlers.categoryInsert ?? { data: null, error: null })
            }))
          }))
        };
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => {
                subSelectCount += 1;
                if (subSelectCount === 1) {
                  return handlers.subLookup ?? { data: null, error: null };
                }
                return handlers.subRaced ?? { data: null, error: null };
              })
            }))
          }))
        })),
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => handlers.subInsert ?? { data: null, error: null })
          }))
        }))
      };
    })
  };
}

describe("ensureUncategorizedCategory", () => {
  it("returns an existing category without inserting", async () => {
    const client = createClient({
      categoryLookup: { data: { id: CATEGORY_ID, code: UNCATEGORIZED_CATEGORY_CODE, name: UNCATEGORIZED_NAME }, error: null }
    });
    const result = await ensureUncategorizedCategory(client, BRAND_ID);
    expect(result).toEqual({ id: CATEGORY_ID, name: UNCATEGORIZED_NAME });
  });

  it("creates the category when missing", async () => {
    const client = createClient({
      categoryLookup: { data: null, error: null },
      categoryInsert: {
        data: { id: CATEGORY_ID, code: UNCATEGORIZED_CATEGORY_CODE, name: UNCATEGORIZED_NAME },
        error: null
      }
    });
    const result = await ensureUncategorizedCategory(client, BRAND_ID);
    expect(result.id).toBe(CATEGORY_ID);
  });

  it("recovers from a unique-constraint race", async () => {
    const client = createClient({
      categoryLookup: { data: null, error: null },
      categoryInsert: { data: null, error: { code: "23505", message: "duplicate" } },
      categoryRaced: {
        data: { id: CATEGORY_ID, code: UNCATEGORIZED_CATEGORY_CODE, name: UNCATEGORIZED_NAME },
        error: null
      }
    });
    const result = await ensureUncategorizedCategory(client, BRAND_ID);
    expect(result.id).toBe(CATEGORY_ID);
  });
});

describe("ensureUncategorizedSubcategory", () => {
  it("creates a sub-category under the resolved parent category", async () => {
    const client = createClient({
      subLookup: { data: null, error: null },
      subInsert: {
        data: { id: "sub-1", category_id: CATEGORY_ID, name: UNCATEGORIZED_NAME },
        error: null
      }
    });
    const result = await ensureUncategorizedSubcategory(client, BRAND_ID, CATEGORY_ID);
    expect(result).toEqual({ id: "sub-1", name: UNCATEGORIZED_NAME });
  });
});
