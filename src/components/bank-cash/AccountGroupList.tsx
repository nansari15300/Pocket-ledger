
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
}: {
  groups: AccountGroup[];
  searchTerm: string;
  selectedGroup: AccountGroup | null;
  onSelectGroup: (group: AccountGroup) => void;
  pendingApprovalByGroupId?: Record<string, number>;
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
    <div className="flex flex-col h-full min-h-0 rounded-b-lg border-x border-b bg-background">
      <ScrollArea className="flex-1 min-h-0">
        <ul className="p-2 space-y-1">
          <AnimatePresence mode="popLayout">
            {filteredAndSortedGroups.map((group) => {
              const isSelected = selectedGroup?.id === group.id;
              const hasSpecial = (group as any).hasSpecial;
              const isBalanceMasked = typeof group.balance !== 'number';

              return (
                <motion.li 
                  key={group.id}
                  layout
<<<<<<< HEAD
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
=======
                  initial={false}
                  exit={{ transition: { duration: 0 } }}
>>>>>>> 6a1ec26 (Animation Fixed)
                  transition={{ duration: rowAnimationDuration, ease: "easeInOut" }}
                >
                  <Card
                    className={cn(
                      "p-1 cursor-pointer border",
                      isSelected
                        ? "border-primary bg-secondary"
                        : "hover:border-primary/50"
                    )}
                    onClick={() => onSelectGroup(group)}
                  >
                    <div className="flex items-center justify-between w-full gap-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
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
                          <TooltipTrigger className="font-semibold whitespace-nowrap truncate max-w-[150px] text-left p-0 h-auto bg-transparent hover:bg-transparent border-none shadow-none">
                            {group.name}
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
                          "font-semibold text-sm whitespace-nowrap flex-shrink-0 ml-2",
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
                  </Card>
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

    