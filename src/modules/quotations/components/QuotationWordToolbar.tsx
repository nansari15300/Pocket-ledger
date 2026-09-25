"use client";

import { Bold, Italic, ImagePlus, RemoveFormatting, Rows3, Columns2, Undo2, Redo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { chromeProPillCn } from "@/lib/chromePillButton";
import { QUOTATION_FONT_SIZES } from "../constants";
import type { QuotationPageFlow } from "../types";
import { QuotationFontColorButton, QuotationHighlightButton } from "./QuotationWordColorMenu";
import { QuotationOnlineTypingLinks } from "./QuotationOnlineTypingLinks";

function keepSelection(e: React.MouseEvent | React.PointerEvent) {
  e.preventDefault();
}

const toolBtnCn = "h-8 px-2 text-xs";
const sizePillCn = cn(chromeProPillCn, "h-8 w-[100px] rounded-full px-3 text-xs text-blue-900 shadow-none");

export function QuotationWordToolbar({
  fontSize,
  textColor,
  highlightColor,
  pageFlow,
  onFontSize,
  onTextColor,
  onHighlightColor,
  onBold,
  onItalic,
  onNormal,
  onInsertImage,
  onPageFlow,
  onPreserveSelection,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  sideTypingPanelOpen,
  onToggleSideTypingPanel,
  onOpenSideTypingPanel,
}: {
  fontSize: number;
  textColor: string;
  highlightColor: string;
  pageFlow: QuotationPageFlow;
  onFontSize: (px: number) => void;
  onTextColor: (color: string) => void;
  onHighlightColor: (color: string) => void;
  onBold: () => void;
  onItalic: () => void;
  onNormal: () => void;
  onInsertImage: () => void;
  onPageFlow: (flow: QuotationPageFlow) => void;
  onPreserveSelection: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  sideTypingPanelOpen?: boolean;
  onToggleSideTypingPanel?: () => void;
  onOpenSideTypingPanel?: (linkId: string) => void;
}) {
  return (
    <div className="quotation-form-ribbon flex flex-wrap items-center gap-1 border-b px-2 py-1.5">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
      <Button
        type="button"
        variant="chromePill"
        size="sm"
        className={toolBtnCn}
        title="Undo (Ctrl+Z)"
        disabled={!canUndo}
        onMouseDown={keepSelection}
        onClick={onUndo}
      >
        <Undo2 className="h-3.5 w-3.5" />
        <span className="text-xs">Undo</span>
      </Button>
      <Button
        type="button"
        variant="chromePill"
        size="sm"
        className={toolBtnCn}
        title="Redo (Ctrl+Y)"
        disabled={!canRedo}
        onMouseDown={keepSelection}
        onClick={onRedo}
      >
        <Redo2 className="h-3.5 w-3.5" />
        <span className="text-xs">Redo</span>
      </Button>
      <Button
        type="button"
        variant="chromePill"
        size="sm"
        className={toolBtnCn}
        title="Bold"
        onMouseDown={keepSelection}
        onClick={onBold}
      >
        <Bold className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        variant="chromePill"
        size="sm"
        className={toolBtnCn}
        title="Italic"
        onMouseDown={keepSelection}
        onClick={onItalic}
      >
        <Italic className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        variant="chromePill"
        size="sm"
        className={toolBtnCn}
        title="Normal"
        onMouseDown={keepSelection}
        onClick={onNormal}
      >
        <RemoveFormatting className="h-3.5 w-3.5" />
        <span className="text-xs">Normal</span>
      </Button>
      <Select
        value={String(fontSize)}
        onOpenChange={(open) => {
          if (open) onPreserveSelection();
        }}
        onValueChange={(v) => onFontSize(Number(v))}
      >
        <SelectTrigger className={sizePillCn} onPointerDown={() => onPreserveSelection()}>
          <SelectValue placeholder="Size" />
        </SelectTrigger>
        <SelectContent>
          {QUOTATION_FONT_SIZES.map((size) => (
            <SelectItem key={size} value={String(size)}>
              {size} px
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <QuotationFontColorButton
        value={textColor}
        onPick={onTextColor}
        onPreserveSelection={onPreserveSelection}
      />
      <QuotationHighlightButton
        value={highlightColor}
        onPick={onHighlightColor}
        onPreserveSelection={onPreserveSelection}
      />
      <Button
        type="button"
        variant="chromePill"
        size="sm"
        className={toolBtnCn}
        title="Insert picture"
        onMouseDown={keepSelection}
        onClick={onInsertImage}
      >
        <ImagePlus className="h-3.5 w-3.5" />
        <span className="text-xs">Picture</span>
      </Button>
      <Button
        type="button"
        variant="chromePill"
        size="sm"
        className={cn(toolBtnCn, "quotation-flow-pill")}
        title="Show extra pages below"
        aria-pressed={pageFlow === "bottom"}
        data-chrome-pill-active={pageFlow === "bottom" ? "true" : undefined}
        onClick={() => onPageFlow("bottom")}
      >
        <Rows3 className="h-3.5 w-3.5" />
        <span className="text-xs">Bottom</span>
      </Button>
      <Button
        type="button"
        variant="chromePill"
        size="sm"
        className={cn(toolBtnCn, "quotation-flow-pill")}
        title="Show extra pages to the right"
        aria-pressed={pageFlow === "right"}
        data-chrome-pill-active={pageFlow === "right" ? "true" : undefined}
        onClick={() => onPageFlow("right")}
      >
        <Columns2 className="h-3.5 w-3.5" />
        <span className="text-xs">Right</span>
      </Button>
      </div>
      <div
        className="quotation-word-ribbon-group quotation-word-ribbon-group-end ml-auto shrink-0"
        role="group"
        aria-label="Online typing"
      >
        <div className="quotation-word-ribbon-group-row flex flex-wrap items-center gap-1">
          <QuotationOnlineTypingLinks
            onPreserveSelection={onPreserveSelection}
            sidePanelOpen={sideTypingPanelOpen}
            onToggleSideTypingPanel={onToggleSideTypingPanel}
            onOpenSideTypingPanel={onOpenSideTypingPanel}
          />
        </div>
      </div>
    </div>
  );
}
