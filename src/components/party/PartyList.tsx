
"use client";

import type { Party } from "@/components/party/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useDate } from "@/hooks/useDate";
import { useAnimationSettings } from "@/hooks/useAnimationSettings";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "../ui/tooltip";
import React, { useMemo } from 'react';
import { motion, AnimatePresence } from "framer-motion";

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
}) => {
  const { formatCurrency } = useDate();
  const { settings: animationSettings } = useAnimationSettings();
  const isRowAnimationEnabled = animationSettings?.rows?.enabled === true;
  const rowAnimationDuration = isRowAnimationEnabled ? (animationSettings?.rows?.duration ?? 2.5) : 0;

  const filteredAndSortedParties = useMemo(() => {
    const list = parties || [];
    const searchLower = searchTerm.toLowerCase();
    const filterFn = (party: Party) => {
      if (!party.name) return false;
      const nameLower = party.name.toLowerCase();
      const matchesSearch = !searchLower || nameLower.includes(searchLower);
      const isSystemAccount = (party as any).isSystemAccount === true;
      return matchesSearch && !isSystemAccount;
    };
    const pinned = topPartyId ? list.filter((p) => p.id === topPartyId && filterFn(p)) : [];
    const rest = topPartyId ? list.filter((p) => p.id !== topPartyId) : list;
    const filteredRest = rest.filter(filterFn).sort((a, b) => Math.abs(b.balance || 0) - Math.abs(a.balance || 0));
    return [...pinned, ...filteredRest];
  }, [parties, searchTerm, topPartyId]);

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
      <div className="flex flex-col h-full min-h-0 rounded-b-lg border-t-0 bg-background" data-theme-list="account-list">
        <ScrollArea className="flex-1 min-h-0">
          <ul className="p-2 space-y-1">
            <AnimatePresence mode="popLayout">
              {filteredAndSortedParties.map((party) => {
                const isSelected = selectedParty?.id === party.id;

                return (
                  <motion.li
                    key={party.id}
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
                      onClick={() => onSelectParty(party)}
                    >
                      <div className="flex items-center justify-between w-full gap-2 min-w-0">
                        {/* बायाँ भाग: avatar र नाम */}
                        <div className="flex items-center gap-2 flex-1 min-w-0 overflow-hidden">
                          <div className="relative flex-shrink-0">
                            <Avatar className="h-8 w-8 text-xs border">
                              <AvatarImage src={party.fileUrl} alt={party.name} />
                              <AvatarFallback className="bg-muted text-muted-foreground font-bold">
                                {getInitials(party.name)}
                              </AvatarFallback>
                            </Avatar>
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
                              <span className="text-sm font-medium whitespace-nowrap truncate min-w-0 text-left cursor-default">
                                {party.name}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="right">
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
                                "text-sm font-medium whitespace-nowrap flex-shrink-0 ml-2",
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
                    </Card>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        </ScrollArea>
      </div>
    </TooltipProvider>
  );
});

PartyList.displayName = 'PartyList';
