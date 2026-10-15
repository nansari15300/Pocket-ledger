"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Mobile entity footer Print — Calendar ke turant left; light black (slate + white mix), sab entity pe. */
export const MOBILE_LEDGER_FOOTER_PRINT_BTN_CN =
  "flex-1 min-h-0 min-w-0 rounded-md bg-slate-500 hover:bg-slate-600 text-white text-sm font-semibold";

export function MobileEntityLedgerFooterPrintButton({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <Button
      type="button"
      data-pl-mobile-ledger-print-btn=""
      className={cn(MOBILE_LEDGER_FOOTER_PRINT_BTN_CN, className)}
      onClick={onClick}
    >
      <Printer className="mr-1 h-3.5 w-3.5 shrink-0" />
      Print
    </Button>
  );
}
