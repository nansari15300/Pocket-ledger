"use client";

/**
 * Mobile-only: date / balance / filters summary — collapse state; fixed FAB provider se ek hi.
 */
import type { ReactNode } from "react";
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { useMobileDetailSummaryCollapsed } from "@/contexts/MobileDetailSummaryCollapseContext";
import { useIsMobile } from "@/hooks/use-mobile";

export type MobileDetailSummaryCollapsibleProps = {
  children: ReactNode;
  className?: string;
};

export function MobileDetailSummaryCollapsible({
  children,
  className,
}: MobileDetailSummaryCollapsibleProps) {
  const isMobile = useIsMobile();
  const { collapsed, registerCollapsibleHost, unregisterCollapsibleHost } =
    useMobileDetailSummaryCollapsed();

  // Sirf related detail/report pages — provider ek hi fixed FAB dikhata hai
  useEffect(() => {
    if (!isMobile) return;
    registerCollapsibleHost();
    return () => unregisterCollapsibleHost();
  }, [isMobile, registerCollapsibleHost, unregisterCollapsibleHost]);

  if (!isMobile) {
    return <>{children}</>;
  }

  return (
    <>
      {!collapsed ? (
        <div className={cn("flex flex-shrink-0 flex-col", className)}>{children}</div>
      ) : null}
    </>
  );
}
