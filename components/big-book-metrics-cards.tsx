"use client";

import { use, Suspense, useMemo } from "react";
import type {
  BigBookActorCurrencyMetrics,
  BigBookActorPocketMetrics,
  BigBookVendorActorOutstandingDebtRow,
  BigBookVendorActorOutstandingRow
} from "@/lib/types";
import { BigBookOutstandingTabs } from "@/components/big-book-outstanding-tabs";
import { formatAmount, getAmountColorClass } from "@/lib/display-format";
import { sumOutstandingByCurrency } from "@/lib/big-book/debt";

export type BigBookMetricsBundle = {
  actorMetrics: BigBookActorCurrencyMetrics[];
  actorPocketMetrics: BigBookActorPocketMetrics[];
  vendorActorOutstanding: BigBookVendorActorOutstandingRow[];
  vendorActorOutstandingFuture: BigBookVendorActorOutstandingRow[];
  vendorActorOutstandingDebt: BigBookVendorActorOutstandingDebtRow[];
};

const SUPPORTED_CURRENCIES: Array<"IDR" | "MYR" | "USDT" | "TRX"> = ["IDR", "MYR", "USDT", "TRX"];
const DEBT_AMOUNT_CLASS = "text-[rgb(var(--danger))]";
const WARNING_AMOUNT_CLASS = "text-[rgb(var(--warning))]";

