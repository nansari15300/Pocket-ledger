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
    <div data-pl-daybook-unified-scroll="" className={cn(DAYBOOK_TXN_SCROLL_HOST_CN, className)}>
      <div className={DAYBOOK_TXN_SCROLL_INNER_CN}>
        <div className={LEDGER_TXN_TABLE_HOST_CN}>{children}</div>
      </div>
    </div>
  );
}
