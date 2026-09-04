"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { MASTER_LIST_GROUP_ICON_CN } from "@/lib/masterListChrome";

type Props = {
  children: React.ReactNode;
  className?: string;
};

/** Masters group row leading icon — green on normal rows, blue on IC rows (parent `data-pl-ic-company-row`). */
export function MasterListGroupIcon({ children, className }: Props) {
  return (
    <div
      className={cn(
        MASTER_LIST_GROUP_ICON_CN,
        "[&_svg]:text-[var(--pl-master-profile-ink,rgb(74_222_128))]",
        className
      )}
    >
      {children}
    </div>
  );
}
