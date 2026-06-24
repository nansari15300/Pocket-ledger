"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  clearLedgerDetailOpenVoucher,
  ledgerDetailSessionStorageKey,
  readLedgerDetailSessionSnapshot,
  writeLedgerDetailSessionSnapshot,
  type LedgerDetailViewMode,
} from "@/lib/ledgerDetailSessionMemory";

type Args = {
  companyId: string | undefined;
  context: string;
  contextId: string | undefined;
  viewMode: LedgerDetailViewMode;
  totalPages: number;
  currentPage: number;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  /** Full voucher docs — refresh par open txn restore ke liye. */
  vouchers?: ReadonlyArray<{ id?: string }> | null;
  selectedVoucherId?: string | null;
  isVoucherDialogOpen: boolean;
  setSelectedVoucher: (voucher: any) => void;
  setIsVoucherDialogOpen: (open: boolean) => void;
  /** Mobile: restore par `?modal=1` sync. */
  onRestoreVoucherDialog?: () => void;
};

/**
 * Bill / statement / spend-wise ledger: refresh par wahi page + open voucher lock.
 * Pehli baar scope khule (session me snapshot nahi) → page 1 (newest tail window).
 */
export function useLedgerDetailSessionMemory({
  companyId,
  context,
  contextId,
  viewMode,
  totalPages,
  currentPage,
  setCurrentPage,
  vouchers,
  selectedVoucherId,
  isVoucherDialogOpen,
  setSelectedVoucher,
  setIsVoucherDialogOpen,
  onRestoreVoucherDialog,
}: Args) {
  const storageKey = useMemo(() => {
    if (!companyId || !contextId) return null;
    return ledgerDetailSessionStorageKey(companyId, context, contextId, viewMode);
  }, [companyId, context, contextId, viewMode]);

  const restoredScopeRef = useRef<string | null>(null);
  const pageHydratedRef = useRef(false);
  const voucherRestoreAttemptedRef = useRef<string | null>(null);

  useEffect(() => {
    restoredScopeRef.current = null;
    pageHydratedRef.current = false;
    voucherRestoreAttemptedRef.current = null;
  }, [storageKey]);

  useLayoutEffect(() => {
    if (!storageKey || totalPages < 1) return;
    if (restoredScopeRef.current === storageKey) return;
    restoredScopeRef.current = storageKey;

    const snap = readLedgerDetailSessionSnapshot(storageKey);
    if (snap?.page) {
      setCurrentPage(Math.min(Math.max(1, snap.page), totalPages));
    } else {
      setCurrentPage(1);
    }
    pageHydratedRef.current = true;
  }, [storageKey, totalPages, setCurrentPage]);

  useEffect(() => {
    if (!storageKey || !pageHydratedRef.current) return;
    writeLedgerDetailSessionSnapshot(storageKey, { page: currentPage });
  }, [storageKey, currentPage]);

  useEffect(() => {
    if (!storageKey || !pageHydratedRef.current) return;
    if (isVoucherDialogOpen && selectedVoucherId) {
      writeLedgerDetailSessionSnapshot(storageKey, {
        page: currentPage,
        openVoucherId: selectedVoucherId,
      });
    } else if (!isVoucherDialogOpen) {
      clearLedgerDetailOpenVoucher(storageKey);
    }
  }, [storageKey, currentPage, isVoucherDialogOpen, selectedVoucherId]);

  useEffect(() => {
    if (!storageKey || !pageHydratedRef.current) return;
    const snap = readLedgerDetailSessionSnapshot(storageKey);
    const openId = snap?.openVoucherId;
    if (!openId || isVoucherDialogOpen) return;
    if (voucherRestoreAttemptedRef.current === `${storageKey}:${openId}`) return;
    if (!vouchers?.length) return;

    const hit = vouchers.find((v) => v?.id === openId);
    if (!hit) return;

    voucherRestoreAttemptedRef.current = `${storageKey}:${openId}`;
    setSelectedVoucher(hit);
    setIsVoucherDialogOpen(true);
    onRestoreVoucherDialog?.();
  }, [
    storageKey,
    vouchers,
    isVoucherDialogOpen,
    setSelectedVoucher,
    setIsVoucherDialogOpen,
    onRestoreVoucherDialog,
  ]);

  const rememberOpenVoucher = useCallback(
    (voucherId: string) => {
      if (!storageKey) return;
      writeLedgerDetailSessionSnapshot(storageKey, {
        page: currentPage,
        openVoucherId: voucherId,
      });
    },
    [storageKey, currentPage]
  );

  return { rememberOpenVoucher, pageHydrated: pageHydratedRef.current };
}
