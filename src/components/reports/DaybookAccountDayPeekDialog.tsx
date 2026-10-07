"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AccountDetails } from "@/components/bank-cash/AccountDetails";
import type { Account } from "@/components/bank-cash/types";
import type { DateRange } from "@/components/ui/ad-calendar";
import { useFyScopedVouchers } from "@/hooks/useFyScopedVouchers";
import { cn } from "@/lib/utils";

type DaybookAccountDayPeekDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: Account | null;
  daybookDate: Date | undefined;
  /** Dashboard bank/cash filter to use when the account popup first opens. */
  initialDateRange?: DateRange;
  /** Summary card figures are kept for existing callers; AccountDetails calculates the filtered ledger totals. */
  summaryOpening?: number;
  summaryIn?: number;
  summaryOut?: number;
  summaryClosing?: number;
};

/** Bank/cash row double-click — reuses the Bank ledger UI and its actions. */
export function DaybookAccountDayPeekDialog({
  open,
  onOpenChange,
  account,
  daybookDate,
  initialDateRange,
}: DaybookAccountDayPeekDialogProps) {
  const { processedAccounts: allAccounts, userNames } = useFyScopedVouchers();
  const [dateRange, setDateRange] = useState<DateRange | undefined>(
    initialDateRange ?? (daybookDate ? { from: daybookDate, to: daybookDate } : undefined)
  );
  const handleAccountDeleted = useCallback(() => onOpenChange(false), [onOpenChange]);

  useEffect(() => {
    if (!open) return;
    setDateRange(initialDateRange ?? (daybookDate ? { from: daybookDate, to: daybookDate } : undefined));
  }, [open, account?.id, initialDateRange, daybookDate]);

  return (
    <Dialog open={open && !!account} onOpenChange={onOpenChange}>
      <DialogContent hideCloseButton className="balance-sheet-ledger-popup !left-0 !right-0 !top-0 !bottom-0 !translate-x-0 !translate-y-0 mx-auto my-auto w-[96vw] max-w-[1100px] h-[90vh] max-h-[90vh] !flex flex-col !gap-0 overflow-hidden !p-0 rounded-lg bg-background data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100 data-[state=open]:slide-in-from-left-0 data-[state=open]:slide-in-from-top-0 data-[state=closed]:slide-out-to-left-0 data-[state=closed]:slide-out-to-top-0">
        <DialogHeader className="sr-only">
          <DialogTitle>{account?.accountName || "Account ledger"}</DialogTitle>
        </DialogHeader>
        {account ? (
          <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <AccountDetails
              key={account.id}
              account={account}
              allAccounts={allAccounts}
              userNames={userNames}
              onAccountUpdated={() => {}}
              onAccountDeleted={handleAccountDeleted}
              onBack={() => onOpenChange(false)}
              onPopupClose={() => onOpenChange(false)}
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
              ledgerPresentationMode="nested-ledger"
              showPeriodSummaryCards
            />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
/** Daily Summary bank/cash account row — full-width orange hover/select + rounded corners */
export function daybookSummaryAccountRowCn(selected: boolean) {
  return cn(
    // TableRow default `hover:bg-muted/50` mat dikhao — sirf cells paint (warna pehla column hi highlight)
    "text-sm cursor-pointer transition-colors hover:!bg-transparent data-[state=selected]:!bg-transparent",
    "[&>td]:!bg-blue-100/30 dark:[&>td]:!bg-blue-950/20",
    "[&>td:first-child]:rounded-l-lg [&>td:last-child]:rounded-r-lg",
    !selected &&
      [
        "hover:[&>td]:!bg-orange-50 dark:hover:[&>td]:!bg-orange-950/35",
        // Full-length border: har td top+bottom; pehla left+radius; aakhri right+radius
        "hover:[&>td]:!shadow-[inset_0_1.5px_0_0_#fb923c,inset_0_-1.5px_0_0_#fb923c]",
        "hover:[&>td:first-child]:!shadow-[inset_2px_0_0_0_#fb923c,inset_0_1.5px_0_0_#fb923c,inset_0_-1.5px_0_0_#fb923c]",
        "hover:[&>td:last-child]:!shadow-[inset_-2px_0_0_0_#fb923c,inset_0_1.5px_0_0_#fb923c,inset_0_-1.5px_0_0_#fb923c]",
        "hover:[&>td:first-child]:!rounded-l-lg hover:[&>td:last-child]:!rounded-r-lg",
      ].join(" "),
    selected &&
      [
        "[&>td]:!bg-orange-50 dark:[&>td]:!bg-orange-950/40",
        "[&>td]:!shadow-[inset_0_2px_0_0_#fb923c,inset_0_-2px_0_0_#fb923c]",
        "[&>td:first-child]:!shadow-[inset_2px_0_0_0_#fb923c,inset_0_2px_0_0_#fb923c,inset_0_-2px_0_0_#fb923c]",
        "[&>td:last-child]:!shadow-[inset_-2px_0_0_0_#fb923c,inset_0_2px_0_0_#fb923c,inset_0_-2px_0_0_#fb923c]",
        "[&>td:first-child]:!rounded-l-lg [&>td:last-child]:!rounded-r-lg",
      ].join(" ")
  );
}
