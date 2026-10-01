"use client";

import { use, Suspense } from "react";
import type {
  BigBookActorCurrencyMetrics,
  BigBookActorPocketMetrics,
  BigBookVendorActorOutstandingRow
} from "@/lib/types";
import { BigBookVendorActorOutstandingTable } from "@/components/big-book-vendor-actor-outstanding-table";
import { formatAmount, getAmountColorClass } from "@/lib/display-format";

export type BigBookMetricsBundle = {
  actorMetrics: BigBookActorCurrencyMetrics[];
  actorPocketMetrics: BigBookActorPocketMetrics[];
  vendorActorOutstanding: BigBookVendorActorOutstandingRow[];
};

const SUPPORTED_CURRENCIES: Array<"IDR" | "MYR" | "USDT" | "TRX"> = ["IDR", "MYR", "USDT", "TRX"];

function TotalsBox({
  label,
  value,
  breakdown
}: {
  label: string;
  value: number;
  breakdown?: Array<{ label: string; value: number }>;
}) {
  return (
    <div className="rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-2">
      <p className="text-xs uppercase text-[rgb(var(--text-muted))]">{label}</p>
      <p className={`font-medium ${getAmountColorClass(value)}`}>
        {formatAmount(value, { minimumFractionDigits: 0, maximumFractionDigits: 4 })}
      </p>
      {breakdown?.length ? (
        <ul className="mt-1 space-y-0.5 text-[11px] text-[rgb(var(--text-muted))]">
          {breakdown.map((item) => (
            <li key={item.label} className="flex items-center justify-between gap-2">
              <span>{item.label}</span>
              <span className={getAmountColorClass(item.value)}>
                {formatAmount(item.value, { minimumFractionDigits: 0, maximumFractionDigits: 4 })}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function BigBookMetricsSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <section className="card h-56 animate-pulse bg-[rgb(var(--surface-muted))]" />
      <section className="card h-40 animate-pulse bg-[rgb(var(--surface-muted))]" />
    </div>
  );
}

export function BigBookMetricsCardsView({
  actorCurrencyMetrics,
  actorPocketMetrics: _actorPocketMetrics,
  vendorActorOutstanding,
  onOutstandingSettled
}: {
  actorCurrencyMetrics: BigBookActorCurrencyMetrics[];
  actorPocketMetrics: BigBookActorPocketMetrics[];
  vendorActorOutstanding: BigBookVendorActorOutstandingRow[];
  onOutstandingSettled?: () => void;
}) {
  const combinedCurrencyTotals = actorCurrencyMetrics.reduce(
    (acc, metric) => {
      for (const currency of SUPPORTED_CURRENCIES) acc[currency] += metric.totals[currency];
      return acc;
    },
    { IDR: 0, MYR: 0, USDT: 0, TRX: 0 } as BigBookActorCurrencyMetrics["totals"]
  );

  return (
    <>
      <section className="card">
        <h2 className="text-lg font-semibold">Grand Total by Actor (All Time)</h2>
        <p className="mt-1 text-sm text-muted">
          Total amount grouped by actor and currency across all Big Book records. Pocket-tagged entries
          stay excluded from these actor columns.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <article className="rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] p-4">
            <p className="font-semibold">All Actors</p>
            <div className="mt-3 space-y-2 text-sm">
              {SUPPORTED_CURRENCIES.map((currency) => (
                <TotalsBox key={currency} label={currency} value={combinedCurrencyTotals[currency]} />
              ))}
            </div>
          </article>

          {actorCurrencyMetrics.map((metric) => (
            <article
              key={metric.actor_id}
              className="rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] p-4"
            >
              <p className="font-semibold">Actor {metric.actor_display_name}</p>
              <div className="mt-3 space-y-2 text-sm">
                {SUPPORTED_CURRENCIES.map((currency) => (
                  <TotalsBox key={currency} label={currency} value={metric.totals[currency]} />
                ))}
              </div>
            </article>
          ))}
          {!actorCurrencyMetrics.length ? (
            <p className="text-sm text-muted sm:col-span-1 xl:col-span-2">No actor totals yet.</p>
          ) : null}
        </div>
      </section>

      <section className="card">
        <h2 className="text-lg font-semibold">Outstanding Credit by Vendor and Actor (All Time)</h2>
        <p className="mt-1 text-sm text-muted">
          Total of open credits (not yet marked settled) by vendor and actor, per currency. Settle one
          vendor row or multi-select rows/credits for bulk settlement.
        </p>
        <BigBookVendorActorOutstandingTable
          rows={vendorActorOutstanding}
          onSettled={onOutstandingSettled}
        />
      </section>
    </>
  );
}

function BigBookMetricsFromPromise({
  promise,
  onOutstandingSettled
}: {
  promise: Promise<BigBookMetricsBundle>;
  onOutstandingSettled?: () => void;
}) {
  const metrics = use(promise);
  return (
    <BigBookMetricsCardsView
      actorCurrencyMetrics={metrics.actorMetrics}
      actorPocketMetrics={metrics.actorPocketMetrics}
      vendorActorOutstanding={metrics.vendorActorOutstanding}
      onOutstandingSettled={onOutstandingSettled}
    />
  );
}

/**
 * Streams metrics via Suspense when `promise` is provided and no override exists.
 * After mutations, pass `override` so cards update without remounting the panel.
 */
export function BigBookMetricsSection({
  promise,
  override,
  onOutstandingSettled
}: {
  promise?: Promise<BigBookMetricsBundle>;
  override?: BigBookMetricsBundle | null;
  onOutstandingSettled?: () => void;
}) {
  if (override) {
    return (
      <BigBookMetricsCardsView
        actorCurrencyMetrics={override.actorMetrics}
        actorPocketMetrics={override.actorPocketMetrics}
        vendorActorOutstanding={override.vendorActorOutstanding}
        onOutstandingSettled={onOutstandingSettled}
      />
    );
  }

  if (!promise) {
    return <BigBookMetricsSkeleton />;
  }

  return (
    <Suspense fallback={<BigBookMetricsSkeleton />}>
      <BigBookMetricsFromPromise promise={promise} onOutstandingSettled={onOutstandingSettled} />
    </Suspense>
  );
}
