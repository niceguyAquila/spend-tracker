"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export const DEFAULT_PAGE_SIZE = 20;

export const PAGE_SIZE_OPTIONS = [20, 50, 100, 200] as const;

export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

export function isPageSize(value: number): value is PageSize {
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(value);
}

export function sliceForPage<T>(items: readonly T[], page: number, pageSize: number): T[] {
  const start = page * pageSize;
  return items.slice(start, start + pageSize);
}

type UseTablePaginationResult = {
  page: number;
  setPage: (page: number) => void;
  pageSize: PageSize;
  setPageSize: (size: PageSize) => void;
  pageCount: number;
  startIndex: number;
  endIndex: number;
  rangeLabel: string;
};

/**
 * Client-side table pagination. Clamps the current page when the total count shrinks
 * (e.g. after filtering). `setPageSize` resets the page to 0.
 */
export function useTablePagination(totalCount: number): UseTablePaginationResult {
  const [page, setPageState] = useState(0);
  const [pageSize, setPageSizeState] = useState<PageSize>(DEFAULT_PAGE_SIZE);

  const pageCount = useMemo(
    () => (totalCount === 0 ? 0 : Math.ceil(totalCount / pageSize)),
    [totalCount, pageSize]
  );

  useEffect(() => {
    if (pageCount === 0) {
      if (page !== 0) {
        setPageState(0);
      }
      return;
    }
    if (page > pageCount - 1) {
      setPageState(pageCount - 1);
    }
  }, [page, pageCount]);

  const setPage = useCallback(
    (next: number) => {
      setPageState(() => {
        if (pageCount === 0) {
          return 0;
        }
        const max = pageCount - 1;
        if (next < 0) {
          return 0;
        }
        if (next > max) {
          return max;
        }
        return next;
      });
    },
    [pageCount]
  );

  const setPageSize = useCallback((size: PageSize) => {
    setPageSizeState(size);
    setPageState(0);
  }, []);

  const startIndex = pageCount === 0 ? 0 : page * pageSize;
  const endIndex = pageCount === 0 ? 0 : Math.min(startIndex + pageSize, totalCount);

  const rangeLabel =
    totalCount === 0
      ? "0 of 0"
      : `Showing ${startIndex + 1}–${endIndex} of ${totalCount.toLocaleString("en-US")}`;

  return {
    page,
    setPage,
    pageSize,
    setPageSize,
    pageCount,
    startIndex,
    endIndex,
    rangeLabel
  };
}
