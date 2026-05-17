"use client";

import { cn } from "@/lib/utils";

type FreePlanPriceLabelProps = {
  /** Admin/catalog rate — line-through; khali ho to sirf "Free". */
  crossedPrice?: string | null;
  size?: "sm" | "lg";
  className?: string;
};

/** Free plan: "Free" + optional crossed-out list price (regional/base amount). */
export function FreePlanPriceLabel({
  crossedPrice,
  size = "lg",
  className,
}: FreePlanPriceLabelProps) {
  const raw = String(crossedPrice ?? "").trim();
  const showCrossed =
    raw.length > 0 &&
    raw.toLowerCase() !== "free" &&
    raw !== "—" &&
    !/^((rs\.?|₹|\$)\s*)?0(\.0+)?$/i.test(raw);

  return (
    <div className={cn("min-w-0 break-words", className)}>
      {showCrossed ? (
        <p
          className={cn(
            "font-bold text-muted-foreground line-through decoration-2",
            size === "lg" ? "text-lg sm:text-xl" : "text-base"
          )}
        >
          {raw}
        </p>
      ) : null}
      <p className={cn("font-bold text-primary", size === "lg" ? "text-2xl sm:text-3xl" : "text-xl")}>
        Free
      </p>
    </div>
  );
}
