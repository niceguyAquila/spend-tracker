import { describe, expect, it } from "vitest";
import { mergePocketMetricsWithWebSpending } from "@/lib/big-book/pocket-metrics";

describe("mergePocketMetricsWithWebSpending", () => {
  const bigBookRows = [
    {
      actor_id: "actor-a",
      actor_code: "A" as const,
      actor_display_name: "Alice",
      pocket_id: "pocket-1",
      pocket_name: "Petty Cash",
      is_active: true,
      net: 1000
    },
    {
      actor_id: "actor-a",
      actor_code: "A" as const,
      actor_display_name: "Alice",
      pocket_id: "pocket-2",
      pocket_name: "Ops",
      is_active: true,
      net: -200,
      linked_brand_id: null
    },
    {
      actor_id: "actor-b",
      actor_code: "B" as const,
      actor_display_name: "Bob",
      pocket_id: "pocket-3",
      pocket_name: "Float",
      is_active: false,
      net: 50
    }
  ];

  it("combines big book and web spending nets", () => {
    const merged = mergePocketMetricsWithWebSpending(bigBookRows, [
      {
        pocket_id: "pocket-1",
        brand_id: "brand-1",
        brand_name: "ZenPlay",
        net: -300
      }
    ]);

    expect(merged).toHaveLength(2);
    const alice = merged.find((group) => group.actor_id === "actor-a");
    expect(alice).toBeTruthy();
    const petty = alice!.pockets.find((pocket) => pocket.pocket_id === "pocket-1");
    expect(petty).toMatchObject({
      big_book_net: 1000,
      web_spending_net: -300,
      net: 700,
      linked_brand_id: "brand-1",
      linked_brand_name: "ZenPlay"
    });
  });

  it("defaults web spending to 0 for unlinked pockets", () => {
    const merged = mergePocketMetricsWithWebSpending(bigBookRows, []);
    const alice = merged.find((group) => group.actor_id === "actor-a");
    const ops = alice!.pockets.find((pocket) => pocket.pocket_id === "pocket-2");
    expect(ops).toMatchObject({
      big_book_net: -200,
      web_spending_net: 0,
      net: -200,
      linked_brand_id: null,
      linked_brand_name: null
    });
  });

  it("treats a missing web-spending list the same as an empty merge input", () => {
    const withEmpty = mergePocketMetricsWithWebSpending(bigBookRows, []);
    expect(withEmpty[0].pockets.every((pocket) => pocket.web_spending_net === 0)).toBe(true);
    expect(withEmpty[0].pockets[0].net).toBe(withEmpty[0].pockets[0].big_book_net);
  });
});
