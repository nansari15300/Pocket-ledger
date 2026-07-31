"use client";
import type { ExpenseAccount } from "@/components/expenses/types";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MasterListRow } from "@/components/ui/master-list-row";
import { ResolvedEntityAvatar } from "@/components/entity/ResolvedEntityAvatar";
import { EntityFileAttachmentHover } from "@/components/entity/EntityFileAttachmentHover";
import { trimEntityFileUrlForPreview } from "@/lib/trimEntityFileUrlForPreview";
import { DollarSign, Lock } from "lucide-react";
import { useDate } from "@/hooks/useDate";
import { useMasterListRowMotion } from "@/hooks/useMasterListRowMotion";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "../ui/tooltip";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useCompany } from "@/hooks/useCompany";
import { usePrewarmVisibleAttachments } from "@/hooks/usePrewarmVisibleAttachments";
import {
  EntityListQuickFilterBar,
  type EntityListQuickFilter,
} from "@/components/entity/EntityListQuickFilterBar";
import { filterAndSortMasterEntityListRows } from "@/lib/filterMasterEntityListRows"
import { masterListShellCn, masterListRowUnselectedCn } from "@/lib/masterListChrome";
import { masterListNameTriggerCn } from "@/lib/listSelectionChrome";
import { highlightQueryInText } from "@/lib/highlightQueryInText";

interface ExpenseAccountListProps {
  accounts: ExpenseAccount[];
  onSelectAccount: (account: ExpenseAccount) => void;
  selectedAccount: ExpenseAccount | null;
  searchTerm: string;
  /** Pending approval count per account id (only when approve notifications on list). */
  pendingApprovalByAccountId?: Record<string, number>;
  disabled?: boolean;
  /** When provided, use Link for navigation (mobile/Capacitor) – static export ke liye query params */
  getItemHref?: (account: ExpenseAccount) => string | undefined;
  quickFilter?: EntityListQuickFilter;
  onQuickFilterChange?: (next: EntityListQuickFilter) => void;
  hideQuickFilterBar?: boolean;
}

