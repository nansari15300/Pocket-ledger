
"use client";

import type { ExpenseAccount } from "@/components/expenses/types";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { DollarSign, Lock } from "lucide-react";
import { useDate } from "@/hooks/useDate";
import { useAnimationSettings } from "@/hooks/useAnimationSettings";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "../ui/tooltip";
import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

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

  const filteredAndSortedAccounts = useMemo(() => {
    return (accounts || [])
      .filter((account) => {
        if (!account.name) return false;
        const nameLower = account.name.toLowerCase();
        const searchLower = searchTerm.toLowerCase();
        return nameLower.includes(searchLower);
      })
      .sort((a, b) => Math.abs(b.balance || 0) - Math.abs(a.balance || 0));
  }, [accounts, searchTerm]);

  if (filteredAndSortedAccounts.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground bg-background rounded-b-lg border-t-0">
        No accounts found.
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className={cn("flex h-full min-h-0 min-w-0 flex-col rounded-b-lg border-t-0 bg-background", disabled && "pointer-events-none opacity-60")}>
        <ScrollArea className="min-h-0 min-w-0 flex-1">
          <ul className="p-2 space-y-1">
            <AnimatePresence mode="popLayout">
              {filteredAndSortedAccounts.map((account) => {
                const isSelected = selectedAccount?.id === account.id;
                const isSystem = (account as any).isSystemReserved;
                const href = getItemHref?.(account);
                const cardClassName = cn(
                  "min-w-0 max-w-full overflow-hidden p-1.5 cursor-pointer border rounded-md transition-all duration-200",
                  disabled && "cursor-not-allowed",
                  isSelected
                    ? "border-primary bg-secondary shadow-sm"
                    : "border-gray-300 dark:border-gray-600 border-[1.5px] hover:border-primary/40 hover:bg-muted/30"
                );
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
                            <TooltipTrigger asChild>
                              <span className="pl-master-list-row-name cursor-default">
                                {account.name}
                              </span>
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
                          <TooltipTrigger asChild>
                            <div
                              className={cn(
                                "pl-master-list-row-amount ml-2",
                                account.balance >= 0 ? "text-green-600" : "text-red-600",
                                isSelected && (account.balance >= 0 ? "text-green-700" : "text-red-700")
                              )}
                            >
                              {formatCurrency(account.balance, { showDrCr: true })}
                            </div>
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
                      <Link href={href} className="block min-w-0 max-w-full overflow-hidden">
                        <Card className={cardClassName}>{cardContent}</Card>
                      </Link>
                    ) : (
                      <Card className={cardClassName} onClick={() => onSelectAccount(account)}>
                        {cardContent}
                      </Card>
                    )}
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        </ScrollArea>
      </div>
    </TooltipProvider>
  );
}
