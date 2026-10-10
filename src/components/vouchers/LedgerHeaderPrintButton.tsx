"use client";

import type { ComponentProps } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  LEDGER_HEADER_PILL_ICON_CN,
  LEDGER_HEADER_PILL_ICON_SIZE_CN,
} from "@/lib/ledgerHeaderChrome";

/** Ledger txn ribbon — print immediately left of Unapproved (global order). */
export function LedgerHeaderPrintButton({
  className,
  variant = "outline",
  ...props
}: ComponentProps<typeof Button>) {
  return (
    <Button
      type="button"
      variant={variant}
      size="icon"
      className={cn(LEDGER_HEADER_PILL_ICON_CN, className)}
      data-theme-detail="print"
      aria-label="Print"
      {...props}
    >
      <Printer className={LEDGER_HEADER_PILL_ICON_SIZE_CN} />
    </Button>
  );
}
