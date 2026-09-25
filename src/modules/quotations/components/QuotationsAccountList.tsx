"use client";

import { FilePenLine } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MasterListRow } from "@/components/ui/master-list-row";
import { MasterListNameTooltip } from "@/components/entity/MasterListNameTooltip";
import { ResolvedEntityAvatar } from "@/components/entity/ResolvedEntityAvatar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { masterEntityTextMatchesSearch } from "@/lib/filterMasterEntityListRows";
import { highlightQueryInText } from "@/lib/highlightQueryInText";
import { masterListShellCn, masterListRowUnselectedCn, MASTER_LIST_AVATAR_CN, MASTER_LIST_AVATAR_FALLBACK_CN } from "@/lib/masterListChrome";
import { cn } from "@/lib/utils";
import {
  QUOTATION_MASTER_KIND_LABEL,
  quotationAllAccountsRow,
  QUOTATION_ALL_ACCOUNTS_LIST_ID,
} from "../constants";
import type { QuotationAccountRow } from "../types";

export function QuotationsAccountList({
  accounts,
  selectedId,
  onSelect,
  searchTerm,
  totalQuotationCount,
}: {
  accounts: QuotationAccountRow[];
  selectedId: string | null;
  onSelect: (row: QuotationAccountRow) => void;
  searchTerm: string;
  totalQuotationCount: number;
}) {
  const q = searchTerm.trim();
  const allRow = quotationAllAccountsRow(totalQuotationCount);
  const rows = q
    ? accounts.filter((row) =>
        masterEntityTextMatchesSearch(`${row.name} ${QUOTATION_MASTER_KIND_LABEL[row.kind]}`, searchTerm)
      )
    : accounts;

  if (rows.length === 0 && totalQuotationCount === 0) {
    return (
      <div className={masterListShellCn} data-theme-list="account-list">
        <div className="flex flex-1 min-h-0 items-center justify-center p-8 text-center text-sm text-muted-foreground">
          {accounts.length === 0
            ? "No quotations yet. Click + Add New to create one."
            : "No matching accounts."}
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
    <div className={masterListShellCn} data-theme-list="account-list">
      <ScrollArea listChrome className="min-h-0 min-w-0 flex-1">
        <ul className="pl-master-list-ul">
          <li key={QUOTATION_ALL_ACCOUNTS_LIST_ID}>
              <MasterListRow
                selected={selectedId === QUOTATION_ALL_ACCOUNTS_LIST_ID}
                className={cn(
                  masterListRowUnselectedCn(selectedId === QUOTATION_ALL_ACCOUNTS_LIST_ID),
                  "cursor-pointer"
                )}
                onClick={() => onSelect(allRow)}
              >
                <div className="pl-master-list-row">
                  <div className="pl-master-list-row-leading">
                    <ResolvedEntityAvatar
                      className={cn(MASTER_LIST_AVATAR_CN, "text-sm")}
                      fallbackClassName={MASTER_LIST_AVATAR_FALLBACK_CN}
                      alt="All"
                      fallbackSlot={<FilePenLine className="h-4 w-4" />}
                    />
                    <div className="flex min-w-0 flex-col">
                      <MasterListNameTooltip measureKey="All" side="right" tooltipContent={<p>All quotations</p>}>
                        {q ? highlightQueryInText("All", searchTerm) : "All"}
                      </MasterListNameTooltip>
                      <span className="text-[10px] text-muted-foreground">All accounts</span>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold tabular-nums">
                    {totalQuotationCount}
                  </span>
                </div>
              </MasterListRow>
          </li>
          {rows.map((row) => {
            const selected = selectedId === row.id;
            return (
              <li key={row.id}>
                <MasterListRow
                  selected={selected}
                  className={cn(masterListRowUnselectedCn(selected), "cursor-pointer")}
                  onClick={() => onSelect(row)}
                >
                  <div className="pl-master-list-row">
                    <div className="pl-master-list-row-leading">
                      <ResolvedEntityAvatar
                        className={cn(MASTER_LIST_AVATAR_CN, "text-sm")}
                        fallbackClassName={MASTER_LIST_AVATAR_FALLBACK_CN}
                        src={row.fileUrl || undefined}
                        alt={row.name}
                        fallbackSlot={<FilePenLine className="h-4 w-4" />}
                      />
                      <div className="flex min-w-0 flex-col">
                        <MasterListNameTooltip measureKey={row.name} side="right" tooltipContent={<p>{row.name}</p>}>
                          {q ? highlightQueryInText(row.name, searchTerm) : row.name}
                        </MasterListNameTooltip>
                        <span className="text-[10px] text-muted-foreground">
                          {QUOTATION_MASTER_KIND_LABEL[row.kind]}
                        </span>
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold tabular-nums">
                      {row.quotationCount}
                    </span>
                  </div>
                </MasterListRow>
              </li>
            );
          })}
        </ul>
      </ScrollArea>
    </div>
    </TooltipProvider>
  );
}
