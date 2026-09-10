"use client";

import * as React from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import BsDatePicker from "@/components/ui/BsDatePicker";
import AdCalendar from "@/components/ui/ad-calendar";
import { cn } from "@/lib/utils";
import { useDate } from "@/hooks/useDate";
import { useIsMobile } from "@/hooks/use-mobile";

/** h-10 (40px) se ~20% kam → h-8 (32px) */
const DATE_CONVERTER_PILL_CN =
  "h-8 min-h-8 w-auto max-w-full shrink-0 touch-manipulation justify-start gap-1.5 px-2.5 text-sm text-left font-normal whitespace-nowrap";

const DATE_CONVERTER_CALENDAR_POPOVER_CN =
  "z-[200] w-auto max-w-[calc(100vw-1rem)] p-0 sm:max-w-none";

function atNoon(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
}

type DateConverterDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function DateConverterDialog({ open, onOpenChange }: DateConverterDialogProps) {
  const { formatDate } = useDate();
  const isMobile = useIsMobile();
  const [adDate, setAdDate] = React.useState<Date>(() => atNoon(new Date()));
  const [adCalendarOpen, setAdCalendarOpen] = React.useState(false);

  const syncAdDate = React.useCallback((next?: Date) => {
    if (!next) return;
    setAdDate(atNoon(next));
  }, []);

  React.useEffect(() => {
    if (!open) setAdCalendarOpen(false);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "gap-3 p-4 sm:gap-4 sm:p-6",
          "w-[calc(100vw-1rem)] max-w-[22rem] sm:w-fit sm:max-w-[min(100vw-2rem,28rem)]",
          "max-h-[min(90dvh,100vh)] overflow-y-auto overscroll-y-contain"
        )}
      >
        <DialogHeader className="space-y-1 text-left">
          <DialogTitle className="text-base sm:text-lg">Date Converter</DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            Pick a date in either calendar — the other updates automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="grid w-full grid-cols-2 gap-x-2 gap-y-2 sm:gap-3">
          <div className="min-w-0 space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-xs">
              Date (BS)
            </p>
            <BsDatePicker
              isRange={false}
              valueAD={adDate}
              onChangeAD={(d) => syncAdDate(d as Date)}
              className={DATE_CONVERTER_PILL_CN}
              popoverContentClassName={DATE_CONVERTER_CALENDAR_POPOVER_CN}
              popoverSide={isMobile ? "bottom" : "top"}
              popoverAlign={isMobile ? "center" : "start"}
              showDateConverterButton={false}
            />
          </div>

          <div className="min-w-0 space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-xs">
              Date (AD)
            </p>
            <Popover open={adCalendarOpen} onOpenChange={setAdCalendarOpen} modal>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn(DATE_CONVERTER_PILL_CN)}>
                  <span className="truncate">{formatDate(adDate)}</span>
                  <CalendarIcon className="h-3.5 w-3.5 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className={DATE_CONVERTER_CALENDAR_POPOVER_CN}
                side={isMobile ? "bottom" : "top"}
                align={isMobile ? "center" : "start"}
                sideOffset={6}
                collisionPadding={16}
              >
                <AdCalendar
                  valueAD={adDate}
                  isRange={false}
                  numberOfMonths={1}
                  showDateConverterButton={false}
                  onSelect={(d) => {
                    syncAdDate(d);
                    setAdCalendarOpen(false);
                  }}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
