"use client";

import type { Staff } from "@/components/staff/types";
import { ResolvedEntityAvatar } from "@/components/entity/ResolvedEntityAvatar";
import { EntityFileAttachmentHover } from "@/components/entity/EntityFileAttachmentHover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn, masterDetailBalanceToneClass } from "@/lib/utils";
import {
  masterListShellCn,
  masterListRowUnselectedCn,
  MASTER_LIST_AVATAR_CN,
  MASTER_LIST_AVATAR_FALLBACK_CN,
} from "@/lib/masterListChrome";
import { useDate } from "@/hooks/useDate";
import { masterListOrderKey, useMasterListDisplayRows, useMasterListRowMotion } from "@/hooks/useMasterListRowMotion";
import { LoanLiabilityEntityIcon } from "@/components/entity/LoanLiabilityEntityIcon";
import { MasterListRow } from "@/components/ui/master-list-row";
import { MasterListNameTooltip } from "@/components/entity/MasterListNameTooltip";
import { MasterAccountFreezeListBadge } from "@/components/masterAccountFreeze/MasterAccountFreezeListBadge";
import { readMasterAccountFrozen } from "@/lib/masterAccountFreeze/types";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  EntityListQuickFilterBar,
  type EntityListQuickFilter,
} from "@/components/entity/EntityListQuickFilterBar";
import { usePrewarmVisibleAttachments } from "@/hooks/usePrewarmVisibleAttachments";
import { useCompany } from "@/hooks/useCompany";
import { useVouchers } from "@/hooks/useVouchers";
import { highlightQueryInText } from "@/lib/highlightQueryInText";
import { masterEntityTextMatchesSearch } from "@/lib/filterMasterEntityListRows";
import type { Loan } from "../types/loanTypes";
import { findLoanForAccount } from "../db/loanQueries";
import { resolveLoanAccountAvatarUrl } from "../utils/resolveLoanAccountAvatarUrl";

