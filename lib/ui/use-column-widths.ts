"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

export type ColumnWidthDefaults = Record<string, number>;

type StoredColumnWidths = {
  version: number;
  widths: Record<string, number>;
};

type UseColumnWidthsOptions = {
  storageKey: string;
  defaults: ColumnWidthDefaults;
  /** Bump when columns are added/removed/renamed so stale localStorage is discarded. */
  schemaVersion?: number;
  minWidth?: number;
};

type ResizeHandleProps = {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onDoubleClick: () => void;
};

export type UseColumnWidthsResult = {
  widths: Record<string, number>;
  totalWidth: number;
  startResize: (columnKey: string, clientX: number) => void;
  resetColumn: (columnKey: string) => void;
  resetWidths: () => void;
  getResizeHandleProps: (columnKey: string) => ResizeHandleProps;
};

function clampWidth(value: number, minWidth: number): number {
  if (!Number.isFinite(value)) return minWidth;
  return Math.max(minWidth, Math.round(value));
}

function readStoredWidths(
  storageKey: string,
  schemaVersion: number,
  defaults: ColumnWidthDefaults,
  minWidth: number
): Record<string, number> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredColumnWidths;
    if (!parsed || parsed.version !== schemaVersion || typeof parsed.widths !== "object") {
      return null;
    }
    const next: Record<string, number> = { ...defaults };
    for (const key of Object.keys(defaults)) {
      const stored = parsed.widths[key];
      if (typeof stored === "number") {
        next[key] = clampWidth(stored, minWidth);
      }
    }
    return next;
  } catch {
    return null;
  }
}

function persistWidths(
  storageKey: string,
  schemaVersion: number,
  widths: Record<string, number>
) {
  if (typeof window === "undefined") return;
  try {
    const payload: StoredColumnWidths = { version: schemaVersion, widths };
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
  } catch {
    // Ignore quota / private-mode failures.
  }
}

export function useColumnWidths({
  storageKey,
  defaults,
  schemaVersion = 1,
  minWidth = 60
}: UseColumnWidthsOptions): UseColumnWidthsResult {
  const defaultsRef = useRef(defaults);
  defaultsRef.current = defaults;

  const [widths, setWidths] = useState<Record<string, number>>(() => ({ ...defaults }));
  const dragRef = useRef<{
    columnKey: string;
    startX: number;
    startWidth: number;
  } | null>(null);

  useEffect(() => {
    const stored = readStoredWidths(storageKey, schemaVersion, defaultsRef.current, minWidth);
    if (stored) setWidths(stored);
  }, [storageKey, schemaVersion, minWidth]);

  const persist = useCallback(
    (next: Record<string, number>) => {
      persistWidths(storageKey, schemaVersion, next);
    },
    [storageKey, schemaVersion]
  );

  const startResize = useCallback(
    (columnKey: string, clientX: number) => {
      if (!(columnKey in defaultsRef.current)) return;
      dragRef.current = {
        columnKey,
        startX: clientX,
        startWidth: widths[columnKey] ?? defaultsRef.current[columnKey]
      };

      function onPointerMove(event: PointerEvent) {
        const drag = dragRef.current;
        if (!drag) return;
        const delta = event.clientX - drag.startX;
        const nextWidth = clampWidth(drag.startWidth + delta, minWidth);
        setWidths((prev) => {
          if (prev[drag.columnKey] === nextWidth) return prev;
          return { ...prev, [drag.columnKey]: nextWidth };
        });
      }

      function onPointerUp() {
        const drag = dragRef.current;
        dragRef.current = null;
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        if (!drag) return;
        setWidths((prev) => {
          persist(prev);
          return prev;
        });
      }

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    },
    [minWidth, persist, widths]
  );

  const resetColumn = useCallback(
    (columnKey: string) => {
      const defaultWidth = defaultsRef.current[columnKey];
      if (defaultWidth === undefined) return;
      setWidths((prev) => {
        const next = { ...prev, [columnKey]: defaultWidth };
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const resetWidths = useCallback(() => {
    const next = { ...defaultsRef.current };
    setWidths(next);
    persist(next);
  }, [persist]);

  const getResizeHandleProps = useCallback(
    (columnKey: string): ResizeHandleProps => ({
      onPointerDown: (event) => {
        event.preventDefault();
        event.stopPropagation();
        (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
        startResize(columnKey, event.clientX);
      },
      onDoubleClick: () => resetColumn(columnKey)
    }),
    [resetColumn, startResize]
  );

  const totalWidth = useMemo(
    () => Object.values(widths).reduce((sum, value) => sum + value, 0),
    [widths]
  );

  return {
    widths,
    totalWidth,
    startResize,
    resetColumn,
    resetWidths,
    getResizeHandleProps
  };
}
