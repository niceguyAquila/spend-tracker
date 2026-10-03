"use client";

import { use, Suspense, useMemo } from "react";
import type {
  BigBookActorCurrencyMetrics,
  BigBookActorPocketMetrics,
  BigBookVendorActorOutstandingDebtRow,
  BigBookVendorActorOutstandingRow
} from "@/lib/types";
import { BigBookVendorActorOutstandingTable } from "@/components/big-book-vendor-actor-outstanding-table";
import { BigBookVendorActorOutstandingDebtTable } from "@/components/big-book-vendor-actor-outstanding-debt-table";
import { formatAmount, getAmountColorClass } from "@/lib/display-format";
import { sumOutstandingByCurrency } from "@/lib/big-book/debt";

export type BigBookMetricsBundle = {
  actorMetrics: BigBookActorCurrencyMetrics[];
  actorPocketMetrics: BigBookActorPocketMetrics[];
  vendorActorOutstanding: BigBookVendorActorOutstandingRow[];
  vendorActorOutstandingDebt: BigBookVendorActorOutstandingDebtRow[];
};

const SUPPORTED_CURRENCIES: Array<"IDR" | "MYR" | "USDT" | "TRX"> = ["IDR", "MYR", "USDT", "TRX"];
const DEBT_AMOUNT_CLASS = "text-[rgb(var(--danger))]";

function TotalsBox({
  label,
  value,
  breakdown,
  forceNegativeColor
}: {
  label: string;
  value: number;
  breakdown?: Array<{ label: string; value: number }>;
  forceNegativeColor?: boolean;
}) {
  const valueClass = forceNegativeColor
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
                  forceNegativeColor
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
      <section className="card h-56 animate-pulse bg-[rgb(var(--surface-muted))]" />
      <section className="card h-40 animate-pulse bg-[rgb(var(--surface-muted))]" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="card h-40 min-w-0 animate-pulse bg-[rgb(var(--surface-muted))]" />
        <section className="card h-40 min-w-0 animate-pulse bg-[rgb(var(--surface-muted))]" />
      </div>
    </div>
  );
}

export function BigBookMetricsCardsView({
  actorCurrencyMetrics,
  actorPocketMetrics: _actorPocketMetrics,
  vendorActorOutstanding,
  vendorActorOutstandingDebt,
  onOutstandingSettled
}: {
  actorCurrencyMetrics: BigBookActorCurrencyMetrics[];
  actorPocketMetrics: BigBookActorPocketMetrics[];
  vendorActorOutstanding: BigBookVendorActorOutstandingRow[];
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
      </section>

      <section className="card">
        <h2 className="text-lg font-semibold">Outstanding Credit & Debt Totals</h2>
        <p className="mt-1 text-sm text-muted">
          Open (unsettled) credit and debt balances by currency. Credit amounts use the usual signed
          color; debt amounts are shown in red as outflow liability.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <article className="rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] p-4">
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
          <article className="rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] p-4">
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
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="card min-w-0 overflow-hidden">
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

        <section className="card min-w-0 overflow-hidden">
          <h2 className="text-lg font-semibold">Outstanding Debt by Vendor and Actor (All Time)</h2>
          <p className="mt-1 text-sm text-muted">
            Total of open debts (we owe the counterparty, not yet settled) by vendor and actor, per
            currency. Amounts are shown in red.
          </p>
          <BigBookVendorActorOutstandingDebtTable rows={vendorActorOutstandingDebt} />
        </section>
      </div>
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
