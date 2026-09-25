"use client";

import { cn } from "@/lib/utils";

type MasterEntityDialogDragRibbonProps = {
  onDragStart: (e: React.MouseEvent) => void;
  children: React.ReactNode;
  className?: string;
};

/** Desktop resizable master dialogs — gray top bar to click-drag the window. */
export function MasterEntityDialogDragRibbon({
  onDragStart,
  children,
  className,
}: MasterEntityDialogDragRibbonProps) {
  return (
    <div
      className={cn(
        "relative z-20 shrink-0 select-none border-b border-gray-300/80 bg-gray-200 px-4 py-2.5 pr-12 dark:border-gray-600 dark:bg-gray-700",
        "cursor-grab active:cursor-grabbing",
        className
      )}
      onMouseDown={onDragStart}
    >
      {children}
    </div>
  );
}
