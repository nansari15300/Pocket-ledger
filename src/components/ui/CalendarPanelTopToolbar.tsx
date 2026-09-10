"use client";

import * as React from "react";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateConverterDialog } from "@/components/layout/DateConverterDialog";
import { useCompany } from "@/hooks/useCompany";
import { cn } from "@/lib/utils";

type CalendarPanelTopToolbarProps = {
  rangePresetSlot?: React.ReactNode;
  className?: string;
  /** false = Date Converter dialog ke andar nested calendar (recursive button avoid). */
  showDateConverterButton?: boolean;
};

export function useCalendarPanelTopToolbarVisible(
  rangePresetSlot?: React.ReactNode,
  showDateConverterButton = true
) {
  const { company } = useCompany();
  const isNepalCompany = !company?.country || company.country === "Nepal";
  return !!rangePresetSlot || (showDateConverterButton && isNepalCompany);
}

/** BS/AD calendar popover ke upar — range shortcuts + Nepal-only Date Converter. */
export function CalendarPanelTopToolbar({
  rangePresetSlot,
  className,
  showDateConverterButton = true,
}: CalendarPanelTopToolbarProps) {
  const { company } = useCompany();
  const isNepalCompany = !company?.country || company.country === "Nepal";
  const [dateConverterOpen, setDateConverterOpen] = React.useState(false);
  const showConverter = showDateConverterButton && isNepalCompany;

  if (!rangePresetSlot && !showConverter) return null;

  return (
    <>
      <DateConverterDialog open={dateConverterOpen} onOpenChange={setDateConverterOpen} />
      <div
        className={cn(
          "w-full shrink-0 border-b border-border pb-2 mb-2 -mt-0.5",
          "sticky top-0 z-10 -mx-1 px-1 bg-white dark:bg-card shadow-[0_4px_6px_-4px_rgba(0,0,0,0.12)]",
          className
        )}
      >
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {rangePresetSlot ? (
            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-center gap-1 sm:justify-start sm:gap-1.5">
              {rangePresetSlot}
            </div>
          ) : null}
          {showConverter ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(
                "h-7 shrink-0 px-2 text-xs touch-manipulation",
                rangePresetSlot ? "ml-auto" : "mx-auto"
              )}
              onClick={() => setDateConverterOpen(true)}
            >
              <CalendarDays className="mr-1 h-3.5 w-3.5 shrink-0" />
              Date Converter
            </Button>
          ) : null}
        </div>
      </div>
    </>
  );
}
