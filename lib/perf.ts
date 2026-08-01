/**
 * Lightweight request-timing helpers for page-load optimization.
 * Enabled only when PERF_DEBUG=1 so production logs stay clean.
 *
 * Usage:
 *   const end = perfStart("requireAllowedUser");
 *   // ... work ...
 *   end();
 *
 * Or:
 *   await perfTimed("getBigBookLedgerRowsPaged", () => getBigBookLedgerRowsPaged(...));
 */

const enabled = process.env.PERF_DEBUG === "1";

export function perfStart(label: string): () => void {
  if (!enabled) return () => undefined;
  const start = performance.now();
  return () => {
    const ms = performance.now() - start;
    console.log(`[perf] ${label}: ${ms.toFixed(1)}ms`);
  };
}

export async function perfTimed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const end = perfStart(label);
  try {
    return await fn();
  } finally {
    end();
  }
}
