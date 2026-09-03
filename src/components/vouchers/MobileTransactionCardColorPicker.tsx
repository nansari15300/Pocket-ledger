"use client";

import * as React from "react";
import { Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  type MobileTransactionCardColor,
  mobileCardInnerPillClass,
  mobileCardInnerPillStyle,
  writeMobileTransactionCardColor,
} from "@/lib/mobileTransactionCardColor";
import { cn } from "@/lib/utils";

const COLOR_OPTIONS: Array<{
  value: MobileTransactionCardColor;
  label: string;
  cardClass: string;
  pageClass: string;
  textClass: string;
}> = [
  {
    value: "violet",
    label: "Default",
    cardClass: "!border-0 bg-white",
    pageClass: "bg-gray-100",
    textClass: "text-violet-950",
  },
  {
    value: "default",
    label: "Green",
    cardClass: "border-emerald-400 bg-white",
    pageClass: "bg-white",
    textClass: "text-emerald-950",
  },
  {
    value: "blue",
    label: "Blue",
    cardClass: "border-blue-300 bg-blue-100",
    pageClass: "bg-white",
    textClass: "text-blue-950",
  },
  {
    value: "pink",
    label: "Pink",
    cardClass: "border-pink-300 bg-pink-100",
    pageClass: "bg-white",
    textClass: "text-pink-950",
  },
  {
    value: "amber",
    label: "Amber",
    cardClass: "border-amber-300 bg-amber-100",
    pageClass: "bg-white",
    textClass: "text-amber-950",
  },
];

export type MobileTransactionCardPreview = {
  id: string;
  tone: "green" | "pink" | "blue";
  title: string;
  narration: string;
  date: string;
  user: string;
  amount: string;
  amountSide: "dr" | "cr" | "none";
  balance: string;
  balanceSide: "dr" | "cr" | "none";
};

type MobileTransactionCardColorPickerProps = {
  open: boolean;
  value: MobileTransactionCardColor;
  samples: MobileTransactionCardPreview[];
  onOpenChange: (open: boolean) => void;
  onChange: (value: MobileTransactionCardColor) => void;
};

