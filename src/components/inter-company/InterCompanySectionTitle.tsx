"use client";

/**
 * Source / Target company heading — edit par Payment Out (sender) ya Payment In (receiver) badge.
 */
import type { ReactNode } from "react";
import { FormLabel } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  /** Voucher is doc role=source → sender opened → Payment Out; role=target → Payment In */
  flowBadge?: "payment_out" | "payment_in" | null;
  /** Revert accept — Payment Out/In ke left blue pill */
  showRevertedBadge?: boolean;
  trailingAction?: ReactNode;
};

/** Ledger type pill jaisa — reverted IC voucher header */
const revertedPillClass =
  "shrink-0 border-blue-600/50 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-600/40";

export function InterCompanySectionTitle({
  title,
  flowBadge,
  showRevertedBadge = false,
  trailingAction,
}: Props) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-[5ch] gap-y-1">
      <FormLabel className="!mt-0 shrink-0">{title}</FormLabel>
      {/* Title ke just ~5 spaces baad — far-right nahi, chhoti screen pe full dikhe */}
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {showRevertedBadge ? (
          <Badge variant="outline" className={cn(revertedPillClass)}>
            Reverted
          </Badge>
        ) : null}
        {flowBadge === "payment_out" ? (
          <Badge
            variant="outline"
            className={cn(
              "shrink-0 border-amber-500/70 bg-amber-50 text-amber-950",
              "dark:border-amber-400/60 dark:bg-amber-950/40 dark:text-amber-100"
            )}
          >
            Payment Out
          </Badge>
        ) : null}
        {flowBadge === "payment_in" ? (
          <Badge
            variant="outline"
            className={cn(
              "shrink-0 border-sky-500/70 bg-sky-50 text-sky-950",
              "dark:border-sky-400/60 dark:bg-sky-950/40 dark:text-sky-100"
            )}
          >
            Payment In
          </Badge>
        ) : null}
        {trailingAction}
      </div>
    </div>
  );
}