export function ExpenseAccountList({
  accounts,
  onSelectAccount,
  selectedAccount,
  searchTerm,
  pendingApprovalByAccountId = {},
  disabled = false,
  getItemHref,
  quickFilter: quickFilterProp,
  onQuickFilterChange,
  hideQuickFilterBar = false,
}: ExpenseAccountListProps) {
  const { formatCurrency } = useDate();
  const { company } = useCompany();
  const { animatePresenceMode, rowMotionProps, markListScrolling } = useMasterListRowMotion();
  const [internalQuickFilter, setInternalQuickFilter] = useState<EntityListQuickFilter>("default");
  const quickFilter = quickFilterProp ?? internalQuickFilter;
  const setQuickFilter = onQuickFilterChange ?? setInternalQuickFilter;
  const quickFilterFooter = !hideQuickFilterBar ? (
    <EntityListQuickFilterBar active={quickFilter} onChange={setQuickFilter} />
  ) : null;
  const highlightSearch = searchTerm.trim();

  const filteredAndSortedAccounts = useMemo(() => {
    return filterAndSortMasterEntityListRows(accounts ?? [], searchTerm, quickFilter);
  }, [accounts, searchTerm, quickFilter]);

  const visibleAccountAttachmentUrls = useMemo(
    () =>
      filteredAndSortedAccounts
        .map((a) => trimEntityFileUrlForPreview(a.fileUrl))
        .filter((u): u is string => Boolean(u)),
    [filteredAndSortedAccounts]
  );
  usePrewarmVisibleAttachments(visibleAccountAttachmentUrls, company?.id);

  if (filteredAndSortedAccounts.length === 0) {
    return (
      <TooltipProvider delayDuration={200}>
        <div
          className={cn(masterListShellCn, disabled && "pointer-events-none opacity-60")}
          data-theme-list="account-list"
        >
          <div className="flex flex-1 min-h-0 items-center justify-center p-8 text-center text-sm text-muted-foreground">
            No accounts found.
          </div>
          {quickFilterFooter}
        </div>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <motion.div
        className={cn(masterListShellCn, disabled && "pointer-events-none opacity-60")}
        data-theme-list="account-list"
      >
        <ScrollArea
          listChrome
          className="min-h-0 min-w-0 flex-1"
          onViewportScroll={markListScrolling}
          onViewportTouchMove={markListScrolling}
        >
          <ul className="pl-master-list-ul">
            <AnimatePresence mode={animatePresenceMode}>
              {filteredAndSortedAccounts.map((account) => {
                const isSelected = selectedAccount?.id === account.id;
                const isSystem = (account as any).isSystemReserved;
                const href = getItemHref?.(account);
                const attachmentPreviewUrl = trimEntityFileUrlForPreview(account.fileUrl);
                const cardClassName = cn(disabled && "cursor-not-allowed", masterListRowUnselectedCn(isSelected));
                const cardContent = (
                      <div className="pl-master-list-row">
                        <div className="pl-master-list-row-leading">
                          <div className="relative flex-shrink-0">
                            <EntityFileAttachmentHover
                              fileUrl={attachmentPreviewUrl}
                              triggerClassName="inline-flex shrink-0 rounded-full"
                            >
                              <ResolvedEntityAvatar
                                className="h-8 w-8 text-xs"
                                companyId={(account as { companyId?: string }).companyId ?? company?.id}
                                src={attachmentPreviewUrl ?? undefined}
                                alt={account.name}
                                fallbackSlot={
                                  isSystem ? (
                                    <Lock className="h-4 w-4 text-muted-foreground" />
                                  ) : (
                                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                                  )
                                }
                              />
                            </EntityFileAttachmentHover>
                            {(pendingApprovalByAccountId[account.id] ?? 0) > 0 && (
                              <span
                                className="absolute top-0 right-0 w-4 h-4 flex items-center justify-center bg-pink-500 text-white text-[10px] font-bold origin-center rounded-full"
                                style={{ transform: "rotate(45deg) translate(25%, -25%)" }}
                                aria-label={`${pendingApprovalByAccountId[account.id]} pending approval`}
                              >
                                <span style={{ transform: "rotate(-45deg)" }}>{pendingApprovalByAccountId[account.id]}</span>
                              </span>
                            )}
                          </div>
                          <Tooltip>
                            <TooltipTrigger
                              type="button"
                              data-pl-list-name=""
                              onPointerDown={(e) => e.stopPropagation()}
                              className={masterListNameTriggerCn}
                            >
                              {highlightSearch ? highlightQueryInText(account.name, highlightSearch) : account.name}
                            </TooltipTrigger>
                            <TooltipContent side="right">
                              <p className="font-medium">{account.name}</p>
                              {(pendingApprovalByAccountId[account.id] ?? 0) > 0 && (
                                <p className="text-xs text-muted-foreground">{pendingApprovalByAccountId[account.id]} pending approval</p>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <Tooltip>
                          <TooltipTrigger
                            type="button"
                            onPointerDown={(e) => e.stopPropagation()}
                            className={cn(
                              "pl-master-list-row-amount ml-2 rounded border-0 bg-transparent px-1 text-left shadow-none",
                              account.balance >= 0 ? "text-green-600" : "text-red-600",
                              isSelected && (account.balance >= 0 ? "text-green-700" : "text-red-700")
                            )}
                          >
                            {formatCurrency(account.balance, { showDrCr: true })}
                          </TooltipTrigger>
                          <TooltipContent side="left">
                            <p className="font-medium">{formatCurrency(account.balance, { showDrCr: true })}</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                );
                return (
                  <motion.li key={account.id} {...rowMotionProps}>
                    {href ? (
                      // Master list navigation: per-row auto-prefetch off rakho to avoid repeat background bursts on revisit.
                      <Link prefetch={false} href={href} className="block min-w-0 max-w-full overflow-hidden">
                        <MasterListRow selected={isSelected} className={cardClassName}>{cardContent}</MasterListRow>
                      </Link>
                    ) : (
                      <MasterListRow selected={isSelected} className={cardClassName} onClick={() => onSelectAccount(account)}>
                        {cardContent}
                      </MasterListRow>
                    )}
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        </ScrollArea>
        {quickFilterFooter}
      </motion.div>
    </TooltipProvider>
  );
}
