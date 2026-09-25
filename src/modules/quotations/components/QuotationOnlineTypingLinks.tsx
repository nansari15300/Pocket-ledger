"use client";

import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { chromeProPillCn } from "@/lib/chromePillButton";
import { DEFAULT_QUOTATION_SIDE_TYPING_LINK_ID } from "../quotationOnlineTypingLinks";

const triggerCn = cn(chromeProPillCn, "h-8 gap-1.5 rounded-full px-2.5 text-xs text-blue-900 shadow-none");

export function QuotationOnlineTypingLinks({
  onPreserveSelection,
  sidePanelOpen,
  onToggleSideTypingPanel,
  onOpenSideTypingPanel,
}: {
  onPreserveSelection?: () => void;
  sidePanelOpen?: boolean;
  onToggleSideTypingPanel?: () => void;
  onOpenSideTypingPanel?: (linkId: string) => void;
}) {
  const handleClick = () => {
    if (sidePanelOpen) {
      onToggleSideTypingPanel?.();
      return;
    }
    onOpenSideTypingPanel?.(DEFAULT_QUOTATION_SIDE_TYPING_LINK_ID);
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn(triggerCn, sidePanelOpen && "ring-2 ring-green-600/40")}
      title="Google Input Tools in side panel — copy and paste into letter"
      aria-pressed={sidePanelOpen}
      data-chrome-pill-active={sidePanelOpen ? "true" : undefined}
      onPointerDown={() => onPreserveSelection?.()}
      onClick={handleClick}
    >
      <Languages className="h-3.5 w-3.5 shrink-0" />
      <span>Online Typing</span>
    </Button>
  );
}
