"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;


function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <div
      className={cn(
        "p-3 border rounded-lg shadow-md bg-card text-card-foreground w-full",
        className
      )}
    >
      <DayPicker
        showOutsideDays={showOutsideDays}
        captionLayout="dropdown"
        navLayout="around"
        fromYear={1950}
        toYear={new Date().getFullYear() + 5}
        className="p-0"
        classNames={{
          months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
          month: "grid grid-cols-[auto_1fr_auto] grid-rows-[auto_1fr] gap-2 w-full",
          month_caption: "flex items-center justify-center min-w-0",
          caption_label: "hidden",
          dropdowns: "flex gap-2 justify-center flex-wrap",
          month_grid: "col-span-3 w-full",
          weekdays: "flex",
          weekday:
            "text-muted-foreground w-9 font-normal text-xs h-7 flex items-center justify-center",
          weeks: "flex flex-col gap-0.5",
          week: "flex w-full",
          day: cn(
            buttonVariants({ variant: "ghost" }),
            "h-9 w-9 p-0 font-normal rounded-full m-auto aria-selected:opacity-100"
          ),
          day_button: "h-9 w-9 w-full rounded-full flex items-center justify-center",
          selected: "day_selected",
          today: "is-today",
          outside:
            "text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
          disabled: "text-muted-foreground opacity-50",
          range_middle:
            "aria-selected:bg-accent/50 aria-selected:text-accent-foreground",
          hidden: "invisible",
          button_previous: cn(
            buttonVariants({ variant: "outline" }),
            "h-7 w-7 shrink-0 p-0 opacity-50 hover:opacity-100"
          ),
          button_next: cn(
            buttonVariants({ variant: "outline" }),
            "h-7 w-7 shrink-0 p-0 opacity-50 hover:opacity-100"
          ),
          chevron: "h-4 w-4",
          nav: "flex items-center gap-1 shrink-0",
          caption: "flex justify-between items-center pt-0 relative px-1 mb-2",
          caption_dropdowns: "flex gap-2 flex-1 justify-center min-w-0",
          table: "w-full border-collapse space-y-1",
          head_row: "flex",
          head_cell:
            "text-muted-foreground w-9 font-normal text-xs h-7 flex items-center justify-center",
          row: "flex w-full mt-2",
          cell: "h-9 w-9 text-center text-sm p-0 relative focus-within:relative focus-within:z-20",
          day_range_end: "day-range-end",
          day_selected: "day_selected",
          day_today: "is-today",
          day_outside:
            "day-outside text-muted-foreground opacity-50",
          day_disabled: "text-muted-foreground opacity-50",
          day_range_middle:
            "aria-selected:bg-accent/50 aria-selected:text-accent-foreground",
          day_hidden: "invisible",
          vhidden: "hidden",
          ...classNames,
        }}
        components={{
          Chevron: (p: { orientation?: "left" | "right"; className?: string; disabled?: boolean }) =>
            p.orientation === "left" ? <ChevronLeft className={cn("h-4 w-4", p.className)} /> : <ChevronRight className={cn("h-4 w-4", p.className)} />,
          IconLeft: (p: React.SVGProps<SVGSVGElement>) => <ChevronLeft className="h-4 w-4" {...p} />,
          IconRight: (p: React.SVGProps<SVGSVGElement>) => <ChevronRight className="h-4 w-4" {...p} />,
        } as any}
        {...props}
      />
    </div>
  );
}
Calendar.displayName = "Calendar";

export { Calendar };

