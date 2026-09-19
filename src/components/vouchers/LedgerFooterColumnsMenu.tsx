"use client";

import * as React from "react";
import { Columns3, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ledgerFooterPillBtnCn } from "@/components/vouchers/ledgerFooterChrome";
import { NESTED_LEDGER_FOOTER_DROPDOWN_CONTENT_CN } from "@/lib/nestedLedgerMasterEditPresentation";
import type { MasterEditPresentationMode } from "@/lib/nestedLedgerMasterEditPresentation";
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/** Columns dropdown — trigger hamesha chrome pill (PC footer global). */
export function LedgerFooterColumnsMenu({
  children,
  ledgerPresentationMode = "default",
  menuContentClassName,
}: {
  children: React.ReactNode;
  ledgerPresentationMode?: MasterEditPresentationMode;
  menuContentClassName?: string;
}) {
  const resolvedMenuCn = cn(
    menuContentClassName,
    ledgerPresentationMode === "nested-ledger" ? NESTED_LEDGER_FOOTER_DROPDOWN_CONTENT_CN : undefined
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="chromePill" size="sm" className={ledgerFooterPillBtnCn}>
          <Columns3 className="h-4 w-4" />
          Columns
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      {React.Children.map(children, (child) => {
        if (!React.isValidElement<{ className?: string }>(child)) return child;
        return React.cloneElement(child, {
          className: cn(child.props.className, resolvedMenuCn),
        });
      })}
    </DropdownMenu>
  );
}
