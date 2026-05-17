"use client";

import { Columns3, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ledgerFooterPillBtnCn } from "@/components/vouchers/ledgerFooterChrome";
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Columns dropdown — trigger hamesha chrome pill (PC footer global). */
export function LedgerFooterColumnsMenu({ children }: { children: React.ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="chromePill" size="sm" className={ledgerFooterPillBtnCn}>
          <Columns3 className="h-4 w-4" />
          Columns
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      {children}
    </DropdownMenu>
  );
}
