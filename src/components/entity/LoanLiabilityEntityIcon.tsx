"use client";

import { cn } from "@/lib/utils";
import { publicAssetUrl } from "@/lib/webAppBasePath";
import { LOAN_LIABILITY_ENTITY_ICON_PATH } from "@/lib/loanLiabilityEntityIcon";

/** Gold loan-liability entity icon (sidebar, section headers, loan account fallbacks). */
export function LoanLiabilityEntityIcon({
  className,
  size = "md",
}: {
  className?: string;
  /** Nav/sidebar uses larger visual scale to match Lucide menu icons. */
  size?: "md" | "nav" | "avatar" | "detail";
}) {
  return (
    <img
      src={publicAssetUrl(LOAN_LIABILITY_ENTITY_ICON_PATH)}
      alt=""
      aria-hidden
      draggable={false}
      className={cn(
        "inline-block shrink-0 aspect-square object-cover object-center",
        size === "nav"
          ? "h-5 w-5 scale-[1.45]"
          : size === "avatar"
            ? "h-7 w-7"
            : size === "detail"
              ? "h-10 w-10"
              : "h-4 w-4",
        className
      )}
    />
  );
}
