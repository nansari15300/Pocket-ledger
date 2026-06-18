
"use client";

import type { Account } from "@/components/bank-cash/types";
import { ResolvedEntityAvatar } from "@/components/entity/ResolvedEntityAvatar";
import { EntityFileAttachmentHover } from "@/components/entity/EntityFileAttachmentHover";
import { trimEntityFileUrlForPreview } from "@/lib/trimEntityFileUrlForPreview";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn, masterDetailBalanceToneClass } from "@/lib/utils"
import { masterListShellCn, masterListRowUnselectedCn } from "@/lib/masterListChrome";
import { masterListNameTriggerCn } from "@/lib/listSelectionChrome";
import { useDate } from "@/hooks/useDate";
import { useMasterListRowMotion } from "@/hooks/useMasterListRowMotion";
import { Landmark, Crown } from "lucide-react";
import { MasterListRow } from "@/components/ui/master-list-row";
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
  quickFilter: quickFilterProp,
  onQuickFilterChange,
  hideQuickFilterBar = false,
}: {
  accounts: Account[];
  selectedAccount: Account | null;
  onSelectAccount: (account: Account) => void;
  searchTerm: string;
  /** Pending approval count per account id (only when approve notifications on list). */
  pendingApprovalByAccountId?: Record<string, number>;
  /** When provided, use Link for navigation (mobile/Capacitor) – static export ke liye query params */
  getItemHref?: (account: Account) => string | undefined;
  quickFilter?: EntityListQuickFilter;
  onQuickFilterChange?: (next: EntityListQuickFilter) => void;
  hideQuickFilterBar?: boolean;
}) {
  const { formatCurrency } = useDate();
  const { can } = usePermissions();
  const [internalQuickFilter, setInternalQuickFilter] = useState<EntityListQuickFilter>("default");
  const quickFilter = quickFilterProp ?? internalQuickFilter;
  const setQuickFilter = onQuickFilterChange ?? setInternalQuickFilter;
  const { animatePresenceMode, rowMotionProps, markListScrolling } = useMasterListRowMotion();
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
    <div className={masterListShellCn}>
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
              const isSpecial = account.isSpecial;
              const href = getItemHref?.(account);
              const attachmentPreviewUrl = trimEntityFileUrlForPreview(account.fileUrl);
              const cardClassName = masterListRowUnselectedCn(isSelected);
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
                          src={attachmentPreviewUrl ?? undefined}
                          alt={account.accountName}
                          fallbackSlot={
                            isSpecial ? (
                              <Crown className="h-4 w-4 text-amber-500" />
                            ) : (
                              <Landmark className="h-4 w-4 text-muted-foreground" />
                            )
                          }
                        />
                      </EntityFileAttachmentHover>
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
                      {/* asChild hata — motion layout + span ref merge par Radix setRef loop */}
                      <TooltipTrigger
                        type="button"
                        data-pl-list-name=""
                        onPointerDown={(e) => e.stopPropagation()}
                        className={cn(masterListNameTriggerCn, isSpecial && "text-amber-600")}
                      >
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
                  {/* data-pl-list-balance: mobile list chrome me Dr/Cr color force (globals.css) */}
                  <p
                    data-pl-list-balance={account.balance >= 0 ? "dr" : "cr"}
                    className={cn(
                      "pl-master-list-row-amount ml-2",
                      masterDetailBalanceToneClass(account.balance),
                      isSelected &&
                        (account.balance >= 0 ? "text-green-700" : "text-red-700")
                    )}
                  >
                    {(isSpecial && !canViewSpecialBalance) ? '*****' : formatCurrency(account.balance, { showDrCr: true })}
                  </p>
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
          {filteredAndSortedAccounts.length === 0 && (
            <div className="text-center text-muted-foreground p-8">
              No accounts found.
            </div>
          )}
        </ul>
      </ScrollArea>
      {!hideQuickFilterBar ? (
        <EntityListQuickFilterBar active={quickFilter} onChange={setQuickFilter} />
      ) : null}
    </div>
  );
}
