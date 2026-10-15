"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  LEDGER_TXN_SCROLL_HOST_CN,
  LEDGER_TXN_SCROLL_INNER_CN,
  LEDGER_TXN_TABLE_HOST_CN,
} from "@/lib/ledgerHeaderChrome";

/** Daybook desktop: ek H-scroll — header + saari txn rows ek saath (width vars from TransactionsTable). */
export const DAYBOOK_TXN_SCROLL_HOST_CN = cn(
  "pl-daybook-txn-scroll-host",
  LEDGER_TXN_SCROLL_HOST_CN
);
export const DAYBOOK_TXN_SCROLL_INNER_CN = cn(
  "pl-daybook-txn-scroll-host-inner",
  LEDGER_TXN_SCROLL_INNER_CN
);

export function DaybookTxnScrollColumn({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      data-pl-daybook-unified-scroll=""
      data-pl-dashboard-recent-shell=""
      className={cn(DAYBOOK_TXN_SCROLL_HOST_CN, className)}
      style={{ ["--pl-dashboard-recent-edge-gap" as string]: "2px" }}
    >
      <div className={DAYBOOK_TXN_SCROLL_INNER_CN}>
        <div className={cn(LEDGER_TXN_TABLE_HOST_CN, "box-border min-w-0")}>{children}</div>
      </div>
    </div>
  );
}
