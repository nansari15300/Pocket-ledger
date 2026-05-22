"use client";

import * as React from "react";
import { LedgerFooterPaginationBar } from "@/components/vouchers/LedgerFooterPaginationBar";
import {
  TransactionTableSortDropdown,
  type TransactionSortBy,
  type TransactionSortOrder,
} from "@/components/vouchers/TransactionTableSortDropdown";
import { ledgerFooterPillBtnCn, ledgerFooterRowCn } from "@/components/vouchers/ledgerFooterChrome";
import { cn } from "@/lib/utils";

/** Reconciling footer — pagination dono side alag, sort beech me ek baar (dono side sync). */
export function ReconciliationLedgerFooter({
  sortBy,
  sortOrder,
  onSortChange,
  currentPage,
  totalPages,
  setCurrentPage,
  rowsPerPageSelectValue,
  onRowsPerPageChange,
  leftBeforeCount,
  leftAfterCount,
  leftTotalCount,
  rightBeforeCount,
  rightAfterCount,
  rightTotalCount,
  className,
}: {
  sortBy: TransactionSortBy;
  sortOrder: TransactionSortOrder;
  onSortChange: (sortBy: TransactionSortBy, sortOrder: TransactionSortOrder) => void;
  currentPage: number;
  totalPages: number;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  rowsPerPageSelectValue: string;
  onRowsPerPageChange: (value: string) => void;
  leftBeforeCount: number;
  leftAfterCount: number;
  leftTotalCount: number;
  rightBeforeCount: number;
  rightAfterCount: number;
  rightTotalCount: number;
  className?: string;
}) {
  const paginationShared = {
    sortBy,
    sortOrder,
    onSortChange,
    viewMode: "statement" as const,
    currentPage,
    totalPages,
    setCurrentPage,
    rowsPerPageSelectValue,
    onRowsPerPageChange,
  };

  return (
    <div
      className={cn(
        "shrink-0 border-t bg-background py-2 px-3 md:px-4 overflow-auto min-h-0 scrollbar-slim-dim",
        className
      )}
    >
      <div className="grid min-w-max grid-cols-1 items-center gap-y-2 md:grid-cols-[1fr_auto_1fr] md:gap-x-2">
        {/* Left side pagination — You ledger */}
        <LedgerFooterPaginationBar
          {...paginationShared}
          hideSort
          beforeCount={leftBeforeCount}
          afterCount={leftAfterCount}
          totalCount={leftTotalCount}
          className="justify-start md:justify-end sm:ml-0"
        />

        {/* Sort — dono side ek saath */}
        <div className={cn(ledgerFooterRowCn, "justify-center px-1")}>
          <TransactionTableSortDropdown
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSortChange={onSortChange}
            viewMode="statement"
            chromePill
            className={ledgerFooterPillBtnCn}
          />
        </div>

        {/* Right side pagination — remote ledger */}
        <LedgerFooterPaginationBar
          {...paginationShared}
          hideSort
          beforeCount={rightBeforeCount}
          afterCount={rightAfterCount}
          totalCount={rightTotalCount}
          className="justify-start md:justify-start sm:ml-0"
        />
      </div>
    </div>
  );
}
