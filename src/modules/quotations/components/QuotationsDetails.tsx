"use client";

import { useState } from "react";
import { Search, FilePenLine } from "lucide-react";
import { Input } from "@/components/ui/input";
import { PermissionButton } from "@/components/permission";
import { mlc } from "@/lib/mobileListChrome";
import {
  LEDGER_HEADER_PILL_ROW_CN,
  LEDGER_HEADER_RIBBON_WRAP_CN,
  LEDGER_HEADER_NAME_CARD_CN,
  LEDGER_HEADER_TITLE_CN,
} from "@/lib/ledgerHeaderChrome";
import { cn } from "@/lib/utils";
import { isQuotationAllAccountsRow, QUOTATION_MASTER_KIND_LABEL } from "../constants";
import type { QuotationAccountRow, QuotationDoc } from "../types";
import { QuotationRowsTable } from "./QuotationRowsTable";

export function QuotationsDetails({
  account,
  quotations,
  onAddNew,
  onEdit,
}: {
  account: QuotationAccountRow;
  quotations: QuotationDoc[];
  onAddNew: () => void;
  onEdit: (row: QuotationDoc) => void;
}) {
  const [searchTerm, setSearchTerm] = useState("");

  const accountSubtitle = isQuotationAllAccountsRow(account)
    ? `All accounts · ${quotations.length} quotation${quotations.length === 1 ? "" : "s"}`
    : `${QUOTATION_MASTER_KIND_LABEL[account.kind]} · ${quotations.length} quotation${quotations.length === 1 ? "" : "s"}`;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={cn("flex-shrink-0", LEDGER_HEADER_RIBBON_WRAP_CN)}>
        <div className="flex w-full min-w-0 flex-nowrap items-stretch gap-1">
          <div className={cn(LEDGER_HEADER_NAME_CARD_CN, "min-w-0 flex-1")}>
            <FilePenLine className="h-5 w-5 shrink-0 text-blue-900/70" />
            <div className="min-w-0 flex-1">
              <div className={cn(LEDGER_HEADER_TITLE_CN, "truncate text-base leading-tight")} title={account.name}>
                {account.name}
              </div>
              <div className="truncate text-[11px] leading-tight text-muted-foreground" title={accountSubtitle}>
                {accountSubtitle}
              </div>
            </div>
          </div>
          <div
            className={cn(
              LEDGER_HEADER_PILL_ROW_CN,
              "max-w-none min-w-0 w-auto flex-none items-center self-stretch"
            )}
          >
            <PermissionButton permission="create_records" variant="chromePill" size="list" onClick={onAddNew}>
              + Add New
            </PermissionButton>
          </div>
        </div>
      </div>
      <div className={cn(mlc.searchRow, LEDGER_HEADER_RIBBON_WRAP_CN)}>
        <div className={cn(mlc.searchWrap, "w-[3in] max-w-[3in] flex-none")}>
          <Search className={mlc.searchIcon} />
          <Input
            placeholder="Search quotations..."
            listChrome
            listChromeSearch
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>
      <QuotationRowsTable
        quotations={quotations}
        onEdit={onEdit}
        searchTerm={searchTerm}
        showAccountName={isQuotationAllAccountsRow(account)}
      />
    </div>
  );
}
