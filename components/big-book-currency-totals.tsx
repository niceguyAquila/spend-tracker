import type { BigBookCurrencyTotal } from "@/lib/big-book/totals";
import { formatAmount, getAmountColorClass } from "@/lib/display-format";

const AMOUNT = { minimumFractionDigits: 2, maximumFractionDigits: 4 } as const;

type Props = {
  totals: BigBookCurrencyTotal[];
  showHeader?: boolean;
  showNet?: boolean;
};

function AmountCell({
  value,
  colorValue,
  className = ""
}: {
  value: number;
  colorValue?: number;
  className?: string;
}) {
  if (value === 0) {
    return <span className={`text-right tabular-nums text-muted ${className}`.trim()}>—</span>;
  }
  return (
    <span
      className={`text-right tabular-nums ${className} ${getAmountColorClass(colorValue ?? value)}`.trim()}
    >
      {formatAmount(value, AMOUNT)}
    </span>
  );
}

export function BigBookCurrencyTotals({ totals, showHeader = false, showNet = true }: Props) {
  if (!totals.length) {
    return <span className="text-xs text-muted">-</span>;
  }

  const gridClass = showNet
    ? "grid grid-cols-[3.5rem_repeat(3,11rem)] items-baseline gap-x-4"
    : "grid grid-cols-[3.5rem_repeat(2,11rem)] items-baseline gap-x-4";

  return (
    <div className="space-y-1 text-sm">
      {showHeader ? (
        <div className={`${gridClass} border-b border-[rgb(var(--border))] pb-1`}>
          <span aria-hidden="true" />
          <span className="text-right text-xs uppercase tracking-wide text-muted">Out</span>
          <span className="text-right text-xs uppercase tracking-wide text-muted">In</span>
          {showNet ? (
            <span className="text-right text-xs uppercase tracking-wide text-muted">Net</span>
          ) : null}
        </div>
      ) : null}
      {totals.map((total) => (
        <div key={total.currency} className={gridClass}>
          <span className="font-medium text-muted">{total.currency}</span>
          <AmountCell value={total.spending} colorValue={-total.spending} />
          <AmountCell value={total.profit} />
          {showNet ? <AmountCell value={total.net} className="font-semibold" /> : null}
        </div>
      ))}
    </div>
  );
}
