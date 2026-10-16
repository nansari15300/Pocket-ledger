"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { DialogClose } from "@/components/ui/dialog";

type MasterEntityDialogDragRibbonProps = {
  onDragStart: (e: React.MouseEvent) => void;
  children: React.ReactNode;
  className?: string;
  /** Voucher-dialog style: blue ribbon plus a red X close button on the right. */
  blue?: boolean;
};

/** Desktop resizable master dialogs — gray top bar to click-drag the window. */
export function MasterEntityDialogDragRibbon({
  onDragStart,
  children,
  className,
  blue = false,
}: MasterEntityDialogDragRibbonProps) {
  return (
    <div
      className={cn(
        "relative z-20 shrink-0 select-none border-b px-4 py-2.5",
        blue
          ? "flex items-center justify-between gap-2 border-slate-400/60 bg-[#b8c8f5] text-gray-900 dark:bg-[#7a8ed8] dark:text-white"
          : "border-gray-300/80 bg-gray-200 pr-12 dark:border-gray-600 dark:bg-gray-700",
        "cursor-grab active:cursor-grabbing",
        className
      )}
      onMouseDown={onDragStart}
    >
      {blue ? <div className="min-w-0 flex-1">{children}</div> : children}
      {blue ? (
        <DialogClose className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-500/50 bg-white/60 text-red-600 shadow-sm opacity-95 transition-colors hover:bg-white hover:text-red-700 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1">
          <X className="h-4 w-4 text-red-600" />
          <span className="sr-only">Close</span>
        </DialogClose>
      ) : null}
    </div>
  );
}
