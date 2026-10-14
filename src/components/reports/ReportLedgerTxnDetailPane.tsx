"use client";

import type { ReactNode } from "react";

/** Reports detail column — full height flex so Total/Closing row + pagination footer party page jaisa lock rahein. */
export function ReportLedgerTxnDetailPane({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex h-full min-h-0 flex-1 flex-col overflow-hidden"
      data-pl-report-ledger-txn-detail=""
    >
      {children}
    </div>
  );
}
