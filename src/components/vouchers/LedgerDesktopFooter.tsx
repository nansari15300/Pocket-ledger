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
        "border-t border-blue-300/60 bg-blue-100/80 py-2 px-4 overflow-auto min-h-0 pl-ledger-footer-scroll flex-shrink-0 mt-auto",
        shellClassName
      )}
    >
      <div
        className={cn(
          "flex min-w-max flex-col gap-y-2 sm:flex-row sm:items-center",
          ledgerFooterRowCn,
          className
        )}
      >
        <div
          className={cn(
            ledgerFooterRowCn,
            "min-w-0 overflow-x-auto pl-ledger-footer-scroll text-sm text-muted-foreground"
          )}
        >
          {left}
        </div>
        <LedgerFooterPaginationBar {...pagination} />
      </div>
    </div>
  );
}
