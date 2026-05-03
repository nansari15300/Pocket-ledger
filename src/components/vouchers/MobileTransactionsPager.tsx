"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Props = {
  currentPage: number;
  totalItems: number;
  rowsPerPage: number;
  onPageChange: (nextPage: number) => void;
  onRowsPerPageChange: (nextRowsPerPage: number) => void;
  className?: string;
  /** Party-style newest-first slice: pehle kitne vouchers window se pehle, kitne baad (dropdown = page size). */
  edgeCounts?: { before: number; after: number };
  /** Bank statement: "Showing / Trxn Of total" line hata — sirf page-size select + Prev/Next (count clutter avoid). */
  trimSummary?: boolean;
};

const PAGE_SIZE_OPTIONS = [10, 20, 30, 50, 100] as const;

export function MobileTransactionsPager({
  currentPage,
  totalItems,
  rowsPerPage,
  onPageChange,
  onRowsPerPageChange,
  className,
  edgeCounts,
  trimSummary = false,
}: Props) {
  const totalPages = Math.max(1, rowsPerPage > 0 ? Math.ceil(totalItems / rowsPerPage) : 1);
  const safePage = Math.min(Math.max(1, currentPage), totalPages);

  return (
    <div className={cn("border-t bg-muted/20 px-2 py-0.5 font-bold", className)}>
      <div className="overflow-x-auto">
        <div className="flex w-max min-w-full items-center justify-between gap-1.5">
          <div className="flex min-w-0 items-center gap-1">
            <Button
              type="button"
              variant="default"
              size="sm"
              className="h-5 shrink-0 px-1.5 text-[10px] font-bold bg-blue-600 hover:bg-blue-700 text-white disabled:bg-gray-200 disabled:text-gray-500"
              onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
              disabled={safePage >= totalPages}
            >
              Prev
            </Button>
            {edgeCounts != null && rowsPerPage > 0 ? (
              <span
                className="min-w-[1.25rem] shrink-0 text-center text-[10px] font-bold tabular-nums text-muted-foreground"
                title="Older vouchers before this page"
                aria-label={`${edgeCounts.before} vouchers before this page`}
              >
                {edgeCounts.before}
              </span>
            ) : null}
          </div>
          <div
            className={cn(
              "flex shrink-0 items-center gap-1 text-[10px] font-bold",
              trimSummary && "flex-1 justify-center min-w-0"
            )}
          >
            {!trimSummary ? (
              <span className="whitespace-nowrap text-muted-foreground">Showing</span>
            ) : null}
            <Select
              value={String(rowsPerPage)}
              onValueChange={(value) => onRowsPerPageChange(Number(value) || 0)}
            >
              <SelectTrigger
                className="h-5 w-[70px] text-[10px] font-bold"
                aria-label="Rows per page"
                title="Rows per page"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
                <SelectItem value="0">All</SelectItem>
              </SelectContent>
            </Select>
            {!trimSummary ? (
              <span className="whitespace-nowrap text-muted-foreground">
                Trxn Of <span className="tabular-nums">{totalItems}</span>
              </span>
            ) : null}
          </div>
          <div className="flex min-w-0 items-center gap-1">
            {edgeCounts != null && rowsPerPage > 0 ? (
              <span
                className="min-w-[1.25rem] shrink-0 text-center text-[10px] font-bold tabular-nums text-muted-foreground"
                title="Newer vouchers after this page"
                aria-label={`${edgeCounts.after} vouchers after this page`}
              >
                {edgeCounts.after}
              </span>
            ) : null}
            <Button
              type="button"
              variant="default"
              size="sm"
              className="h-5 shrink-0 px-1.5 text-[10px] font-bold bg-green-600 hover:bg-green-700 text-white disabled:bg-gray-200 disabled:text-gray-500"
              onClick={() => onPageChange(Math.max(1, safePage - 1))}
              disabled={safePage <= 1}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
