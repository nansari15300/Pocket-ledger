"use client";

import type { ReactNode } from "react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { masterSpecialAccountPanelClassName } from "@/lib/masterFormPillChrome";

/** Bank/cash edit + Manage Sharing — same Special Account switch chrome */
export function SpecialAccountFeatureSwitchPanel({
  checked,
  onCheckedChange,
  disabled = false,
  switchDisabled,
  className,
  leading,
  description,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** @deprecated use switchDisabled — only disables the toggle, not `leading` */
  disabled?: boolean;
  switchDisabled?: boolean;
  className?: string;
  leading?: ReactNode;
  description?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 rounded-md p-2.5",
        masterSpecialAccountPanelClassName,
        className
      )}
    >
      <p className="shrink-0 cursor-default text-sm font-normal leading-snug">Special Account</p>
      {leading}
      <div className="min-w-0 flex-1 space-y-0.5">
        {description ? (
          <div className="text-xs text-muted-foreground leading-snug">{description}</div>
        ) : null}
      </div>
      <Switch
        checked={checked === true}
        onCheckedChange={onCheckedChange}
        disabled={switchDisabled ?? disabled}
        aria-label="Special Account"
      />
    </div>
  );
}
