
"use client";

import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MasterListRow } from "@/components/ui/master-list-row";
import { Item } from "@/components/items/types";
import { useDate } from "@/hooks/useDate";
import { useMasterListRowMotion } from "@/hooks/useMasterListRowMotion";
import { Package } from "lucide-react";
import type { StockView } from "./ItemDetails";
import React, { useMemo, useState } from "react";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "../ui/tooltip";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  EntityListQuickFilterBar,
  type EntityListQuickFilter,
} from "@/components/entity/EntityListQuickFilterBar";
import { filterAndSortMasterEntityListRows } from "@/lib/filterMasterEntityListRows"
import { masterListShellCn, masterListRowUnselectedCn } from "@/lib/masterListChrome";
import { masterListNameTriggerCn } from "@/lib/listSelectionChrome";
import { EntityFileAttachmentHover } from "@/components/entity/EntityFileAttachmentHover";
import { trimEntityFileUrlForPreview } from "@/lib/trimEntityFileUrlForPreview";
import { ResolvedEntityAvatar } from "@/components/entity/ResolvedEntityAvatar";

interface ItemListProps {
  items: Item[];
  onSelectItem: (item: Item) => void;
  selectedItem: Item | null;
  searchTerm: string;
  stockView?: StockView;
  itemDisplayUnits: Record<string, string>;
  /** Pending approval count per item id (only when approve notifications on list). */
  pendingApprovalByItemId?: Record<string, number>;
  /** When provided, use Link for navigation (mobile/Capacitor) – static export ke liye query params */
  getItemHref?: (item: Item) => string | undefined;
  quickFilter?: EntityListQuickFilter;
  onQuickFilterChange?: (next: EntityListQuickFilter) => void;
  hideQuickFilterBar?: boolean;
}

/** Qty/amount row — footer Dr/Cr/settled `balance` field jaisa hi number (Party list semantically). */
function getItemRowDisplayMetrics(
  item: Item,
  stockView: StockView,
  itemDisplayUnits: Record<string, string>,
  formatCurrency: (v: number, o?: { showDrCr?: boolean }) => React.ReactNode
) {
  const conversions = (item.unitConversions || []) as any[];
  const smallestUnit =
    conversions.length > 0 ? conversions[conversions.length - 1].toUnit : ((item as any).openingBalanceUnit || "");
  const displayUnit = itemDisplayUnits[item.id] || smallestUnit || "";

  const getSmallestUnitFactor = (unit: string): number => {
    if (!unit || conversions.length === 0) return 1;
    if (unit === smallestUnit) return 1;
    let factor = 1;
    let currentUnit = unit;
    for (let i = 0; i < 10; i++) {
      const conv = conversions.find((c) => c.fromUnit === currentUnit);
      if (!conv) return 0;
      factor *= Number(conv.conversionFactor) || 1;
      currentUnit = conv.toUnit;
      if (currentUnit === smallestUnit) break;
    }
    return factor;
  };

  const displayUnitFactor = getSmallestUnitFactor(displayUnit);
  const displayQty = displayUnitFactor > 0 ? (item.stockQty || 0) / displayUnitFactor : 0;
  const displayValue = stockView === "amount" ? Number(item.balance) || 0 : displayQty;
  const isPositive = displayValue >= 0;
  const formattedDisplayValue =
    stockView === "amount" ? formatCurrency(displayValue, { showDrCr: true }) : `${displayValue.toFixed(2)}`;

  return { displayValue, displayUnit, formattedDisplayValue, isPositive };
}

type ItemListFilterRow = {
  item: Item;
  name?: string;
  balance: number;
  openingBalanceDate?: unknown;
  metrics: ReturnType<typeof getItemRowDisplayMetrics>;
};

