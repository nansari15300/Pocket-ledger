
"use client";

import type { Party } from "@/components/party/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useDate } from "@/hooks/useDate";
import { useAnimationSettings } from "@/hooks/useAnimationSettings";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "../ui/tooltip";
import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { ResolvedEntityAvatar } from "@/components/entity/ResolvedEntityAvatar";
import {
  EntityListQuickFilterBar,
  type EntityListQuickFilter,
} from "@/components/entity/EntityListQuickFilterBar";

const getInitials = (name: string) => {
  if (!name) return "NA";
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
};

export const PartyList = React.memo(({
  parties,
  selectedParty,
  onSelectParty,
  searchTerm,
  topPartyId,
  overdueVoucherCount,
  pendingApprovalByPartyId = {},
  getItemHref,
}: {
  parties: Party[];
  selectedParty: Party | null;
  onSelectParty: (party: Party) => void;
  searchTerm: string;
  /** When set, the party with this id is always shown first (e.g. Overdue Vouchers). */
  topPartyId?: string;
  /** When set and party is the top (Overdue Vouchers), show "X vouchers" instead of balance. */
  overdueVoucherCount?: number;
  /** Pending approval count per party id (only passed when approve notifications on list). */
  pendingApprovalByPartyId?: Record<string, number>;
  /** When provided, use Link for navigation (mobile/Capacitor) – ensures details page opens reliably */
  getItemHref?: (party: Party) => string | undefined;
}) => {
  const { formatCurrency } = useDate();
  const { settings: animationSettings } = useAnimationSettings();
  const [quickFilter, setQuickFilter] = useState<EntityListQuickFilter>("default");
  const isRowAnimationEnabled = animationSettings?.rows?.enabled === true;
  const rowAnimationDuration = isRowAnimationEnabled ? (animationSettings?.rows?.duration ?? 2.5) : 0;

  const filteredAndSortedParties = useMemo(() => {
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
    const list = parties || [];
    const searchLower = searchTerm.toLowerCase();
    const filterFn = (party: Party) => {
      if (!party.name) return false;
      const nameLower = party.name.toLowerCase();
      const matchesSearch = !searchLower || nameLower.includes(searchLower);
      const isSystemAccount = (party as any).isSystemAccount === true;
      if (!matchesSearch || isSystemAccount) return false;
      const bal = Number(party.balance || 0);
      // Footer quick filters: list short/filter from same control on mobile + desktop.
      if (quickFilter === "dr") return bal > 0;
      if (quickFilter === "cr") return bal < 0;
      if (quickFilter === "settled") return isSettled(bal);
      if (quickFilter === "non_settled") return !isSettled(bal);
      return true;
    };
    const pinned = topPartyId ? list.filter((p) => p.id === topPartyId && filterFn(p)) : [];
    const rest = topPartyId ? list.filter((p) => p.id !== topPartyId) : list;
    const filteredRest = rest
      .filter(filterFn)
      .sort((a, b) => {
        if (quickFilter === "name") return String(a.name || "").localeCompare(String(b.name || ""));
        if (quickFilter === "date") return toDateMs(b.openingBalanceDate) - toDateMs(a.openingBalanceDate);
        return Math.abs(Number(b.balance || 0)) - Math.abs(Number(a.balance || 0));
      });
    return [...pinned, ...filteredRest];
  }, [parties, searchTerm, topPartyId, quickFilter]);

  // यदि कुनै पार्टी भेटिएन भने
  if (filteredAndSortedParties.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground bg-background rounded-b-lg border-t-0">
        No parties found.
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      {/* min-w-0: grid 25% column bhitra ScrollArea overflow — lamba naam failaaundaina */}
      <div className="flex h-full min-h-0 min-w-0 flex-col rounded-b-lg border-t-0 bg-background" data-theme-list="account-list">
        <ScrollArea className="min-h-0 min-w-0 flex-1">
          <ul className="p-2 space-y-1">
            <AnimatePresence mode="popLayout">
              {filteredAndSortedParties.map((party) => {
                const isSelected = selectedParty?.id === party.id;
                const href = getItemHref?.(party);
                const cardContent = (
                  <div className="pl-master-list-row">
                        {/* बायाँ: avatar + naam (flex-1 truncate — mobile ma amount clip hundaina) */}
                        <div className="pl-master-list-row-leading">
                          <div className="relative flex-shrink-0">
                            <ResolvedEntityAvatar
                              className="h-8 w-8 border text-xs"
                              src={party.fileUrl}
                              alt={party.name}
                              fallbackText={getInitials(party.name)}
                            />
                            {(pendingApprovalByPartyId[party.id] ?? 0) > 0 && (
                              <span
                                className="absolute top-0 right-0 w-4 h-4 flex items-center justify-center bg-pink-500 text-white text-[10px] font-bold origin-center"
                                style={{ transform: "rotate(45deg) translate(25%, -25%)" }}
                                aria-label={`${pendingApprovalByPartyId[party.id]} pending approval`}
                              >
                                <span style={{ transform: "rotate(-45deg)" }}>{pendingApprovalByPartyId[party.id]}</span>
                              </span>
                            )}
                          </div>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="pl-master-list-row-name cursor-default">
                                {party.name}
                              </span>
                            </TooltipTrigger>
                            {/* Narrow list column: tooltip niche — amount column se overlap kam */}
                            <TooltipContent side="bottom" align="start">
                              <p className="font-medium">{party.name}</p>
                              {(pendingApprovalByPartyId[party.id] ?? 0) > 0 && (
                                <p className="text-xs text-muted-foreground">{pendingApprovalByPartyId[party.id]} pending approval</p>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        </div>

                        {/* दायाँ भाग: ब्यालेन्स वा Overdue को लागि voucher count */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              className={cn(
                                "pl-master-list-row-amount ml-2",
                                topPartyId && party.id === topPartyId && overdueVoucherCount != null
                                  ? "text-muted-foreground"
                                  : party.balance >= 0 ? "text-green-600" : "text-red-600",
                                isSelected && !(topPartyId && party.id === topPartyId) && (party.balance >= 0 ? "text-green-700" : "text-red-700")
                              )}
                            >
                              {topPartyId && party.id === topPartyId && overdueVoucherCount != null
                                ? `${overdueVoucherCount} voucher${overdueVoucherCount === 1 ? "" : "s"}`
                                : formatCurrency(party.balance, { showDrCr: true })}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="left">
                            <p className="font-medium">
                              {topPartyId && party.id === topPartyId && overdueVoucherCount != null
                                ? `${overdueVoucherCount} overdue voucher${overdueVoucherCount === 1 ? "" : "s"}`
                                : formatCurrency(party.balance, { showDrCr: true })}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                );
                const cardClassName = cn(
                  "min-w-0 max-w-full overflow-hidden p-1.5 cursor-pointer border rounded-md transition-all duration-200",
                  isSelected
                    ? "border-primary bg-secondary shadow-sm"
                    : "border-gray-300 dark:border-gray-600 border-[1.5px] hover:border-primary/40 hover:bg-muted/30"
                );
                return (
                  <motion.li
                    key={party.id}
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
                      <Card className={cardClassName} onClick={() => onSelectParty(party)}>
                        {cardContent}
                      </Card>
                    )}
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        </ScrollArea>
        <EntityListQuickFilterBar active={quickFilter} onChange={setQuickFilter} />
      </div>
    </TooltipProvider>
  );
});

PartyList.displayName = 'PartyList';
