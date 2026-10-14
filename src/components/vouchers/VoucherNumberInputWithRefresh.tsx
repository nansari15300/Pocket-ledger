"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Input, type InputProps } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const REFRESH_SPIN_MIN_MS = 2000;

type Props = InputProps & {
  onRefresh?: () => void | Promise<void>;
  showRefresh?: boolean;
  /** Match adjacent form controls (mobile list chrome = sm). */
  chromeSize?: "sm" | "md";
};

export function VoucherNumberInputWithRefresh({
  onRefresh,
  showRefresh = false,
  chromeSize = "md",
  className,
  disabled,
  ...inputProps
}: Props) {
  const [busy, setBusy] = useState(false);
  // Refresh stays visible/clickable even when the text field is read-only
  // (no voucher-number edit permission) — click rescans the next auto number.
  const showRefreshBtn = Boolean(showRefresh && onRefresh);
  const iconBtnClass = chromeSize === "sm" ? "h-7 w-7" : "h-8 w-8";
  const inputPadRight = chromeSize === "sm" ? "pr-9" : "pr-10";

  const handleRefresh = async () => {
    if (!onRefresh || busy) return;
    setBusy(true);
    const started = Date.now();
    try {
      await onRefresh();
    } finally {
      const waitMs = Math.max(0, REFRESH_SPIN_MIN_MS - (Date.now() - started));
      if (waitMs > 0) {
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, waitMs);
        });
      }
      setBusy(false);
    }
  };

  return (
    <div className="relative min-w-0 w-full">
      <Input
        className={cn("min-w-0 w-full", showRefreshBtn && inputPadRight, className)}
        disabled={disabled}
        {...inputProps}
      />
      {showRefreshBtn ? (
        <button
          type="button"
          className={cn(
            "absolute right-0.5 top-1/2 z-[1] inline-flex -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50",
            iconBtnClass
          )}
          title="Refresh voucher number"
          aria-label="Refresh voucher number"
          disabled={busy}
          onClick={() => void handleRefresh()}
        >
          <RefreshCw className={cn("h-4 w-4 shrink-0", busy && "animate-spin")} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
