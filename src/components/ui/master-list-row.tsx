"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { masterListSelectedCn } from "@/lib/listSelectionChrome";

/**
 * Master-detail list row — `Card` mat use karo (Pro theme har `rounded-lg.bg-card` par ribbon lagata hai).
 * `data-pl-list-row` + sirf `rounded-md` — globals.css list rows ko dashboard gradient se alag rakhta hai.
 */
export const MasterListRow = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { selected?: boolean }
>(({ className, selected, ...props }, ref) => (
  <div
    ref={ref}
    data-pl-list-row=""
    data-pl-list-selected={selected ? "" : undefined}
    className={cn(
      "pl-master-list-item bg-card text-card-foreground",
      selected && masterListSelectedCn,
      className
    )}
    {...props}
  />
));
MasterListRow.displayName = "MasterListRow";
