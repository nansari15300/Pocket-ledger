
"use client";

import { cn } from "@/lib/utils";
import { Users } from "lucide-react";
import type { TaxGroup } from "@/components/tax/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDate } from "@/hooks/useDate";
import { useAnimationSettings } from "@/hooks/useAnimationSettings";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "../ui/tooltip";
import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { isSystemParentGroup } from "@/lib/system-groups";

export function TaxGroupList({
  groups,
  searchTerm,
  selectedGroup,
  onSelectGroup,
  pendingApprovalByGroupId = {},
}: {
  groups: TaxGroup[];
  searchTerm: string;
  selectedGroup: TaxGroup | null;
  onSelectGroup: (group: TaxGroup) => void;
  pendingApprovalByGroupId?: Record<string, number>;
}) {
  const { formatCurrency } = useDate();
  const { settings: animationSettings } = useAnimationSettings();
  const isRowAnimationEnabled = animationSettings?.rows?.enabled === true;
  const rowAnimationDuration = isRowAnimationEnabled ? (animationSettings?.rows?.duration ?? 2.5) : 0;

  const filteredAndSortedGroups = useMemo(() => {
    return groups
      .filter((group) => {
        // Filter out report-only + system parent groups (e.g. Duties & Taxes)
        const isReportOnly = (group as any).isReportOnly === true;
        const isSystemParent =
          (group as any).isSystemReserved === true ||
          isSystemParentGroup("tax_groups", (group as any).id);
        if (isReportOnly || isSystemParent) return false;
        return group.name && group.name.toLowerCase().includes(searchTerm.toLowerCase());
      })
      .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
  }, [groups, searchTerm]);


  return (
    <TooltipProvider delayDuration={200}>
    <div className="flex flex-col h-full min-h-0 w-full rounded-b-lg border-t-0 bg-background">
      <ScrollArea className="flex-1 min-h-0">
        <ul className="p-2 space-y-1">
          <AnimatePresence mode="popLayout">
            {filteredAndSortedGroups.map((group) => {
              const isSelected = selectedGroup?.id === group.id;
              return (
                <motion.li 
                  key={group.id}
                  layout
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: rowAnimationDuration, type: "spring", stiffness: 100, damping: 20 }}
                >
                  <Card
                      className={cn(
                        "w-full p-1.5 cursor-pointer border rounded-lg transition-colors duration-200",
                        isSelected
                          ? "border-primary bg-secondary shadow-sm"
                          : "border-gray-300 dark:border-gray-600 hover:border-primary/40 bg-card hover:bg-muted/30"
                      )}
                      onClick={() => onSelectGroup(group)}
                    >
                      <div className="flex items-center justify-between w-full gap-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div className="relative flex-shrink-0">
                            <div className="h-8 w-8 flex items-center justify-center bg-muted rounded-md text-muted-foreground">
                              <Users className="h-5 w-5" />
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
                              <span className="font-semibold text-sm whitespace-nowrap truncate min-w-0 cursor-default">
                                {group.name}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{group.name}</p>
                              {(pendingApprovalByGroupId[group.id] ?? 0) > 0 && (
                                <p className="text-xs text-muted-foreground">{pendingApprovalByGroupId[group.id]} pending approval</p>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <p
                              className={cn(
                                "font-bold text-xs whitespace-nowrap flex-shrink-0 ml-1 px-1 rounded",
                                group.balance >= 0 ? "text-green-600" : "text-red-600"
                              )}
                            >
                              {formatCurrency(group.balance, { showDrCr: true })}
                            </p>
                          </TooltipTrigger>
                          <TooltipContent side="left">
                            <p className="font-medium">{formatCurrency(group.balance, { showDrCr: true })}</p>
                          </TooltipContent>
                        </Tooltip>
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
    </TooltipProvider>
  );
}
