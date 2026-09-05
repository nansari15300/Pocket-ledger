"use client";

import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BalanceSheetLedgerDetailMirror } from "@/components/reports/BalanceSheetLedgerDetailMirror";
import type { DateRange } from "@/components/ui/ad-calendar";
import { useVouchers } from "@/hooks/useVouchers";
import type { RpDialogRow } from "@/lib/receivablesPayablesDialogUi";
import {
  rpDialogRowCanOpenLedger,
  rpDialogRowSelectionKey,
  rpDialogRowToBalanceSheetLedgerRow,
} from "@/lib/receivablesPayablesDialogUi";

/** Outstanding dialog — same ledger popup as Balance Sheet account click. */
export function useReceivablesPayablesLedgerPopup() {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [openRow, setOpenRow] = useState<RpDialogRow | null>(null);

  const selectRow = useCallback((side: "receivables" | "payables", row: RpDialogRow) => {
    setSelectedKey(rpDialogRowSelectionKey(side, row));
  }, []);

  const openRowLedger = useCallback((side: "receivables" | "payables", row: RpDialogRow) => {
    setSelectedKey(rpDialogRowSelectionKey(side, row));
    if (!rpDialogRowCanOpenLedger(row)) return;
    setOpenRow(row);
  }, []);

  const closeLedger = useCallback(() => setOpenRow(null), []);

  const resetDialogInteraction = useCallback(() => {
    setSelectedKey(null);
    setOpenRow(null);
  }, []);

  const popup = <ReceivablesPayablesLedgerPopup openRow={openRow} onClose={closeLedger} />;

  return {
    selectedKey,
    selectRow,
    openRowLedger,
    popup,
    resetDialogInteraction,
  };
}

function ReceivablesPayablesLedgerPopup({
  openRow,
  onClose,
}: {
  openRow: RpDialogRow | null;
  onClose: () => void;
}) {
  const {
    processedAccounts,
    processedParties,
    processedStaff,
    processedStaffGroups,
    processedTaxes,
    userNames,
    journalAccountNames,
  } = useVouchers();
  /** Balance Sheet click jaisa — All Time. Outstanding month filter ledger ko khali nahi kare. */
  const [detailDateRange, setDetailDateRange] = useState<DateRange | undefined>(undefined);
  const ledgerRow = openRow ? rpDialogRowToBalanceSheetLedgerRow(openRow) : null;

  return (
    <Dialog
      open={!!ledgerRow}
      onOpenChange={(open) => {
        if (!open) {
          setDetailDateRange(undefined);
          onClose();
        }
      }}
    >
      <DialogContent
        hideCloseButton
        overlayClassName="z-[70] bg-black/45 backdrop-blur-none"
        style={{ height: "85vh", maxHeight: "85vh", width: "90vw", maxWidth: "90vw" }}
        className={cn(
          "balance-sheet-ledger-popup z-[71]",
          /* Outstanding list overlay stays open behind this — avoid 50%+translate (subpixel blur on txn rows). */
          "!left-0 !right-0 !top-0 !bottom-0 !translate-x-0 !translate-y-0 mx-auto my-auto",
          "!flex h-[85vh] max-h-[85vh] w-[90vw] max-w-[90vw] flex-col !gap-0 overflow-hidden !p-0 rounded-lg bg-background",
          "data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100",
          "data-[state=open]:slide-in-from-left-0 data-[state=open]:slide-in-from-top-0",
          "data-[state=closed]:slide-out-to-left-0 data-[state=closed]:slide-out-to-top-0"
        )}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{ledgerRow?.accountName ?? "Ledger"}</DialogTitle>
        </DialogHeader>
        <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {ledgerRow ? (
            <BalanceSheetLedgerDetailMirror
              key={`${ledgerRow.entityType}-${ledgerRow.accountId}`}
              row={ledgerRow}
              dateRange={detailDateRange}
              onDateRangeChange={setDetailDateRange}
              onClose={onClose}
              processedAccounts={processedAccounts}
              processedParties={processedParties}
              processedStaff={processedStaff}
              processedStaffGroups={processedStaffGroups}
              processedTaxes={processedTaxes}
              userNames={userNames}
              journalAccountNames={journalAccountNames}
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
