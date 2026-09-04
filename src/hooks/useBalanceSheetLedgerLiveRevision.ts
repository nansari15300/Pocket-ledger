"use client";

import { useEffect, useState } from "react";
import {
  BROWSER_DB_COLLECTION_BUMP,
  type BrowserDbCollectionBumpDetail,
} from "@/lib/localCompanyDocMirror";
import { subscribeVoucherLivePatch } from "@/lib/voucherFormAttachmentSave";

/** Collections that affect Balance Sheet / difference trace / remaining explanation. */
const BALANCE_SHEET_LIVE_COLLECTIONS = new Set([
  "vouchers",
  "parties",
  "bank_accounts",
  "staff",
  "taxes",
  "expense_accounts",
  "groups",
  "account_groups",
  "staff_groups",
  "tax_groups",
  "expense_groups",
]);

/**
 * Bumps when SQLite mirror or in-tab voucher/master patch changes ledger data.
 * Use in report useMemo deps so trace/explanation recomputes without page refresh.
 */
export function useBalanceSheetLedgerLiveRevision(companyId: string | null | undefined): number {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!companyId) return;

    const bump = () => setRevision((n) => n + 1);

    const onCollectionBump = (event: Event) => {
      const detail = (event as CustomEvent<BrowserDbCollectionBumpDetail>).detail;
      if (!detail || detail.companyId !== companyId) return;
      if (!BALANCE_SHEET_LIVE_COLLECTIONS.has(detail.collection)) return;
      bump();
    };

    window.addEventListener(BROWSER_DB_COLLECTION_BUMP, onCollectionBump);
    const unsubLivePatch = subscribeVoucherLivePatch((detail) => {
      if (detail.companyId !== companyId) return;
      bump();
    });

    return () => {
      window.removeEventListener(BROWSER_DB_COLLECTION_BUMP, onCollectionBump);
      unsubLivePatch();
    };
  }, [companyId]);

  return revision;
}
