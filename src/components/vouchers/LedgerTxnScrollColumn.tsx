"use client";

import type { ReactNode } from "react";
import {
  LEDGER_TXN_SCROLL_HOST_CN,
  LEDGER_TXN_SCROLL_INNER_CN,
  LEDGER_TXN_TABLE_HOST_CN,
} from "@/lib/ledgerHeaderChrome";

import { LEDGER_TXN_SCROLL_HEADER_CN } from "@/lib/ledgerHeaderChrome";

/** Desktop entity ledger: one horizontal scroll for ribbon + table + pagination footer. */
export function LedgerTxnScrollColumn({
  header,
  table,
  footer,
}: {
  /** Entity ribbon (avatar, balance, pills) — scrolls horizontally with the table. */
  header?: ReactNode;
  table: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div data-pl-ledger-txn-unified-scroll="" className={LEDGER_TXN_SCROLL_HOST_CN}>
      <div className={LEDGER_TXN_SCROLL_INNER_CN}>
        {header ? <div className={LEDGER_TXN_SCROLL_HEADER_CN}>{header}</div> : null}
        <div className={LEDGER_TXN_TABLE_HOST_CN}>{table}</div>
        {footer ? <div className="w-full min-w-full shrink-0">{footer}</div> : null}
      </div>
    </div>
  );
}
