"use client";

import * as React from "react";
import { LedgerFooterPaginationBar } from "@/components/vouchers/LedgerFooterPaginationBar";
import {
  TransactionTableSortDropdown,
  type TransactionSortBy,
  type TransactionSortOrder,
} from "@/components/vouchers/TransactionTableSortDropdown";
import {
  LEDGER_FOOTER_GAP,
  LEDGER_FOOTER_PILL_H,
  ledgerFooterPillBtnCn,
  ledgerFooterRowCn,
} from "@/components/vouchers/ledgerFooterChrome";
import { cn } from "@/lib/utils";

/** Reconciling footer meta — blue pagination pill jaisi fill; green border + bg (green-50 nahi) */
const reconFooterMetaParentPillCn = cn(
  "inline-flex shrink-0 flex-nowrap items-center rounded-full px-2 shadow-none",
  LEDGER_FOOTER_PILL_H,
  LEDGER_FOOTER_GAP,
  "text-sm font-medium pl-chrome-btn-drop border border-green-300 bg-green-100/80 text-green-900"
);

function ReconFooterSideMetaPill({
  sideLabel,
  companyName,
  accountName,
  trxnCount,
  className,
}: {
  sideLabel: "Owned" | "Other";
  companyName: string;
  accountName?: string;
  trxnCount: number;
  className?: string;
}) {
  const companyLabel = String(companyName || "—").trim() || "—";
  const accountLabel = String(accountName || "").trim();
  return (
    <span className={cn(reconFooterMetaParentPillCn, className)} data-pl-recon-footer-meta-pill="">
      <span
        className="max-w-[min(100%,200px)] truncate px-0.5"
        title={
          accountLabel
            ? `${sideLabel} · ${companyLabel} · ${accountLabel}`
            : `${sideLabel} · ${companyLabel}`
        }
      >
        {sideLabel} · {companyLabel}
      </span>
      <span className="shrink-0 whitespace-nowrap px-0.5 tabular-nums">Total trxn {trxnCount}</span>
    </span>
  );
}

/** Reconciling footer — left/right meta parent pills (green) + pagination; sort beech me. */
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
  leftOwnedCompanyName,
  leftOwnedAccountName,
  rightOtherCompanyName,
  rightOtherAccountName,
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
  /** You / owned side company — footer left pill */
  leftOwnedCompanyName: string;
  /** Owned account — pill title tooltip */
  leftOwnedAccountName?: string;
  /** Remote / other side company — footer right parent pill */
  rightOtherCompanyName: string;
  rightOtherAccountName?: string;
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
    hideTotalCount: true,
  };

  const ownedCompanyLabel = String(leftOwnedCompanyName || "—").trim() || "—";
  const ownedAccountLabel = String(leftOwnedAccountName || "").trim();
  const otherCompanyLabel = String(rightOtherCompanyName || "—").trim() || "—";
  const otherAccountLabel = String(rightOtherAccountName || "").trim();

  return (
    <div
      className={cn(
        "shrink-0 border-t bg-background py-2 px-3 md:px-4 overflow-auto min-h-0 scrollbar-slim-dim",
        className
      )}
    >
      <div className="grid min-w-max grid-cols-1 items-center gap-y-2 md:grid-cols-[1fr_auto_1fr] md:gap-x-2">
        {/* Left — owned meta parent pill (green) + pagination (You ledger) */}
        <div className={cn(ledgerFooterRowCn, "justify-start md:justify-end flex-wrap md:flex-nowrap")}>
          <ReconFooterSideMetaPill
            sideLabel="Owned"
            companyName={ownedCompanyLabel}
            accountName={ownedAccountLabel}
            trxnCount={leftTotalCount}
          />
          <LedgerFooterPaginationBar
            {...paginationShared}
            hideSort
            beforeCount={leftBeforeCount}
            afterCount={leftAfterCount}
            totalCount={leftTotalCount}
            className="justify-start sm:ml-0"
          />
        </div>

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

        {/* Right — pagination + other company meta parent pill (green) */}
        <div className={cn(ledgerFooterRowCn, "justify-start flex-wrap md:flex-nowrap")}>
          <LedgerFooterPaginationBar
            {...paginationShared}
            hideSort
            beforeCount={rightBeforeCount}
            afterCount={rightAfterCount}
            totalCount={rightTotalCount}
            className="justify-start sm:ml-0"
          />
          <ReconFooterSideMetaPill
            sideLabel="Other"
            companyName={otherCompanyLabel}
            accountName={otherAccountLabel}
            trxnCount={rightTotalCount}
          />
        </div>
      </div>
    </div>
  );
}
