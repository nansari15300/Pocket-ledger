"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useDate } from "@/hooks/useDate";
import {
  AD_DATE_FORMATS,
  BS_DATE_FORMATS,
  type ADFormatKey,
  type BSFormatKey,
} from "@/lib/dateFormatOptions";
import { cn } from "@/lib/utils";

type DateFormatSettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function DateFormatSettingsDialog({
  open,
  onOpenChange,
}: DateFormatSettingsDialogProps) {
  const {
    dateSystem,
    dateFormatAD,
    dateFormatBS,
    setDateFormatAD,
    setDateFormatBS,
  } = useDate();

  const [pendingAD, setPendingAD] = React.useState<ADFormatKey>(dateFormatAD);
  const [pendingBS, setPendingBS] = React.useState<BSFormatKey>(dateFormatBS);

  React.useEffect(() => {
    if (open) {
      setPendingAD(dateFormatAD);
      setPendingBS(dateFormatBS);
    }
  }, [open, dateFormatAD, dateFormatBS]);

  const showAD = dateSystem === "AD" || dateSystem === "Both";
  const showBS = dateSystem === "BS" || dateSystem === "Both";

  const handleSave = () => {
    setDateFormatAD(pendingAD);
    setDateFormatBS(pendingBS);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "max-h-[90vh] w-[calc(100%-2rem)] max-w-md sm:max-w-lg",
          "flex flex-col overflow-hidden p-0 gap-0",
          "rounded-2xl sm:rounded-2xl"
        )}
      >
        <DialogHeader className="shrink-0 px-4 pt-4 sm:px-6 sm:pt-6 pb-2">
          <DialogTitle>Date format settings</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 grid gap-6 pb-2">
          {showAD && (
            <section className="space-y-3">
              <Label className="text-base font-semibold">
                Anno Domini (AD) format
              </Label>
              <RadioGroup
                value={pendingAD}
                onValueChange={(v) => setPendingAD(v as ADFormatKey)}
                className="grid gap-3"
              >
                {AD_DATE_FORMATS.map((opt) => (
                  <div
                    key={opt.value}
                    className="flex items-start gap-3 rounded-lg border p-3 hover:bg-muted/50"
                  >
                    <RadioGroupItem value={opt.value} id={`ad-${opt.value}`} />
                    <label
                      htmlFor={`ad-${opt.value}`}
                      className="flex-1 cursor-pointer text-sm"
                    >
                      <span className="font-medium">{opt.label}</span>
                      <span className="ml-2 text-muted-foreground">
                        ({opt.example})
                      </span>
                    </label>
                  </div>
                ))}
              </RadioGroup>
            </section>
          )}
          {showBS && (
            <section className="space-y-3">
              <Label className="text-base font-semibold">
                Bikram Samvat (BS) format
              </Label>
              <RadioGroup
                value={pendingBS}
                onValueChange={(v) => setPendingBS(v as BSFormatKey)}
                className="grid gap-3"
              >
                {BS_DATE_FORMATS.map((opt) => (
                  <div
                    key={opt.value}
                    className="flex items-start gap-3 rounded-lg border p-3 hover:bg-muted/50"
                  >
                    <RadioGroupItem value={opt.value} id={`bs-${opt.value}`} className="shrink-0 mt-0.5" />
                    <label
                      htmlFor={`bs-${opt.value}`}
                      className="flex-1 min-w-0 cursor-pointer text-sm font-medium break-words"
                    >
                      <span>{opt.label}</span>
                      <span className="ml-2 text-muted-foreground">
                        ({opt.example})
                      </span>
                    </label>
                  </div>
                ))}
              </RadioGroup>
            </section>
          )}
        </div>
        <DialogFooter className="shrink-0 flex flex-row justify-end gap-2 border-t bg-background px-4 py-3 sm:px-6 sm:py-3 rounded-b-2xl">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
