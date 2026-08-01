import type { BigBookActorPocketMetrics, BigBookPocketMetrics } from "@/lib/types";

export type PocketWebSpendingRow = {
  pocket_id: string;
  brand_id: string;
  brand_name: string;
  net: number;
};

export type PocketBigBookMetricRow = {
  actor_id: string;
  actor_code: "A" | "B";
  actor_display_name: string;
  pocket_id: string;
  pocket_name: string;
  is_active: boolean;
  net: number;
  linked_brand_id?: string | null;
};

export function mergePocketMetricsWithWebSpending(
  bigBookRows: PocketBigBookMetricRow[],
  webSpendingRows: PocketWebSpendingRow[]
): BigBookActorPocketMetrics[] {
  const webByPocket = new Map(
    webSpendingRows.map((row) => [
      row.pocket_id,
      {
        linked_brand_id: row.brand_id,
        linked_brand_name: row.brand_name,
        web_spending_net: Number(row.net)
      }
    ])
  );

  const byActor = new Map<string, BigBookActorPocketMetrics>();

  for (const row of bigBookRows) {
    const group =
      byActor.get(row.actor_id) ??
      ({
        actor_id: row.actor_id,
        actor_code: row.actor_code ?? "A",
        actor_display_name: row.actor_display_name ?? "Unknown Actor",
        pockets: [] as BigBookPocketMetrics[]
      } as BigBookActorPocketMetrics);

    const web = webByPocket.get(row.pocket_id);
    const bigBookNet = Number(row.net);
    const webSpendingNet = web?.web_spending_net ?? 0;

    group.pockets.push({
      pocket_id: row.pocket_id,
      pocket_name: row.pocket_name,
      is_active: row.is_active,
      big_book_net: bigBookNet,
      web_spending_net: webSpendingNet,
      linked_brand_id: web?.linked_brand_id ?? row.linked_brand_id ?? null,
      linked_brand_name: web?.linked_brand_name ?? null,
      net: bigBookNet + webSpendingNet
    });
    byActor.set(row.actor_id, group);
  }

  return [...byActor.values()].sort((a, b) => a.actor_code.localeCompare(b.actor_code));
}
