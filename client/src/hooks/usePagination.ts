import { useState, useCallback, useMemo } from "react";

interface UsePaginationOptions {
  /** Total number of items */
  totalItems: number;
  /** Items per page */
  pageSize?: number;
  /** Starting page (1-indexed) */
  initialPage?: number;
}

interface UsePaginationReturn {
  /** Current page (1-indexed) */
  page: number;
  /** Items per page */
  pageSize: number;
  /** Total number of pages */
  totalPages: number;
  /** Offset for slicing arrays */
  offset: number;
  /** Go to next page */
  nextPage: () => void;
  /** Go to previous page */
  prevPage: () => void;
  /** Go to specific page */
  goToPage: (page: number) => void;
  /** Is on first page */
  isFirstPage: boolean;
  /** Is on last page */
  isLastPage: boolean;
  /** Slice a data array to the current page */
  paginate: <T>(data: T[]) => T[];
}

export function usePagination({
  totalItems,
  pageSize = 20,
  initialPage = 1,
}: UsePaginationOptions): UsePaginationReturn {
  const [page, setPage] = useState(initialPage);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(totalItems / pageSize)),
    [totalItems, pageSize]
  );

  // Clamp page if totalItems changes
  const clampedPage = Math.min(page, totalPages);
  if (clampedPage !== page) {
    setPage(clampedPage);
  }

  const offset = (clampedPage - 1) * pageSize;

  const nextPage = useCallback(() => {
    setPage((p) => Math.min(p + 1, totalPages));
  }, [totalPages]);

  const prevPage = useCallback(() => {
    setPage((p) => Math.max(p - 1, 1));
  }, []);

  const goToPage = useCallback(
    (target: number) => {
      setPage(Math.max(1, Math.min(target, totalPages)));
    },
    [totalPages]
  );

  const paginate = useCallback(
    <T,>(data: T[]): T[] => data.slice(offset, offset + pageSize),
    [offset, pageSize]
  );

  return {
    page: clampedPage,
    pageSize,
    totalPages,
    offset,
    nextPage,
    prevPage,
    goToPage,
    isFirstPage: clampedPage <= 1,
    isLastPage: clampedPage >= totalPages,
    paginate,
  };
}
