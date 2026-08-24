"use client";

import * as React from "react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { masterListNameTriggerCn } from "@/lib/listSelectionChrome";
import { useIsTextTruncated } from "@/hooks/useIsTextTruncated";

/** Mark inner truncate lines (Party/IC two-line titles) for overflow detection. */
export function masterListNameMeasureProps(className?: string) {
  return {
    "data-pl-master-list-name-measure": "",
    className: cn("block w-full truncate", className),
  } as const;
}

type MasterListNameTooltipProps = {
  children: React.ReactNode;
  tooltipContent: React.ReactNode;
  className?: string;
  triggerClassName?: string;
  side?: React.ComponentProps<typeof TooltipContent>["side"];
  align?: React.ComponentProps<typeof TooltipContent>["align"];
  /** Re-measure when label or list layout changes. */
  measureKey?: string | number;
};

/**
 * Master list naam hover — sirf jab text clip / ellipsis ho (…).
 * Web, Electron, Capacitor: ResizeObserver se measure.
 */
export function MasterListNameTooltip({
  children,
  tooltipContent,
  className,
  triggerClassName = masterListNameTriggerCn,
  side = "bottom",
  align = "start",
  measureKey,
}: MasterListNameTooltipProps) {
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const isTruncated = useIsTextTruncated(triggerRef, [measureKey, children]);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (!isTruncated) setOpen(false);
  }, [isTruncated]);

  return (
    <Tooltip
      open={isTruncated && open}
      onOpenChange={(next) => {
        if (isTruncated) setOpen(next);
      }}
    >
      <TooltipTrigger
        ref={triggerRef}
        type="button"
        data-pl-list-name=""
        onPointerDown={(e) => e.stopPropagation()}
        className={cn(triggerClassName, className)}
      >
        {children}
      </TooltipTrigger>
      {isTruncated ? (
        <TooltipContent side={side} align={align}>
          {tooltipContent}
        </TooltipContent>
      ) : null}
    </Tooltip>
  );
}