export function LoanAccountList({
  accounts,
  loans = [],
  selectedAccount,
  onSelectAccount,
  searchTerm,
  pendingApprovalByAccountId = {},
  quickFilter: quickFilterProp,
  onQuickFilterChange,
  hideQuickFilterBar = false,
}: {
  accounts: Staff[];
  loans?: Loan[];
  selectedAccount: Staff | null;
  onSelectAccount: (account: Staff) => void;
  searchTerm: string;
  pendingApprovalByAccountId?: Record<string, number>;
  quickFilter?: EntityListQuickFilter;
  onQuickFilterChange?: (next: EntityListQuickFilter) => void;
  hideQuickFilterBar?: boolean;
}) {
  const { formatCurrency } = useDate();
  const { company } = useCompany();
  const { processedStaff, processedAccounts } = useVouchers();
  const [internalQuickFilter, setInternalQuickFilter] = useState<EntityListQuickFilter>("default");
  const quickFilter = quickFilterProp ?? internalQuickFilter;
  const setQuickFilter = onQuickFilterChange ?? setInternalQuickFilter;
  const { animatePresenceMode, rowMotionProps, markListScrolling, isRowAnimationEnabled, layoutHoldMs } =
    useMasterListRowMotion();
  const highlightSearch = searchTerm.trim();

  const loanTypeByAccountId = useMemo(() => {
    const out = new Map<string, string>();
    for (const account of accounts) {
      const loan = findLoanForAccount(loans, account.id);
      const label = String(loan?.loanType || "").trim();
      if (label) out.set(account.id, label);
    }
    return out;
  }, [accounts, loans]);

  const loanByAccountId = useMemo(() => {
    const out = new Map<string, Loan>();
    for (const loan of loans) {
      const id = String(loan.loanAccountId || "").trim();
      if (id) out.set(id, loan);
    }
    return out;
  }, [loans]);

  const staffById = useMemo(() => {
    const out = new Map<string, Staff>();
    for (const row of processedStaff || []) out.set(row.id, row);
    return out;
  }, [processedStaff]);

  const filteredAndSortedAccounts = useMemo(() => {
    const toDateMs = (raw: unknown): number => {
      if (!raw) return 0;
      if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? 0 : raw.getTime();
      if (typeof (raw as { toDate?: () => Date }).toDate === "function") {
        const d = (raw as { toDate: () => Date }).toDate();
        return Number.isNaN(d.getTime()) ? 0 : d.getTime();
      }
      const d = new Date(raw as never);
      return Number.isNaN(d.getTime()) ? 0 : d.getTime();
    };
    const isSettled = (bal: number) => Math.abs(Number(bal || 0)) < 1e-6;
    return accounts
      .filter((account) => {
        const label = String(account.name || "").trim();
        if (!label || !masterEntityTextMatchesSearch(label, searchTerm)) return false;
        const bal = Number(account.balance || 0);
        if (quickFilter === "dr") return bal > 0;
        if (quickFilter === "cr") return bal < 0;
        if (quickFilter === "settled") return isSettled(bal);
        if (quickFilter === "non_settled") return !isSettled(bal);
        return true;
      })
      .sort((a, b) => {
        if (quickFilter === "name") return String(a.name || "").localeCompare(String(b.name || ""));
        if (quickFilter === "date") return toDateMs(b.openingBalanceDate) - toDateMs(a.openingBalanceDate);
        return Math.abs(Number(b.balance || 0)) - Math.abs(Number(a.balance || 0));
      });
  }, [accounts, searchTerm, quickFilter]);

  const visibleAccountAttachmentUrls = useMemo(
    () =>
      filteredAndSortedAccounts
        .map((a) => {
          const live = staffById.get(a.id) ?? a;
          return resolveLoanAccountAvatarUrl(live, loanByAccountId.get(a.id), processedAccounts);
        })
        .filter((u): u is string => Boolean(u)),
    [filteredAndSortedAccounts, staffById, loanByAccountId, processedAccounts]
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
              const liveAccount = staffById.get(account.id) ?? account;
              const linkedLoan = loanByAccountId.get(account.id);
              const displayName = String(liveAccount.name || "").trim() || "Loan account";
              const accountTypeLabel = loanTypeByAccountId.get(account.id) || "";
              const attachmentPreviewUrl = resolveLoanAccountAvatarUrl(
                liveAccount,
                linkedLoan,
                processedAccounts
              );
              const avatarCompanyId =
                String(liveAccount.companyId || linkedLoan?.companyId || company?.id || "").trim() || undefined;
              const cardClassName = masterListRowUnselectedCn(isSelected);
              const displayBalance = Number(account.balance) || 0;
              const cardContent = (
                <div className="pl-master-list-row">
                  <div className="pl-master-list-row-leading">
                    <div className="relative flex-shrink-0">
                      <EntityFileAttachmentHover
                        fileUrl={attachmentPreviewUrl}
                        triggerClassName="inline-flex shrink-0 rounded-full"
                      >
                        <ResolvedEntityAvatar
                          className={MASTER_LIST_AVATAR_CN}
                          fallbackClassName={MASTER_LIST_AVATAR_FALLBACK_CN}
                          companyId={avatarCompanyId}
                          src={attachmentPreviewUrl ?? undefined}
                          alt={displayName}
                          fallbackSlot={<LoanLiabilityEntityIcon size="avatar" />}
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
                    <div className="flex min-w-0 flex-col">
                      <MasterListNameTooltip
                        measureKey={displayName}
                        tooltipContent={
                          <>
                            <p>{displayName}</p>
                            {accountTypeLabel ? (
                              <p className="text-xs text-muted-foreground">{accountTypeLabel}</p>
                            ) : null}
                            {(pendingApprovalByAccountId[account.id] ?? 0) > 0 && (
                              <p className="text-xs text-muted-foreground">
                                {pendingApprovalByAccountId[account.id]} pending approval
                              </p>
                            )}
                          </>
                        }
                      >
                        {highlightSearch ? highlightQueryInText(displayName, highlightSearch) : displayName}
                      </MasterListNameTooltip>
                      {accountTypeLabel ? (
                        <span
                          className="truncate text-[11px] leading-tight text-muted-foreground"
                          title={accountTypeLabel}
                        >
                          {accountTypeLabel}
                        </span>
                      ) : null}
                      {readMasterAccountFrozen(account) ? <MasterAccountFreezeListBadge className="mt-0.5" /> : null}
                    </div>
                  </div>
                  <p
                    data-pl-list-balance={displayBalance >= 0 ? "dr" : "cr"}
                    className={cn(
                      "ml-2 shrink-0 pl-master-list-row-amount",
                      masterDetailBalanceToneClass(displayBalance),
                      isSelected && (displayBalance >= 0 ? "text-green-700" : "text-red-700")
                    )}
                  >
                    {formatCurrency(displayBalance, { showDrCr: true })}
                  </p>
                </div>
              );
              return (
                <motion.li key={account.id} layoutDependency={displayOrderKey} {...rowMotionProps}>
                  <MasterListRow
                    selected={isSelected}
                    className={cardClassName}
                    onClick={() => onSelectAccount(account)}
                  >
                    {cardContent}
                  </MasterListRow>
                </motion.li>
              );
            })}
          </AnimatePresence>
          {displayListRows.length === 0 && (
            <div className="text-center text-muted-foreground p-8">No accounts found.</div>
          )}
        </ul>
      </ScrollArea>
      {!hideQuickFilterBar ? (
        <EntityListQuickFilterBar active={quickFilter} onChange={setQuickFilter} />
      ) : null}
    </div>
  );
}