export function MobileTransactionCardColorPicker({
  open,
  value,
  samples,
  onOpenChange,
  onChange,
}: MobileTransactionCardColorPickerProps) {
  const [draftValue, setDraftValue] = React.useState(value);
  const [draftTones, setDraftTones] = React.useState<
    Record<string, MobileTransactionCardPreview["tone"]>
  >({});
  const selectedIndex = Math.max(
    0,
    COLOR_OPTIONS.findIndex((option) => option.value === draftValue)
  );
  const selectedOption = COLOR_OPTIONS[selectedIndex];
  const touchStartX = React.useRef<number | null>(null);
  const resetDraftTones = () => {
    setDraftTones(
      Object.fromEntries(samples.map((sample) => [sample.id, sample.tone]))
    );
  };
  const cardClassFor = (sample: MobileTransactionCardPreview) => {
    const tone = draftTones[sample.id] ?? sample.tone;
    if (draftValue === "violet" && tone === "pink") {
      return "!border-0 !bg-[#A6A5A0] !text-white";
    }
    if (draftValue === "blue" && tone === "pink") {
      return "!border-gray-500 !bg-gray-200 !text-black";
    }
    if (draftValue === "pink" && tone === "pink") {
      return "!border-amber-400 !bg-amber-100 !text-black";
    }
    if (draftValue === "amber" && tone === "pink") {
      return "!border-[#FFA500] !bg-[#FFA500] !text-black";
    }
    if (draftValue !== "default") {
      return cn(selectedOption.cardClass, "text-black");
    }
    if (tone === "pink") {
      return "border-pink-700 bg-pink-100 text-black";
    }
    if (tone === "blue") {
      return "border-blue-600 bg-blue-100 text-black";
    }
    return "border-green-700 bg-white text-black";
  };
  const cardStyleFor = (
    sample: MobileTransactionCardPreview
  ): React.CSSProperties | undefined => {
    const tone = draftTones[sample.id] ?? sample.tone;
    if (draftValue !== "default" || tone !== "green") return undefined;
    return {
      backgroundImage:
        "linear-gradient(90deg, rgba(236, 253, 245, 0.98) 0%, #ffffff 50%, rgba(209, 250, 229, 0.92) 100%)",
    };
  };
  const sampleTone = (sample: MobileTransactionCardPreview) =>
    draftTones[sample.id] ?? sample.tone;
  const innerPillClass = (sample: MobileTransactionCardPreview) =>
    mobileCardInnerPillClass(draftValue, sampleTone(sample));
  const innerPillStyle = (sample: MobileTransactionCardPreview) =>
    mobileCardInnerPillStyle(draftValue, sampleTone(sample));

  const move = (direction: -1 | 1) => {
    const nextIndex =
      (selectedIndex + direction + COLOR_OPTIONS.length) % COLOR_OPTIONS.length;
    setDraftValue(COLOR_OPTIONS[nextIndex].value);
  };

  const applyColor = () => {
    onChange(draftValue);
    writeMobileTransactionCardColor(draftValue);
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          setDraftValue(value);
          resetDraftTones();
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="left-1/2 min-w-0 grid-rows-[auto_minmax(0,1fr)_auto_auto] h-[80vh] max-h-[80vh] w-[calc(100vw-4px)] max-w-none -translate-x-1/2 overflow-hidden rounded-xl border-blue-300 bg-blue-50 p-2 sm:max-w-none sm:p-3">
        <DialogHeader className="min-h-8 justify-center space-y-0">
          <DialogTitle>Choose Card Color</DialogTitle>
        </DialogHeader>
        <div
          className={cn(
            "min-h-0 min-w-0 flex w-full max-w-full flex-col overflow-hidden rounded-xl border border-blue-200 p-1.5",
            selectedOption.pageClass
          )}
          onTouchStart={(event) => {
            touchStartX.current = event.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(event) => {
            const startX = touchStartX.current;
            touchStartX.current = null;
            const endX = event.changedTouches[0]?.clientX;
            if (startX == null || endX == null || Math.abs(endX - startX) < 32)
              return;
            move(endX < startX ? 1 : -1);
          }}
          aria-label="Swipe to change card color"
        >
          <div className="min-h-0 min-w-0 w-full max-w-full flex-1 space-y-1 overflow-x-hidden overflow-y-auto pr-1">
            {samples.map((sample) =>
              (() => {
                return (
                  <div
                    key={sample.id}
                    data-pl-mobile-transaction-card={sampleTone(sample)}
                    data-pl-mobile-card-color={draftValue}
                    className={cn(
                      "min-w-0 w-full max-w-full overflow-hidden rounded-lg border p-1.5 shadow-sm",
                      cardClassFor(sample)
                    )}
                    style={cardStyleFor(sample)}
                  >
                    <div className="flex min-w-0 items-start justify-between gap-2">
                      <div className="min-w-0 flex-1 overflow-hidden pr-1">
                        <p className="truncate text-xs font-bold">
                          {sample.title}
                        </p>
                        <p className="mt-0.5 truncate text-[10px] opacity-70">
                          Narration: {sample.narration}
                        </p>
                      </div>
                      <div className="flex min-w-0 max-w-[48%] shrink-0 items-center gap-1 overflow-hidden">
                        <div
                          className={cn(
                            "flex h-8 w-8 items-center justify-center rounded-md",
                            innerPillClass(sample)
                          )}
                          style={innerPillStyle(sample)}
                          aria-label="Attachment preview"
                        >
                          <ImageIcon className="h-4 w-4 opacity-60" />
                        </div>
                        <div
                          data-pl-mobile-card-inner-pill=""
                          className={cn(
                            "min-w-0 max-w-[7rem] truncate whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-bold",
                            innerPillClass(sample),
                            sample.amountSide === "cr"
                              ? "!text-red-600"
                              : sample.amountSide === "dr"
                              ? "!text-green-600"
                              : "!text-muted-foreground"
                          )}
                          style={innerPillStyle(sample)}
                        >
                          {sample.amount}
                        </div>
                      </div>
                    </div>
                    <div className="mt-1 flex items-end justify-between gap-2 text-[10px]">
                      <div className="min-w-0 opacity-75">
                        <p>{sample.date}</p>
                        <p className="truncate">User: {sample.user}</p>
                      </div>
                      <button
                        type="button"
                        data-pl-mobile-card-inner-pill=""
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                          innerPillClass(sample)
                        )}
                        style={innerPillStyle(sample)}
                        onClick={() =>
                          setDraftTones((current) => ({
                            ...current,
                            [sample.id]:
                              (current[sample.id] ?? sample.tone) === "pink"
                                ? "green"
                                : "pink",
                          }))
                        }
                      >
                        {(draftTones[sample.id] ?? sample.tone) === "pink"
                          ? "Unapproved"
                          : "Normal"}
                      </button>
                      <div
                        data-pl-mobile-card-inner-pill=""
                        className={cn(
                          "shrink-0 rounded-full px-1.5 py-0.5 font-semibold",
                          innerPillClass(sample),
                          sample.balanceSide === "cr"
                            ? "!text-red-600"
                            : sample.balanceSide === "dr"
                            ? "!text-green-600"
                            : "!text-muted-foreground"
                        )}
                        style={innerPillStyle(sample)}
                      >
                        Bal: {sample.balance}
                      </div>
                    </div>
                  </div>
                );
              })()
            )}
          </div>
        </div>
        <div className="grid h-7 grid-cols-5 items-center gap-1 pt-0">
          {COLOR_OPTIONS.map((option, index) => (
            <button
              key={option.value}
              type="button"
              className={cn(
                "h-6 min-w-0 truncate rounded-md border px-1 text-[10px] font-medium",
                index === selectedIndex
                  ? "border-blue-500 bg-blue-100 text-blue-900"
                  : "border-blue-200 bg-white/60 text-muted-foreground"
              )}
              aria-label={`Use ${option.label} card color`}
              aria-pressed={index === selectedIndex}
              onClick={() => setDraftValue(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="flex justify-end gap-2 border-t border-blue-200 pt-1">
          <Button
            type="button"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="h-7 px-2 text-xs"
            onClick={applyColor}
          >
            OK
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
