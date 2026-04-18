
"use client";

import { cn } from "@/lib/utils";
import { Users, Crown } from "lucide-react";
import type { AccountGroup } from "@/components/bank-cash/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDate } from "@/hooks/useDate";
import { useAnimationSettings } from "@/hooks/useAnimationSettings";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipTrigger, TooltipContent } from "../ui/tooltip";
import AnimatedNumber from "../ui/AnimatedNumber";
import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from 'next/link';
import { isSystemParentGroup } from "@/lib/system-groups";

export function AccountGroupList({
  groups,
  searchTerm,
  selectedGroup,
  onSelectGroup,
  pendingApprovalByGroupId = {},
  getItemHref,
}: {
  groups: AccountGroup[];
  searchTerm: string;
  selectedGroup: AccountGroup | null;
  onSelectGroup: (group: AccountGroup) => void;
  pendingApprovalByGroupId?: Record<string, number>;
  /** When provided, use Link for navigation (mobile/Capacitor) – static export ke liye query params */
  getItemHref?: (group: AccountGroup) => string | undefined;
}) {
  const { formatCurrency } = useDate();
  const { settings: animationSettings } = useAnimationSettings();
  const isRowAnimationEnabled = animationSettings?.rows?.enabled === true;
  const rowAnimationDuration = isRowAnimationEnabled ? (animationSettings?.rows?.duration ?? 2.5) : 0;

  const filteredAndSortedGroups = useMemo(() => {
    return groups
      .filter((group) => {
        // Filter out report-only + system parent groups
        const isReportOnly = (group as any).isReportOnly === true;
        const isSystemParent =
          (group as any).isSystemReserved === true ||
          isSystemParentGroup("account_groups", (group as any).id);
        if (isReportOnly || isSystemParent) return false;
        return group.name && group.name.toLowerCase().includes(searchTerm.toLowerCase());
      })
      .sort((a, b) => {
        const balanceA = typeof a.balance === 'number' ? a.balance : 0;
        const balanceB = typeof b.balance === 'number' ? b.balance : 0;
        return Math.abs(balanceB) - Math.abs(balanceA);
      });
  }, [groups, searchTerm]);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col rounded-b-lg border-x border-b bg-background">
      <ScrollArea className="min-h-0 min-w-0 flex-1">
        <ul className="p-2 space-y-1">
          <AnimatePresence mode="popLayout">
            {filteredAndSortedGroups.map((group) => {
              const isSelected = selectedGroup?.id === group.id;
              const hasSpecial = (group as any).hasSpecial;
              const isBalanceMasked = typeof group.balance !== 'number';
              const href = getItemHref?.(group);
              const cardClassName = cn(
                "min-w-0 max-w-full overflow-hidden p-1 cursor-pointer border",
                isSelected
                  ? "border-primary bg-secondary"
                  : "hover:border-primary/50"
              );
              const cardContent = (
                    <div className="pl-master-list-row">
                      <div className="pl-master-list-row-leading">
                        <div className="relative flex-shrink-0">
                          <div className="h-8 w-8 flex items-center justify-center bg-muted rounded-md text-muted-foreground">
                             {hasSpecial ? <Crown className="h-5 w-5 text-amber-500" /> : <Users className="h-5 w-5" />}
                          </div>
                          {(pendingApprovalByGroupId[group.id] ?? 0) > 0 && (
                            <span
                              className="absolute top-0 right-0 w-4 h-4 flex items-center justify-center bg-pink-500 text-white text-[10px] font-bold origin-center"
                              style={{ transform: "rotate(45deg) translate(25%, -25%)" }}
                              aria-label={`${pendingApprovalByGroupId[group.id]} pending approval`}
                            >
                              <span style={{ transform: "rotate(-45deg)" }}>{pendingApprovalByGroupId[group.id]}</span>
                            </span>
                          )}
                        </div>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="pl-master-list-row-name-strong cursor-default">{group.name}</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{group.name}</p>
                            {(pendingApprovalByGroupId[group.id] ?? 0) > 0 && (
                              <p className="text-xs text-muted-foreground">{pendingApprovalByGroupId[group.id]} pending approval</p>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <p
                        className={cn(
                          "pl-master-list-row-amount font-semibold ml-2",
                           !isBalanceMasked && (group.balance >= 0 ? "text-green-600" : "text-red-600"),
                          isSelected &&
                            (!isBalanceMasked && (group.balance >= 0
                              ? "text-green-800"
                              : "text-red-800"))
                        )}
                      >
                        {isBalanceMasked ? '*****' : formatCurrency(group.balance, { showDrCr: true })}
                      </p>
                    </div>
              );
              return (
                <motion.li
                  key={group.id}
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
                    <Card className={cardClassName} onClick={() => onSelectGroup(group)}>
                      {cardContent}
                    </Card>
                  )}
                </motion.li>
              );
            })}
          </AnimatePresence>
          {filteredAndSortedGroups.length === 0 && (
            <div className="text-center text-muted-foreground p-8">
              No groups found.
            </div>
          )}
        </ul>
      </ScrollArea>
    </div>
  );
}

    