
"use client";

import type { Account } from "@/components/bank-cash/types";
import { ResolvedEntityAvatar } from "@/components/entity/ResolvedEntityAvatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useDate } from "@/hooks/useDate";
import { useAnimationSettings } from "@/hooks/useAnimationSettings";
import { Landmark, Crown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipTrigger, TooltipContent } from "../ui/tooltip";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from 'next/link';
import usePermissions from "@/hooks/usePermissions";
import {
  EntityListQuickFilterBar,
  type EntityListQuickFilter,
} from "@/components/entity/EntityListQuickFilterBar";

export function AccountList({
  accounts,
  selectedAccount,
  onSelectAccount,
  searchTerm,
  pendingApprovalByAccountId = {},
  getItemHref,
}: {
  accounts: Account[];
  selectedAccount: Account | null;
  onSelectAccount: (account: Account) => void;
  searchTerm: string;
  /** Pending approval count per account id (only when approve notifications on list). */
  pendingApprovalByAccountId?: Record<string, number>;
  /** When provided, use Link for navigation (mobile/Capacitor) – static export ke liye query params */
  getItemHref?: (account: Account) => string | undefined;
}) {
  const { formatCurrency } = useDate();
  const { can } = usePermissions();
  const [quickFilter, setQuickFilter] = useState<EntityListQuickFilter>("default");
  const { settings: animationSettings } = useAnimationSettings();
  const isRowAnimationEnabled = animationSettings?.rows?.enabled === true;
  const rowAnimationDuration = isRowAnimationEnabled ? (animationSettings?.rows?.duration ?? 2.5) : 0;
  const canViewSpecialAccount = can('view_special_bank_accounts');
  const canViewSpecialBalance = can('view_special_account_balance');

  const filteredAndSortedAccounts = useMemo(() => {
      const toDateMs = (raw: unknown): number => {
        if (!raw) return 0;
        if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? 0 : raw.getTime();
        if (typeof (raw as { toDate?: () => Date }).toDate === "function") {
          const d = (raw as { toDate: () => Date }).toDate();
          return Number.isNaN(d.getTime()) ? 0 : d.getTime();
        }
        const d = new Date(raw as any);
        return Number.isNaN(d.getTime()) ? 0 : d.getTime();
      };
      const isSettled = (bal: number) => Math.abs(Number(bal || 0)) < 1e-6;
      return accounts
        .filter(account => {
            if (account.isSpecial && !canViewSpecialAccount) return false;
            if (!account.accountName || !account.accountName.toLowerCase().includes(searchTerm.toLowerCase())) return false;
            const bal = Number(account.balance || 0);
            // Footer quick filters: list short/filter from same control on mobile + desktop.
            if (quickFilter === "dr") return bal > 0;
            if (quickFilter === "cr") return bal < 0;
            if (quickFilter === "settled") return isSettled(bal);
            if (quickFilter === "non_settled") return !isSettled(bal);
            return true;
        })
        .sort((a, b) => {
          if (quickFilter === "name") return String(a.accountName || "").localeCompare(String(b.accountName || ""));
          if (quickFilter === "date") return toDateMs(b.openingBalanceDate) - toDateMs(a.openingBalanceDate);
          return Math.abs(Number(b.balance || 0)) - Math.abs(Number(a.balance || 0));
        });
  }, [accounts, searchTerm, canViewSpecialAccount, quickFilter]);


  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col rounded-b-lg border-t-0 bg-background">
      <ScrollArea className="min-h-0 min-w-0 flex-1">
        <ul className="p-2 space-y-1">
          <AnimatePresence mode="popLayout">
            {filteredAndSortedAccounts.map((account) => {
              const isSelected = selectedAccount?.id === account.id;
              const isSpecial = account.isSpecial;
              const href = getItemHref?.(account);
              const cardClassName = cn(
                "min-w-0 max-w-full overflow-hidden p-1.5 cursor-pointer border rounded-md transition-all duration-200",
                isSelected
                  ? "border-primary bg-secondary shadow-sm"
                  : "border-gray-300 dark:border-gray-600 border-[1.5px] hover:border-primary/40 hover:bg-muted/30"
              );
              const cardContent = (
                <div className="pl-master-list-row">
                  <div className="pl-master-list-row-leading">
                    <div className="relative flex-shrink-0">
                      <ResolvedEntityAvatar
                        className="h-8 w-8 text-xs"
                        src={account.fileUrl}
                        alt={account.accountName}
                        fallbackSlot={
                          isSpecial ? (
                            <Crown className="h-4 w-4 text-amber-500" />
                          ) : (
                            <Landmark className="h-4 w-4 text-muted-foreground" />
                          )
                        }
                      />
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
                      {/* asChild: truncate flex child ma kaam garcha */}
                      <TooltipTrigger asChild>
                        <span
                          className={cn(
                            "pl-master-list-row-name cursor-default",
                            isSpecial && "text-amber-600"
                          )}
                        >
                          {account.accountName}
                        </span>
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
                      "pl-master-list-row-amount ml-2",
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
          {filteredAndSortedAccounts.length === 0 && (
            <div className="text-center text-muted-foreground p-8">
              No accounts found.
            </div>
          )}
        </ul>
      </ScrollArea>
      <EntityListQuickFilterBar active={quickFilter} onChange={setQuickFilter} />
    </div>
  );
}
