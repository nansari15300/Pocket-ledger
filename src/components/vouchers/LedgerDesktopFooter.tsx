"use client";

import * as React from "react";
import {
  LedgerFooterPaginationBar,
  type LedgerFooterPaginationBarProps,
} from "@/components/vouchers/LedgerFooterPaginationBar";
import { ledgerFooterRowCn } from "@/components/vouchers/ledgerFooterChrome";
import type { MasterEditPresentationMode } from "@/lib/nestedLedgerMasterEditPresentation";
import { cn } from "@/lib/utils";

export type LedgerDesktopFooterProps = LedgerFooterPaginationBarProps & {
  /** Show Narration, Columns, Note, Check mode, … */
  left: React.ReactNode;
  className?: string;
  shellClassName?: string;
  ledgerPresentationMode?: MasterEditPresentationMode;
};

/**
 * PC entity ledger footer — global shell: same pill height, gap-1.5, parent pagination pill.
 * Har detail page: `left={...controls}` + pagination props.
 */
export function LedgerDesktopFooter({
  left,
  className,
  shellClassName,
  ...pagination
}: LedgerDesktopFooterProps) {
  return (
    <div
      className={cn(
        "pl-ledger-desktop-footer-shell border-t border-blue-300/60 bg-blue-100/80 py-2 px-4 overflow-x-visible overflow-y-visible min-h-0 flex-shrink-0 mt-auto",
        shellClassName
      )}
      data-pl-ledger-footer-single-row=""
    >
      <div
        data-pl-ledger-footer-measure-row=""
        className={cn(
          "flex w-max min-w-full flex-nowrap items-center",
          ledgerFooterRowCn,
          className
        )}
      >
        <div className={cn(ledgerFooterRowCn, "shrink-0 text-sm text-muted-foreground")}>{left}</div>
        <LedgerFooterPaginationBar {...pagination} className="ml-auto shrink-0" />
      </div>
    </div>
  );
}