export function ItemList({
  items,
  onSelectItem,
  selectedItem,
  searchTerm,
  stockView = "amount",
  itemDisplayUnits,
  pendingApprovalByItemId = {},
  getItemHref,
  quickFilter: quickFilterProp,
  onQuickFilterChange,
  hideQuickFilterBar = false,
}: ItemListProps) {
  const { formatCurrency } = useDate();
  const { animatePresenceMode, rowMotionProps, markListScrolling } = useMasterListRowMotion();
  const [internalQuickFilter, setInternalQuickFilter] = useState<EntityListQuickFilter>("default");
  const quickFilter = quickFilterProp ?? internalQuickFilter;
  const setQuickFilter = onQuickFilterChange ?? setInternalQuickFilter;
  const quickFilterFooter = !hideQuickFilterBar ? (
    <EntityListQuickFilterBar active={quickFilter} onChange={setQuickFilter} />
  ) : null;

  const enrichedRows: ItemListFilterRow[] = useMemo(() => {
    return (items || []).map((item) => {
      const metrics = getItemRowDisplayMetrics(item, stockView, itemDisplayUnits, formatCurrency);
      return {
        item,
        name: item.name,
        balance: metrics.displayValue,
        openingBalanceDate: item.openingBalanceDate,
        metrics,
      };
    });
  }, [items, stockView, itemDisplayUnits, formatCurrency]);

  const filteredAndSortedRows = useMemo(() => {
    return filterAndSortMasterEntityListRows(enrichedRows, searchTerm, quickFilter) as ItemListFilterRow[];
  }, [enrichedRows, searchTerm, quickFilter]);

  if (filteredAndSortedRows.length === 0) {
    return (
      <TooltipProvider delayDuration={200}>
        <div className={masterListShellCn} data-theme-list="account-list">
          <div className="flex flex-1 min-h-[120px] items-center justify-center p-4 text-sm text-muted-foreground">
            No items found.
          </div>
          {quickFilterFooter}
        </div>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className={masterListShellCn} data-theme-list="account-list">
        <ScrollArea
          listChrome
          className="min-h-0 flex-1 min-w-0"
          onViewportScroll={markListScrolling}
          onViewportTouchMove={markListScrolling}
        >
          <div className="pl-master-list-ul">
            <AnimatePresence mode={animatePresenceMode}>
              {filteredAndSortedRows.map(({ item, metrics }) => {
                const isSelected = selectedItem?.id === item.id;
                const { formattedDisplayValue, isPositive, displayUnit } = metrics;

                const href = getItemHref?.(item);
                const attachmentPreviewUrl = trimEntityFileUrlForPreview(item.fileUrls?.[0]);
                const cardClassName = masterListRowUnselectedCn(isSelected);
                const cardContent = (
                  <div className="pl-master-list-row">
                    <div className="pl-master-list-row-leading">
                      <div className="relative flex-shrink-0">
                        {/* `fileUrls[0]` = master photo — hover portal list row pe pehle band tha */}
                        <EntityFileAttachmentHover
                          fileUrl={attachmentPreviewUrl}
                          triggerClassName="inline-flex shrink-0 rounded-md"
                        >
                          <ResolvedEntityAvatar
                            className="h-8 w-8 text-sm"
                            src={attachmentPreviewUrl ?? undefined}
                            alt={item.name}
                            fallbackSlot={<Package />}
                          />
                        </EntityFileAttachmentHover>
                        {(pendingApprovalByItemId[item.id] ?? 0) > 0 && (
                          <span
                            className="absolute top-0 right-0 w-4 h-4 flex items-center justify-center bg-pink-500 text-white text-[10px] font-bold origin-center"
                            style={{ transform: "rotate(45deg) translate(25%, -25%)" }}
                            aria-label={`${pendingApprovalByItemId[item.id]} pending approval`}
                          >
                            <span style={{ transform: "rotate(-45deg)" }}>{pendingApprovalByItemId[item.id]}</span>
                          </span>
                        )}
                      </div>
                      <Tooltip>
                        {/* asChild hata — motion layout + span ref merge par Radix/ScrollArea setRef loop */}
                        <TooltipTrigger
                          type="button"
                          data-pl-list-name=""
                          onPointerDown={(e) => e.stopPropagation()}
                          className={masterListNameTriggerCn}
                        >
                          {item.name}
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{item.name}</p>
                          {(pendingApprovalByItemId[item.id] ?? 0) > 0 && (
                            <p className="text-xs text-muted-foreground">{pendingApprovalByItemId[item.id]} pending approval</p>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <div
                      className={cn(
                        "pl-master-list-row-amount flex items-baseline gap-1 font-semibold ml-2",
                        isPositive ? "text-green-600" : "text-red-600",
                        isSelected && (isPositive ? "text-green-800" : "text-red-800")
                      )}
                    >
                      {formattedDisplayValue}
                      {stockView === "qty" && <span className="text-xs">{displayUnit}</span>}
                    </div>
                  </div>
                );
                return (
                  <motion.li key={item.id} {...rowMotionProps}>
                    {href ? (
                      // Master list navigation: per-row auto-prefetch off rakho to avoid repeat background bursts on revisit.
                      <Link prefetch={false} href={href} className="block min-w-0 max-w-full overflow-hidden">
                        <MasterListRow selected={isSelected} className={cardClassName}>{cardContent}</MasterListRow>
                      </Link>
                    ) : (
                      <MasterListRow selected={isSelected} className={cardClassName} onClick={() => onSelectItem(item)}>
                        {cardContent}
                      </MasterListRow>
                    )}
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </div>
        </ScrollArea>
        {quickFilterFooter}
      </div>
    </TooltipProvider>
  );
}
