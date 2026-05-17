"use client";
import type { ExpenseAccount } from "@/components/expenses/types";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MasterListRow } from "@/components/ui/master-list-row";
import { DollarSign, Lock } from "lucide-react";
import { useDate } from "@/hooks/useDate";
import { useAnimationSettings } from "@/hooks/useAnimationSettings";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "../ui/tooltip";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  EntityListQuickFilterBar,
  type EntityListQuickFilter,
} from "@/components/entity/EntityListQuickFilterBar";
import { filterAndSortMasterEntityListRows } from "@/lib/filterMasterEntityListRows"
import { masterListShellCn, masterListRowUnselectedCn } from "@/lib/masterListChrome";
import { masterListNameTriggerCn } from "@/lib/listSelectionChrome";

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
}

export function ExpenseAccountList({
  accounts,
  onSelectAccount,
  selectedAccount,
  searchTerm,
  pendingApprovalByAccountId = {},
  disabled = false,
  getItemHref,
}: ExpenseAccountListProps) {
  const { formatCurrency } = useDate();
  const { settings: animationSettings } = useAnimationSettings();
  const isRowAnimationEnabled = animationSettings?.rows?.enabled === true;
  const rowAnimationDuration = isRowAnimationEnabled ? (animationSettings?.rows?.duration ?? 2.5) : 0;
  /** Income & Expense account column — Party jaisi sort/footer controls */
  const [quickFilter, setQuickFilter] = useState<EntityListQuickFilter>("default");

  const filteredAndSortedAccounts = useMemo(() => {
    return filterAndSortMasterEntityListRows(accounts ?? [], searchTerm, quickFilter);
  }, [accounts, searchTerm, quickFilter]);

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
          <EntityListQuickFilterBar active={quickFilter} onChange={setQuickFilter} />
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
        <ScrollArea listChrome className="min-h-0 min-w-0 flex-1">
          <ul className="pl-master-list-ul">
            <AnimatePresence mode="popLayout">
              {filteredAndSortedAccounts.map((account) => {
                const isSelected = selectedAccount?.id === account.id;
                const isSystem = (account as any).isSystemReserved;
                const href = getItemHref?.(account);
                const cardClassName = cn(disabled && "cursor-not-allowed", masterListRowUnselectedCn(isSelected));
                const cardContent = (
                      <div className="pl-master-list-row">
                        <div className="pl-master-list-row-leading">
                          <div className="relative flex-shrink-0">
                            <div className="h-8 w-8 flex items-center justify-center bg-muted rounded-md text-muted-foreground">
                              {isSystem ? <Lock className="h-4 w-4" /> : <DollarSign className="h-4 w-4" />}
                            </div>
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
                              {account.name}
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
                  <motion.li
                    key={account.id}
                    layout
                    initial={false}
                    exit={{ transition: { duration: 0 } }}
                    transition={{ duration: rowAnimationDuration, ease: "easeInOut" }}
                  >
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
        <EntityListQuickFilterBar active={quickFilter} onChange={setQuickFilter} />
      </motion.div>
    </TooltipProvider>
  );
}
