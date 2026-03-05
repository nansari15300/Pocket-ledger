
"use client";

import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Item } from "@/components/items/types";
import { useDate } from "@/hooks/useDate";
import { useAnimationSettings } from "@/hooks/useAnimationSettings";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Package } from "lucide-react";
import type { StockView } from "./ItemDetails";
import React, { useMemo } from "react";
import { Tooltip, TooltipTrigger, TooltipContent } from "../ui/tooltip";
import { motion, AnimatePresence } from "framer-motion";

interface ItemListProps {
  items: Item[];
  onSelectItem: (item: Item) => void;
  selectedItem: Item | null;
  searchTerm: string;
  stockView?: StockView;
  itemDisplayUnits: Record<string, string>;
  /** Pending approval count per item id (only when approve notifications on list). */
  pendingApprovalByItemId?: Record<string, number>;
}

const getInitials = (name: string) => {
  if (!name) return "NA";
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("");
};

export function ItemList({
  items,
  onSelectItem,
  selectedItem,
  searchTerm,
  stockView = 'amount',
  itemDisplayUnits,
  pendingApprovalByItemId = {},
}: ItemListProps) {
  const { formatCurrency } = useDate();
  const { settings: animationSettings } = useAnimationSettings();
  const isRowAnimationEnabled = animationSettings.rows.enabled === true;
  const rowAnimationDuration = isRowAnimationEnabled ? animationSettings.rows.duration : 0;
  
  const filteredAndSortedItems = useMemo(() => {
      return items
        .filter((item) =>
          item.name && item.name.toLowerCase().includes(searchTerm.toLowerCase())
        )
        .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
  }, [items, searchTerm]);


  if (filteredAndSortedItems.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        No items found.
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-2 p-2">
        <AnimatePresence>
          {filteredAndSortedItems.map((item) => {
            const isSelected = selectedItem?.id === item.id;
            
            const conversions = (item.unitConversions || []) as any[];
            const smallestUnit = conversions.length > 0 ? conversions[conversions.length - 1].toUnit : ((item as any).openingBalanceUnit || '');
            const displayUnit = itemDisplayUnits[item.id] || smallestUnit || '';
            
            const getSmallestUnitFactor = (unit: string): number => {
              if (!unit || conversions.length === 0) return 1;
              if (unit === smallestUnit) return 1;
              
              let factor = 1;
              let currentUnit = unit;
              
              for (let i=0; i < 10; i++) { // safety break
                  const conv = conversions.find(c => c.fromUnit === currentUnit);
                  if (!conv) return 0;
                  factor *= Number(conv.conversionFactor) || 1;
                  currentUnit = conv.toUnit;
                  if (currentUnit === smallestUnit) break;
              }
              return factor;
            };
            
            const displayUnitFactor = getSmallestUnitFactor(displayUnit);
            const displayQty = displayUnitFactor > 0 ? (item.stockQty || 0) / displayUnitFactor : 0;
            
            const displayValue = stockView === 'amount' ? item.balance : displayQty;
            const isPositive = (displayValue || 0) >= 0;
            const formattedDisplayValue = stockView === 'amount'
                ? formatCurrency(displayValue, { showDrCr: true })
                : `${displayValue.toFixed(2)}`;

            return (
              <motion.li
                key={item.id}
                layout
                initial={false}
                exit={{ transition: { duration: 0 } }}
                transition={{ 
                  duration: rowAnimationDuration,
                  ease: "easeInOut"
                }}
              >
                <Card
                  className={cn(
                    "p-1 cursor-pointer border",
                    isSelected
                      ? "border-primary bg-secondary"
                      : "hover:border-primary/50"
                  )}
                  onClick={() => onSelectItem(item)}
                >
                  <div className="flex items-center justify-between w-full gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="relative flex-shrink-0">
                        <Avatar className="h-8 w-8 text-sm">
                          <AvatarImage src={item.fileUrls?.[0]} />
                          <AvatarFallback><Package/></AvatarFallback>
                        </Avatar>
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
                        <TooltipTrigger className="font-medium whitespace-nowrap truncate max-w-[150px] text-left p-0 h-auto bg-transparent hover:bg-transparent border-none shadow-none">
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
                        "text-sm font-semibold flex items-baseline gap-1 whitespace-nowrap flex-shrink-0 ml-2",
                        isPositive ? "text-green-600" : "text-red-600",
                        isSelected && (isPositive ? "text-green-800" : "text-red-800")
                      )}
                    >
                      {formattedDisplayValue}
                      {stockView === 'qty' && <span className="text-xs">{displayUnit}</span>}
                    </div>
                  </div>
                </Card>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </div>
    </ScrollArea>
  );
};
