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
  trailingAction?: ReactNode;
};

export function InterCompanySectionTitle({ title, flowBadge, trailingAction }: Props) {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
      <FormLabel className="!mt-0 shrink-0">{title}</FormLabel>
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
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
