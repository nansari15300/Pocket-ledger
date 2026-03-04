
"use client";

import type { Account } from "@/components/bank-cash/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useDate } from "@/hooks/useDate";
import { useAnimationSettings } from "@/hooks/useAnimationSettings";
import { Landmark, Crown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipTrigger, TooltipContent } from "../ui/tooltip";
import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from 'next/link';
import usePermissions from "@/hooks/usePermissions";

export function AccountList({
  accounts,
  selectedAccount,
  onSelectAccount,
  searchTerm,
  pendingApprovalByAccountId = {},
}: {
  accounts: Account[];
  selectedAccount: Account | null;
  onSelectAccount: (account: Account) => void;
  searchTerm: string;
  /** Pending approval count per account id (only when approve notifications on list). */
  pendingApprovalByAccountId?: Record<string, number>;
}) {
  const { formatCurrency } = useDate();
  const { can } = usePermissions();
  const { settings: animationSettings } = useAnimationSettings();
  const isRowAnimationEnabled = animationSettings?.rows?.enabled === true;
  const rowAnimationDuration = isRowAnimationEnabled ? (animationSettings?.rows?.duration ?? 2.5) : 0;
  const canViewSpecialAccount = can('view_special_bank_accounts');
  const canViewSpecialBalance = can('view_special_account_balance');

  const filteredAndSortedAccounts = useMemo(() => {
      return accounts
        .filter(account => {
            if (account.isSpecial && !canViewSpecialAccount) return false;
            // Add a check to ensure accountName exists before filtering
            return account.accountName && account.accountName.toLowerCase().includes(searchTerm.toLowerCase());
        })
        .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
  }, [accounts, searchTerm, canViewSpecialAccount]);


  return (
    <div className="flex flex-col h-full min-h-0 rounded-b-lg border-t-0 bg-background">
      <ScrollArea className="flex-1 min-h-0">
        <ul className="p-2 space-y-1">
          <AnimatePresence mode="popLayout">
            {filteredAndSortedAccounts.map((account) => {
              const isSelected = selectedAccount?.id === account.id;
              const isSpecial = account.isSpecial;
              
              return (
                <motion.li
                    key={account.id}
                    layout
                    initial={false}
                    exit={{ transition: { duration: 0 } }}

                    transition={{ duration: rowAnimationDuration, ease: "easeInOut" }}
                >
                  <Card
                      className={cn(
                        "p-1.5 cursor-pointer border rounded-md transition-all duration-200",
                        isSelected
                          ? "border-primary bg-secondary shadow-sm"
                          : "border-gray-300 dark:border-gray-600 border-[1.5px] hover:border-primary/40 hover:bg-muted/30"
                      )}
                      onClick={() => onSelectAccount(account)}
                    >
                      <div className="flex items-center justify-between w-full gap-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div className="relative flex-shrink-0">
                            <Avatar className="h-8 w-8 text-xs">
                              <AvatarImage src={account.fileUrl} />
                              <AvatarFallback className="bg-muted text-muted-foreground">
                                {isSpecial ? <Crown className="h-4 w-4 text-amber-500"/> : <Landmark className="h-4 w-4" />}
                              </AvatarFallback>
                            </Avatar>
                            {(pendingApprovalByAccountId[account.id] ?? 0) > 0 && (
                              <span
                                className="absolute top-0 right-0 w-4 h-4 flex items-center justify-center bg-pink-500 text-white text-[10px] font-bold origin-center"
                                style={{ transform: "rotate(45deg) translate(25%, -25%)" }}
                                aria-label={`${pendingApprovalByAccountId[account.id]} pending approval`}
                              >
                                <span style={{ transform: "rotate(-45deg)" }}>{pendingApprovalByAccountId[account.id]}</span>
                              </span>
                            )}
                          </div>
                          <Tooltip>
                            <TooltipTrigger className={cn("text-sm font-medium whitespace-nowrap truncate flex-1 min-w-0 text-left p-0 h-auto bg-transparent hover:bg-transparent border-none shadow-none", isSpecial && "text-amber-600")}>
                              {account.accountName}
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{account.accountName}</p>
                              {(pendingApprovalByAccountId[account.id] ?? 0) > 0 && (
                                <p className="text-xs text-muted-foreground">{pendingApprovalByAccountId[account.id]} pending approval</p>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <p
                          className={cn(
                            "text-sm font-medium whitespace-nowrap flex-shrink-0 ml-2",
                            account.balance >= 0 ? "text-green-600" : "text-red-600",
                            isSelected &&
                              (account.balance >= 0
                                ? "text-green-800"
                                : "text-red-800")
                          )}
                        >
                          {(isSpecial && !canViewSpecialBalance) ? '*****' : formatCurrency(account.balance, { showDrCr: true })}
                        </p>
                      </div>
                    </Card>
                </motion.li>
              );
            })}
          </AnimatePresence>
          {filteredAndSortedAccounts.length === 0 && (
            <div className="text-center text-muted-foreground p-8">
              No accounts found.
            </div>
          )}
        </ul>
      </ScrollArea>
    </div>
  );
}
