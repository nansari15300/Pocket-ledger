"use client";

import React, { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { TransactionsTable } from "@/components/vouchers/TransactionsTable";
import { useTransactions } from "@/hooks/use-transactions";
import { useVouchers } from "@/hooks/useVouchers";
import { useDate } from "@/hooks/useDate";
import { cn } from "@/lib/utils";
import type { Account } from "@/components/bank-cash/types";
import { AddVoucherDialog } from "@/components/vouchers/AddVoucherDialog";
import { HistoryDialog } from "@/components/vouchers/HistoryDialog";
import { useBankLedgerDrCrPerspective } from "@/hooks/useBankLedgerDrCrPerspective";
import {
  applyBankDrCrPerspectiveToTxnRows,
  bankLedgerTxnColumnLabels,
  flipLedgerDrCr,
  flipLedgerSignedBalance,
} from "@/lib/bankLedgerDrCrPerspective";

type DaybookAccountDayPeekDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: Account | null;
  daybookDate: Date | undefined;
  /** Summary card figures — popup header me quick view */
  summaryOpening?: number;
  summaryIn?: number;
  summaryOut?: number;
  summaryClosing?: number;
};

/**
 * Daybook Daily Summary account row double-click —
 * selected din ke liye us bank/cash ka ledger (opening + txns + closing).
 */
export function DaybookAccountDayPeekDialog({
  open,
  onOpenChange,
  account,
  daybookDate,
  summaryOpening,
  summaryIn,
  summaryOut,
  summaryClosing,
}: DaybookAccountDayPeekDialogProps) {
  const { processedAccounts: allAccounts, userNames } = useVouchers();
  const { formatCurrency, formatDate, formatDateBS, dateSystem } = useDate();
  const [selectedVoucher, setSelectedVoucher] = useState<any>(null);
  const [isVoucherDialogOpen, setIsVoucherDialogOpen] = useState(false);
  const [historyVoucher, setHistoryVoucher] = useState<any>(null);
  const { perspective } = useBankLedgerDrCrPerspective();

  const dateRange = useMemo(
    () => (daybookDate ? { from: daybookDate, to: daybookDate } : undefined),
    [daybookDate]
  );

  const {
    processedTransactions,
    openingBalanceForPeriod,
    periodDr,
    periodCr,
    closingBalance,
  } = useTransactions(
    account,
    "account",
    dateRange,
    undefined,
    allAccounts,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    userNames
  );

  const dateLabel = !daybookDate
    ? ""
    : dateSystem === "BS"
      ? formatDateBS(daybookDate)
      : formatDate(daybookDate);

  const opening =
    typeof openingBalanceForPeriod === "number"
      ? openingBalanceForPeriod
      : Number(summaryOpening) || 0;
  const closing =
    typeof closingBalance === "number" ? closingBalance : Number(summaryClosing) || 0;
  const dayIn = typeof periodDr === "number" ? periodDr : Number(summaryIn) || 0;
  const dayOut = typeof periodCr === "number" ? periodCr : Number(summaryOut) || 0;

  const displayOpening = flipLedgerSignedBalance(opening, perspective);
  const displayClosing = flipLedgerSignedBalance(closing, perspective);
  const displayPeriod = flipLedgerDrCr(dayIn, dayOut, perspective);
  const displayTxns = useMemo(
    () => applyBankDrCrPerspectiveToTxnRows(processedTransactions || [], perspective),
    [processedTransactions, perspective]
  );
  const bankDepositWithdrawColumnLabels = useMemo(
    () => bankLedgerTxnColumnLabels(account?.accountType, perspective),
    [account?.accountType, perspective]
  );

  return (
    <>
      <Dialog open={open && !!account} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[min(96vw,1100px)] w-full max-h-[90vh] flex flex-col gap-3 overflow-hidden p-4 sm:p-6">
          <DialogHeader className="shrink-0 space-y-1">
            <DialogTitle className="text-base sm:text-lg truncate">
              {account?.accountName || "Account"} — {dateLabel || "Day"}
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              Daybook date ke hisaab se is account ki filtered transactions (ledger opening / closing).
            </DialogDescription>
          </DialogHeader>

          <div className="shrink-0 grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
            <div className="rounded-md border bg-muted/30 px-2.5 py-1.5">
              <div className="text-[11px] text-muted-foreground">Opening</div>
              <div className={cn("font-semibold", displayOpening >= 0 ? "text-green-600" : "text-red-600")}>
                {formatCurrency(displayOpening)}
              </div>
            </div>
            <div className="rounded-md border bg-muted/30 px-2.5 py-1.5">
              <div className="text-[11px] text-muted-foreground">Today In</div>
              <div className="font-semibold text-green-600">{formatCurrency(dayIn, { noSuffix: true })}</div>
            </div>
            <div className="rounded-md border bg-muted/30 px-2.5 py-1.5">
              <div className="text-[11px] text-muted-foreground">Today Out</div>
              <div className="font-semibold text-red-600">{formatCurrency(dayOut, { noSuffix: true })}</div>
            </div>
            <div className="rounded-md border bg-muted/30 px-2.5 py-1.5">
              <div className="text-[11px] text-muted-foreground">Closing</div>
              <div className={cn("font-semibold", displayClosing >= 0 ? "text-green-600" : "text-red-600")}>
                {formatCurrency(displayClosing)}
              </div>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-auto rounded-md border">
            {displayTxns.length > 0 ? (
              <TransactionsTable
                transactions={displayTxns}
                context="account"
                contextId={account?.id}
                showNarration={true}
                journalAccountNames={{}}
                userNames={userNames}
                onRowClick={(v) => {
                  setSelectedVoucher(v);
                  setIsVoucherDialogOpen(true);
                }}
                onHistoryVoucher={(v) => setHistoryVoucher(v)}
                openingBalance={displayOpening}
                periodDr={displayPeriod.debit}
                periodCr={displayPeriod.credit}
                closingBalance={displayClosing}
                hideFooter={false}
                {...bankDepositWithdrawColumnLabels}
              />
            ) : (
              <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
                No transactions on this date for this account.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AddVoucherDialog
        isOpen={isVoucherDialogOpen}
        onOpenChange={setIsVoucherDialogOpen}
        voucher={selectedVoucher}
        onVoucherCreated={() => setSelectedVoucher(null)}
      />
      <HistoryDialog
        voucher={historyVoucher}
        isOpen={!!historyVoucher}
        onOpenChange={(o) => !o && setHistoryVoucher(null)}
        onHistoryReset={() =>
          setHistoryVoucher((prev: any) => (prev ? { ...prev, history: [] } : null))
        }
      />
    </>
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
