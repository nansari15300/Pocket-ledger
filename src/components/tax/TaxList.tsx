
"use client";

import type { Tax } from "@/components/tax/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Receipt } from "lucide-react";
import { useDate } from "@/hooks/useDate";
import { useAnimationSettings } from "@/hooks/useAnimationSettings";
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { Card } from "@/components/ui/card";
import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  EntityListQuickFilterBar,
  type EntityListQuickFilter,
} from "@/components/entity/EntityListQuickFilterBar";
import { filterAndSortMasterEntityListRows } from "@/lib/filterMasterEntityListRows";
import { EntityFileAttachmentHover } from "@/components/entity/EntityFileAttachmentHover";
import { trimEntityFileUrlForPreview } from "@/lib/trimEntityFileUrlForPreview";

export function TaxList({ 
    taxes, 
    selectedTax, 
    onSelectTax, 
    searchTerm,
    pendingApprovalByTaxId = {},
    getItemHref,
}: { 
    taxes: Tax[], 
    selectedTax: Tax | null,
    onSelectTax: (tax: Tax) => void,
    searchTerm: string,
    /** Pending approval count per tax id (only when approve notifications on list). */
    pendingApprovalByTaxId?: Record<string, number>;
    /** When provided, use Link for navigation (mobile/Capacitor) – static export ke liye query params */
    getItemHref?: (tax: Tax) => string | undefined;
}) {
  const { formatCurrency } = useDate();
  const { settings: animationSettings } = useAnimationSettings();
  const isRowAnimationEnabled = animationSettings?.rows?.enabled === true;
  const rowAnimationDuration = isRowAnimationEnabled ? (animationSettings?.rows?.duration ?? 2.5) : 0;
  /** Party account list — `EntityListQuickFilterBar` niche (Default / Dr / By Name…) */
  const [quickFilter, setQuickFilter] = useState<EntityListQuickFilter>("default");

  const filteredAndSortedTaxes = useMemo(() => {
    return filterAndSortMasterEntityListRows(taxes, searchTerm, quickFilter);
  }, [taxes, searchTerm, quickFilter]);

  if (filteredAndSortedTaxes.length === 0) {
    return (
      <TooltipProvider delayDuration={200}>
        <div className="flex h-full min-h-0 min-w-0 flex-col rounded-b-lg border-t-0 bg-background" data-theme-list="account-list">
          <div className="flex flex-1 min-h-0 items-center justify-center p-8 text-center text-sm text-muted-foreground">
            No taxes found.
          </div>
          <EntityListQuickFilterBar active={quickFilter} onChange={setQuickFilter} />
        </div>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-full min-h-0 min-w-0 flex-col rounded-b-lg border-t-0 bg-background" data-theme-list="account-list">
        <ScrollArea className="min-h-0 min-w-0 flex-1">
          <ul className="p-2 space-y-1">
          <AnimatePresence mode="popLayout">
            {filteredAndSortedTaxes.map(tax => {
                const isSelected = selectedTax?.id === tax.id;
                const href = getItemHref?.(tax);
                const attachmentPreviewUrl = trimEntityFileUrlForPreview(tax.fileUrl);
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
                              <EntityFileAttachmentHover fileUrl={attachmentPreviewUrl} triggerClassName="inline-flex shrink-0 rounded-md">
                                <Avatar className="h-8 w-8 text-sm bg-muted text-muted-foreground">
                                  <AvatarImage src={attachmentPreviewUrl ?? undefined} alt={tax.name} />
                                  <AvatarFallback>
                                    <Receipt className="h-4 w-4" />
                                  </AvatarFallback>
                                </Avatar>
                              </EntityFileAttachmentHover>
                              {(pendingApprovalByTaxId[tax.id] ?? 0) > 0 && (
                                <span
                                  className="absolute top-0 right-0 w-4 h-4 flex items-center justify-center bg-pink-500 text-white text-[10px] font-bold origin-center"
                                  style={{ transform: "rotate(45deg) translate(25%, -25%)" }}
                                  aria-label={`${pendingApprovalByTaxId[tax.id]} pending approval`}
                                >
                                  <span style={{ transform: "rotate(-45deg)" }}>{pendingApprovalByTaxId[tax.id]}</span>
                                </span>
                              )}
                            </div>
                            <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="pl-master-list-row-name cursor-default">
                              {tax.name}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="right">
                            <p className="font-medium">{tax.name}</p>
                            {(pendingApprovalByTaxId[tax.id] ?? 0) > 0 && (
                              <p className="text-xs text-muted-foreground">{pendingApprovalByTaxId[tax.id]} pending approval</p>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      </div>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            className={cn(
                              "pl-master-list-row-amount ml-2",
                              tax.balance >= 0 ? "text-green-600" : "text-red-600",
                              isSelected && (tax.balance >= 0 ? "text-green-700" : "text-red-700")
                            )}
                          >
                            {formatCurrency(tax.balance, { showDrCr: true })}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="left">
                          <p className="font-medium">{formatCurrency(tax.balance, { showDrCr: true })}</p>
                        </TooltipContent>
                      </Tooltip>
                        </div>
                );
                return (
                  <motion.li
                    key={tax.id}
                    layout
                    initial={false}
                    exit={{ transition: { duration: 0 } }}
                    transition={{ duration: rowAnimationDuration, ease: "easeInOut" }}
                  >
                    {href ? (
                      // Master list navigation: per-row auto-prefetch off rakho to avoid repeat background bursts on revisit.
                      <Link prefetch={false} href={href} className="block min-w-0 max-w-full overflow-hidden">
                        <Card className={cardClassName}>{cardContent}</Card>
                      </Link>
                    ) : (
                      <Card className={cardClassName} onClick={() => onSelectTax(tax)}>
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
};
