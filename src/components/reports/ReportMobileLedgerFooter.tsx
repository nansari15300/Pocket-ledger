"use client";

/**
 * Mobile report register detail footer — Party Statement / dashboard txn-count pages.
 * Print · Excel · Bill wise · Date · Chart (pic 2 parity).
 */
import { Calendar as CalendarIcon, File, Printer, BarChart2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PermissionButton } from "@/components/permission";
import { cn } from "@/lib/utils";

export type ReportMobileLedgerFooterProps = {
  onPrint: () => void;
  onExcel: () => void;
  onDateOpen: () => void;
  /** Bill wise toggle — hide when ledger has no bill-wise mode */
  showBillWise?: boolean;
  balanceMode?: "statement" | "bill_wise";
  onBalanceModeToggle?: () => void;
  showChart?: boolean;
  mobileView?: "list" | "chart";
  onViewToggle?: () => void;
};

export function ReportMobileLedgerFooter({
  onPrint,
  onExcel,
  onDateOpen,
  showBillWise = true,
  balanceMode = "statement",
  onBalanceModeToggle,
  showChart = true,
  mobileView = "list",
  onViewToggle,
}: ReportMobileLedgerFooterProps) {
  return (
    <footer className="fixed bottom-0 left-0 right-0 z-50 flex items-stretch justify-around gap-1 border-t bg-white p-1.5 dark:bg-card">
      <PermissionButton
        permission="export_data"
        className="flex min-w-0 flex-1 flex-col items-center justify-center rounded-md bg-green-500 py-1 text-white hover:bg-green-600"
        onClick={onPrint}
      >
        <Printer className="mb-0 h-4 w-4" /> <span className="text-[10px] leading-tight">Print</span>
      </PermissionButton>
      <PermissionButton
        permission="export_data"
        className="flex min-w-0 flex-1 flex-col items-center justify-center rounded-md bg-yellow-500 py-1 text-white hover:bg-yellow-600"
        onClick={onExcel}
      >
        <File className="mb-0 h-4 w-4" /> <span className="text-[10px] leading-tight">Excel</span>
      </PermissionButton>
      {showBillWise && onBalanceModeToggle ? (
        <Button
          type="button"
          className={cn(
            "flex min-w-0 flex-1 flex-col items-center justify-center rounded-md py-1 text-white",
            balanceMode === "bill_wise" ? "bg-orange-500 hover:bg-orange-600" : "bg-violet-500 hover:bg-violet-600"
          )}
          onClick={onBalanceModeToggle}
        >
          <span className="px-0.5 text-center text-[10px] leading-tight">
            {balanceMode === "bill_wise" ? "Statement" : "Bill wise"}
          </span>
        </Button>
      ) : null}
      <Button
        type="button"
        className="flex min-w-0 flex-1 flex-col items-center justify-center rounded-md bg-slate-500 py-1 text-white hover:bg-slate-600"
        onClick={onDateOpen}
      >
        <CalendarIcon className="mb-0 h-4 w-4" /> <span className="text-[10px] leading-tight">Date</span>
      </Button>
      {showChart && onViewToggle ? (
        <Button
          type="button"
          className="flex min-w-0 flex-1 flex-col items-center justify-center rounded-md bg-violet-500 py-1 text-white hover:bg-violet-600"
          onClick={onViewToggle}
        >
          <BarChart2 className="mb-0 h-4 w-4" />{" "}
          <span className="text-[10px] leading-tight">{mobileView === "list" ? "Chart" : "List"}</span>
        </Button>
      ) : null}
    </footer>
  );
}
