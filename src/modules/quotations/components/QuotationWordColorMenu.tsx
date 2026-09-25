"use client";

import { useState, type ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { chromeProPillCn } from "@/lib/chromePillButton";

const FONT_COLORS = [
  "#000000",
  "#808080",
  "#800000",
  "#FF0000",
  "#FF6600",
  "#FFCC00",
  "#008000",
  "#00B050",
  "#00FFFF",
  "#0070C0",
  "#0000FF",
  "#7030A0",
  "#FF00FF",
  "#C00000",
  "#FFC000",
  "#FFFF00",
];

const BACKGROUND_COLORS = [
  "#FFFF00",
  "#00FF00",
  "#00FFFF",
  "#FF00FF",
  "#FF0000",
  "#0000FF",
  "#FFCC00",
  "#008000",
  "#0070C0",
  "#808080",
  "#FFC000",
  "#C00000",
];

const HIGH_CONTRAST = new Set(["#000000", "#FFFF00", "#00FFFF", "#FF0000", "#0000FF", "#00FF00", "#FFFFFF"]);

const pillShellCn = cn(chromeProPillCn, "inline-flex h-8 overflow-hidden rounded-full p-0 text-blue-900");

function SwatchGrid({
  colors,
  value,
  onPick,
}: {
  colors: string[];
  value: string;
  onPick: (color: string) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-1">
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          title={color}
          className={cn(
            "h-6 w-6 rounded-[2px] border border-black/20 shadow-sm",
            value.toLowerCase() === color.toLowerCase() && "ring-2 ring-offset-1 ring-sky-500"
          )}
          style={{ background: color }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(color)}
        />
      ))}
    </div>
  );
}

function ColorPalette({
  title,
  colors,
  value,
  onPick,
  onNoColor,
  noColorLabel,
}: {
  title: string;
  colors: string[];
  value: string;
  onPick: (color: string) => void;
  onNoColor: () => void;
  noColorLabel: string;
}) {
  const [highContrast, setHighContrast] = useState(false);
  const shown = highContrast ? colors.filter((c) => HIGH_CONTRAST.has(c.toUpperCase())) : colors;

  return (
    <div className="w-[196px]">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">{title}</span>
        <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
          High-contrast only
          <button
            type="button"
            role="switch"
            aria-checked={highContrast}
            className={cn("relative h-4 w-7 rounded-full transition-colors", highContrast ? "bg-sky-500" : "bg-zinc-300")}
            onClick={() => setHighContrast((v) => !v)}
          >
            <span
              className={cn(
                "absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform",
                highContrast ? "left-3.5" : "left-0.5"
              )}
            />
          </button>
        </label>
      </div>
      <SwatchGrid colors={shown} value={value} onPick={onPick} />
      <button
        type="button"
        className="mt-2 flex w-full items-center gap-2 rounded px-1 py-1 text-left text-[11px] hover:bg-zinc-100"
        onClick={onNoColor}
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-[2px] border border-zinc-300 bg-white text-[10px] text-zinc-400">
          /
        </span>
        {noColorLabel}
      </button>
    </div>
  );
}

function ColorSplitPill({
  applyTitle,
  menuTitle,
  menuLabel,
  colors,
  value,
  preview,
  onApply,
  onPick,
  onNoColor,
  noColorLabel,
  onPreserveSelection,
}: {
  applyTitle: string;
  menuTitle: string;
  menuLabel: string;
  colors: string[];
  value: string;
  preview: ReactNode;
  onApply: () => void;
  onPick: (color: string) => void;
  onNoColor: () => void;
  noColorLabel: string;
  onPreserveSelection: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className={pillShellCn}>
      <button
        type="button"
        title={applyTitle}
        className="flex h-8 items-center px-2 hover:bg-blue-200/80"
        onMouseDown={(e) => {
          e.preventDefault();
          onPreserveSelection();
        }}
        onClick={onApply}
      >
        {preview}
      </button>
      <Popover open={open} onOpenChange={setOpen} modal={false}>
        <PopoverTrigger asChild>
          <button
            type="button"
            title={menuTitle}
            className="h-8 border-l border-blue-300/80 px-2 text-xs hover:bg-blue-200/80"
            onMouseDown={(e) => {
              e.preventDefault();
              onPreserveSelection();
            }}
          >
            {menuLabel}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={6}
          className="w-[196px] rounded-md border bg-white p-2 shadow-lg"
          onMouseDown={(e) => e.preventDefault()}
        >
          <ColorPalette
            title={menuTitle}
            colors={colors}
            value={value}
            onPick={(color) => {
              onPick(color);
              setOpen(false);
            }}
            onNoColor={() => {
              onNoColor();
              setOpen(false);
            }}
            noColorLabel={noColorLabel}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function QuotationFontColorButton({
  value,
  onPick,
  onPreserveSelection,
}: {
  value: string;
  onPick: (color: string) => void;
  onPreserveSelection: () => void;
}) {
  const color = value || "#111111";
  return (
    <ColorSplitPill
      applyTitle="Apply text color"
      menuTitle="Text color"
      menuLabel="Color"
      colors={FONT_COLORS}
      value={color}
      onApply={() => onPick(color)}
      onPick={onPick}
      onNoColor={() => onPick("#111111")}
      noColorLabel="Automatic"
      onPreserveSelection={onPreserveSelection}
      preview={
        <span className="flex flex-col items-center leading-none">
          <span className="text-[13px] font-serif font-semibold" style={{ color }}>
            A
          </span>
          <span className="mt-0.5 h-[3px] w-4 rounded-sm" style={{ background: color }} />
        </span>
      }
    />
  );
}

export function QuotationHighlightButton({
  value,
  onPick,
  onPreserveSelection,
}: {
  value: string;
  onPick: (color: string) => void;
  onPreserveSelection: () => void;
}) {
  const bg = value || "#FFFF00";
  return (
    <ColorSplitPill
      applyTitle="Apply text background"
      menuTitle="Text background color"
      menuLabel="Bg"
      colors={BACKGROUND_COLORS}
      value={value}
      onApply={() => onPick(bg)}
      onPick={onPick}
      onNoColor={() => onPick("")}
      noColorLabel="No background"
      onPreserveSelection={onPreserveSelection}
      preview={
        <span
          className="flex h-5 w-5 items-center justify-center rounded-[3px] border border-black/15 text-[12px] font-serif font-semibold text-zinc-900"
          style={{ background: bg }}
        >
          A
        </span>
      }
    />
  );
}
