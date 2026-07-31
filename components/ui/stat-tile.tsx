import type { ReactNode } from "react";

type StatTileProps = {
  label: string;
  value: ReactNode;
  sublabel?: ReactNode;
  className?: string;
};

export function StatTile({ label, value, sublabel, className = "" }: StatTileProps) {
  return (
    <article className={`card ${className}`.trim()}>
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-[rgb(var(--text))]">{value}</p>
      {sublabel ? <div className="mt-1 text-xs text-muted">{sublabel}</div> : null}
    </article>
  );
}

type StatTileGridProps = {
  children: ReactNode;
  className?: string;
};

export function StatTileGrid({ children, className = "" }: StatTileGridProps) {
  return (
    <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 ${className}`.trim()}>
      {children}
    </div>
  );
}
