
"use client";

import { bankAccountDisplayName } from "@/lib/bankAccountDisplayName";
import type { Account } from "@/components/bank-cash/types";
import { ResolvedEntityAvatar } from "@/components/entity/ResolvedEntityAvatar";
import { EntityFileAttachmentHover } from "@/components/entity/EntityFileAttachmentHover";
import { trimEntityFileUrlForPreview } from "@/lib/trimEntityFileUrlForPreview";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn, masterDetailBalanceToneClass } from "@/lib/utils"
import { masterListShellCn, masterListRowUnselectedCn } from "@/lib/masterListChrome";
import { masterListNameTriggerCn } from "@/lib/listSelectionChrome";
import { useDate } from "@/hooks/useDate";
import { masterListOrderKey, useMasterListDisplayRows, useMasterListRowMotion } from "@/hooks/useMasterListRowMotion";
import { Landmark, Crown } from "lucide-react";
import { MasterListRow } from "@/components/ui/master-list-row";
import { Tooltip, TooltipTrigger, TooltipContent } from "../ui/tooltip";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import usePermissions from "@/hooks/usePermissions";
import {
  EntityListQuickFilterBar,
  type EntityListQuickFilter,
} from "@/components/entity/EntityListQuickFilterBar";
import { usePrewarmVisibleAttachments } from "@/hooks/usePrewarmVisibleAttachments";
import { useCompany } from "@/hooks/useCompany";
import { highlightQueryInText } from "@/lib/highlightQueryInText";
import { masterEntityTextMatchesSearch } from "@/lib/filterMasterEntityListRows";
import { useBankLedgerDrCrPerspective } from "@/hooks/useBankLedgerDrCrPerspective";
import { flipLedgerSignedBalance } from "@/lib/bankLedgerDrCrPerspective";

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
  const { company } = useCompany();
  const { can } = usePermissions();
  const { perspective: bankDrCrPerspective } = useBankLedgerDrCrPerspective();
  const [internalQuickFilter, setInternalQuickFilter] = useState<EntityListQuickFilter>("default");
  const quickFilter = quickFilterProp ?? internalQuickFilter;
  const setQuickFilter = onQuickFilterChange ?? setInternalQuickFilter;
  const { animatePresenceMode, rowMotionProps, markListScrolling, isRowAnimationEnabled, layoutHoldMs } = useMasterListRowMotion();
  const canViewSpecialAccount = can('view_special_bank_accounts');
  const canViewSpecialBalance = can('view_special_account_balance');
  const highlightSearch = searchTerm.trim();

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
            const label = bankAccountDisplayName(account);
            if (!label || !masterEntityTextMatchesSearch(label, searchTerm)) return false;
            const bal = Number(account.balance || 0);
            // Footer quick filters: list short/filter from same control on mobile + desktop.
            if (quickFilter === "dr") return bal > 0;
            if (quickFilter === "cr") return bal < 0;
            if (quickFilter === "settled") return isSettled(bal);
            if (quickFilter === "non_settled") return !isSettled(bal);
            return true;
        })
        .sort((a, b) => {
          if (quickFilter === "name") {
            return bankAccountDisplayName(a).localeCompare(bankAccountDisplayName(b));
          }
          if (quickFilter === "date") return toDateMs(b.openingBalanceDate) - toDateMs(a.openingBalanceDate);
          return Math.abs(Number(b.balance || 0)) - Math.abs(Number(a.balance || 0));
        });
  }, [accounts, searchTerm, canViewSpecialAccount, quickFilter]);

  const visibleAccountAttachmentUrls = useMemo(
    () =>
      filteredAndSortedAccounts
        .map((a) => trimEntityFileUrlForPreview(a.fileUrl))
        .filter((u): u is string => Boolean(u)),
    [filteredAndSortedAccounts]
  );
  usePrewarmVisibleAttachments(visibleAccountAttachmentUrls, company?.id);

  const listOrderKey = useMemo(
    () => masterListOrderKey(filteredAndSortedAccounts.map((a) => a.id)),
    [filteredAndSortedAccounts]
  );

  const { displayRows: displayListRows, displayOrderKey } = useMasterListDisplayRows(
    filteredAndSortedAccounts,
    listOrderKey,
    { enabled: isRowAnimationEnabled, holdMs: layoutHoldMs }
  );

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
            {displayListRows.map((account) => {
              const isSelected = selectedAccount?.id === account.id;
              const isSpecial = account.isSpecial;
              const displayName = bankAccountDisplayName(account);
              const href = getItemHref?.(account);
              const attachmentPreviewUrl = trimEntityFileUrlForPreview(account.fileUrl);
              const cardClassName = masterListRowUnselectedCn(isSelected);
              const displayBalance = flipLedgerSignedBalance(
                Number(account.balance) || 0,
                bankDrCrPerspective
              );
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
                          companyId={account.companyId}
                          src={attachmentPreviewUrl ?? undefined}
                          alt={displayName}
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
                        {highlightSearch ? highlightQueryInText(displayName, highlightSearch) : displayName}
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{displayName}</p>
                        {(pendingApprovalByAccountId[account.id] ?? 0) > 0 && (
                          <p className="text-xs text-muted-foreground">{pendingApprovalByAccountId[account.id]} pending approval</p>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  {/* data-pl-list-balance: mobile list chrome me Dr/Cr color force (globals.css) */}
                  <p
                    data-pl-list-balance={displayBalance >= 0 ? "dr" : "cr"}
                    className={cn(
                      "pl-master-list-row-amount ml-2",
                      masterDetailBalanceToneClass(displayBalance),
                      isSelected &&
                        (displayBalance >= 0 ? "text-green-700" : "text-red-700")
                    )}
                  >
                    {(isSpecial && !canViewSpecialBalance) ? '*****' : formatCurrency(displayBalance, { showDrCr: true })}
                  </p>
                </div>
              );
              return (
                <motion.li key={account.id} layoutDependency={displayOrderKey} {...rowMotionProps}>
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
          {displayListRows.length === 0 && (
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
