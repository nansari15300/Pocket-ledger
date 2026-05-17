
"use client";

import type { Tax } from "@/components/tax/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Receipt } from "lucide-react";
import { useDate } from "@/hooks/useDate";
import { useAnimationSettings } from "@/hooks/useAnimationSettings";
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { MasterListRow } from "@/components/ui/master-list-row";
import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  EntityListQuickFilterBar,
  type EntityListQuickFilter,
} from "@/components/entity/EntityListQuickFilterBar";
import { filterAndSortMasterEntityListRows } from "@/lib/filterMasterEntityListRows"
import { masterListShellCn, masterListRowUnselectedCn } from "@/lib/masterListChrome";
import { EntityFileAttachmentHover } from "@/components/entity/EntityFileAttachmentHover";
import { trimEntityFileUrlForPreview } from "@/lib/trimEntityFileUrlForPreview";
import { ResolvedEntityAvatar } from "@/components/entity/ResolvedEntityAvatar";

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
        <div className={masterListShellCn} data-theme-list="account-list">
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
      <div className={masterListShellCn} data-theme-list="account-list">
        <ScrollArea listChrome className="min-h-0 min-w-0 flex-1">
          <ul className="pl-master-list-ul">
          <AnimatePresence mode="popLayout">
            {filteredAndSortedTaxes.map(tax => {
                const isSelected = selectedTax?.id === tax.id;
                const href = getItemHref?.(tax);
                const attachmentPreviewUrl = trimEntityFileUrlForPreview(tax.fileUrl);
                const cardClassName = masterListRowUnselectedCn(isSelected);
                const cardContent = (
                        <div className="pl-master-list-row">
                            <div className="pl-master-list-row-leading">
                            <div className="relative flex-shrink-0">
                              <EntityFileAttachmentHover fileUrl={attachmentPreviewUrl} triggerClassName="inline-flex shrink-0 rounded-md">
                                <ResolvedEntityAvatar
                                  className="h-8 w-8 text-sm bg-muted text-muted-foreground"
                                  src={attachmentPreviewUrl ?? undefined}
                                  alt={tax.name}
                                  fallbackSlot={<Receipt className="h-4 w-4" />}
                                />
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
                          {/* asChild hata — motion layout + span ref merge par Radix setRef loop */}
                          <TooltipTrigger
                            type="button"
                            onPointerDown={(e) => e.stopPropagation()}
                            className="pl-master-list-row-name cursor-default block w-full truncate border-0 bg-transparent p-0 text-left shadow-none"
                          >
                            {tax.name}
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
                        <TooltipTrigger
                          type="button"
                          onPointerDown={(e) => e.stopPropagation()}
                          className={cn(
                            "pl-master-list-row-amount ml-2 border-0 bg-transparent p-0 text-left shadow-none",
                            tax.balance >= 0 ? "text-green-600" : "text-red-600",
                            isSelected && (tax.balance >= 0 ? "text-green-700" : "text-red-700")
                          )}
                        >
                          {formatCurrency(tax.balance, { showDrCr: true })}
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
                        <MasterListRow selected={isSelected} className={cardClassName}>{cardContent}</MasterListRow>
                      </Link>
                    ) : (
                      <MasterListRow selected={isSelected} className={cardClassName} onClick={() => onSelectTax(tax)}>
                        {cardContent}
                      </MasterListRow>
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