function TotalsBox({
  label,
  value,
  breakdown,
  forceNegativeColor,
  forceWarningColor
}: {
  label: string;
  value: number;
  breakdown?: Array<{ label: string; value: number }>;
  forceNegativeColor?: boolean;
  forceWarningColor?: boolean;
}) {
  const valueClass = forceWarningColor
    ? value !== 0
      ? WARNING_AMOUNT_CLASS
      : "text-muted"
    : forceNegativeColor
      ? value !== 0
        ? DEBT_AMOUNT_CLASS
        : "text-muted"
      : getAmountColorClass(value);
  return (
    <div className="rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-2">
      <p className="text-xs uppercase text-[rgb(var(--text-muted))]">{label}</p>
      <p className={`font-medium ${valueClass}`}>
        {formatAmount(value, { minimumFractionDigits: 0, maximumFractionDigits: 4 })}
      </p>
      {breakdown?.length ? (
        <ul className="mt-1 space-y-0.5 text-[11px] text-[rgb(var(--text-muted))]">
          {breakdown.map((item) => (
            <li key={item.label} className="flex items-center justify-between gap-2">
              <span>{item.label}</span>
              <span
                className={
                  forceWarningColor
                    ? item.value !== 0
                      ? WARNING_AMOUNT_CLASS
                      : "text-muted"
                    : forceNegativeColor
                      ? item.value !== 0
                        ? DEBT_AMOUNT_CLASS
                        : "text-muted"
                      : getAmountColorClass(item.value)
                }
              >
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
      <section className="card h-72 animate-pulse bg-[rgb(var(--surface-muted))]" />
      <section className="card h-56 animate-pulse bg-[rgb(var(--surface-muted))]" />
    </div>
  );
}

export function BigBookMetricsCardsView({
  actorCurrencyMetrics,
  actorPocketMetrics: _actorPocketMetrics,
  vendorActorOutstanding,
  vendorActorOutstandingFuture,
  vendorActorOutstandingDebt,
  onOutstandingSettled
}: {
  actorCurrencyMetrics: BigBookActorCurrencyMetrics[];
  actorPocketMetrics: BigBookActorPocketMetrics[];
  vendorActorOutstanding: BigBookVendorActorOutstandingRow[];
  vendorActorOutstandingFuture: BigBookVendorActorOutstandingRow[];
  vendorActorOutstandingDebt: BigBookVendorActorOutstandingDebtRow[];
  onOutstandingSettled?: () => void;
}) {
  const combinedCurrencyTotals = actorCurrencyMetrics.reduce(
    (acc, metric) => {
      for (const currency of SUPPORTED_CURRENCIES) acc[currency] += metric.totals[currency];
      return acc;
    },
    { IDR: 0, MYR: 0, USDT: 0, TRX: 0 } as BigBookActorCurrencyMetrics["totals"]
  );

  const creditTotals = useMemo(
    () =>
      sumOutstandingByCurrency(
        vendorActorOutstanding.map((row) => ({
          currency: row.currency,
          outstanding: row.outstanding,
          openCount: row.open_credit_count
        }))
      ),
    [vendorActorOutstanding]
  );

  const futureCreditTotals = useMemo(
    () =>
      sumOutstandingByCurrency(
        vendorActorOutstandingFuture.map((row) => ({
          currency: row.currency,
          outstanding: row.outstanding,
          openCount: row.open_credit_count
        }))
      ),
    [vendorActorOutstandingFuture]
  );

  const debtTotals = useMemo(
    () =>
      sumOutstandingByCurrency(
        vendorActorOutstandingDebt.map((row) => ({
          currency: row.currency,
          outstanding: row.outstanding,
          openCount: row.open_debt_count
        }))
      ),
    [vendorActorOutstandingDebt]
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

        <div className="mt-6 rounded-lg border border-[rgb(var(--border))] border-l-[3px] border-l-[rgb(var(--primary))] bg-[rgb(var(--surface-muted))]/70 p-4">
          <h3 className="text-base font-semibold">Outstanding Credit & Debt Totals</h3>
          <p className="mt-1 text-sm text-muted">
            Open (unsettled) balances by currency. Credit uses the usual signed color; Future Credit is
            shown in warning amber (excluded from cash totals until actualized); debt is red as outflow
            liability.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <article className="rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
              <p className="font-semibold">Total outstanding credit</p>
              <div className="mt-3 space-y-2 text-sm">
                {creditTotals.length ? (
                  creditTotals.map((total) => (
                    <TotalsBox
                      key={total.currency}
                      label={`${total.currency} · ${total.openCount} open`}
                      value={total.outstanding}
                    />
                  ))
                ) : (
                  <p className="text-sm text-muted">No open credits.</p>
                )}
              </div>
            </article>
            <article className="rounded-md border border-[rgb(var(--warning)/0.45)] bg-[rgb(var(--warning)/0.08)] p-4">
              <p className="font-semibold text-[rgb(var(--warning))]">Total outstanding Future Credit</p>
              <div className="mt-3 space-y-2 text-sm">
                {futureCreditTotals.length ? (
                  futureCreditTotals.map((total) => (
                    <TotalsBox
                      key={total.currency}
                      label={`${total.currency} · ${total.openCount} open`}
                      value={total.outstanding}
                      forceWarningColor
                    />
                  ))
                ) : (
                  <p className="text-sm text-muted">No open Future Credits.</p>
                )}
              </div>
            </article>
            <article className="rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
              <p className="font-semibold">Total outstanding debt</p>
              <div className="mt-3 space-y-2 text-sm">
                {debtTotals.length ? (
                  debtTotals.map((total) => (
                    <TotalsBox
                      key={total.currency}
                      label={`${total.currency} · ${total.openCount} open`}
                      value={total.outstanding}
                      forceNegativeColor
                    />
                  ))
                ) : (
                  <p className="text-sm text-muted">No open debts.</p>
                )}
              </div>
            </article>
          </div>
        </div>
      </section>

      <BigBookOutstandingTabs
        title="Outstanding by Vendor / Group and Actor (All Time)"
        vendorActorOutstanding={vendorActorOutstanding}
        vendorActorOutstandingFuture={vendorActorOutstandingFuture}
        vendorActorOutstandingDebt={vendorActorOutstandingDebt}
        onChanged={onOutstandingSettled}
      />
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
      vendorActorOutstandingFuture={metrics.vendorActorOutstandingFuture}
      vendorActorOutstandingDebt={metrics.vendorActorOutstandingDebt}
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
        vendorActorOutstandingFuture={override.vendorActorOutstandingFuture}
        vendorActorOutstandingDebt={override.vendorActorOutstandingDebt}
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
