"use client";

/**
 * Mobile-only: date / balance / filters summary — collapse state; FAB alag portal se footer par.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useMobileDetailSummaryCollapsed } from "@/contexts/MobileDetailSummaryCollapseContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileDetailSummaryFloatingToggle } from "@/components/layout/MobileDetailSummaryFloatingToggle";

export type MobileDetailSummaryCollapsibleProps = {
  children: ReactNode;
  className?: string;
};

export function MobileDetailSummaryCollapsible({
  children,
  className,
}: MobileDetailSummaryCollapsibleProps) {
  const isMobile = useIsMobile();
  const { collapsed, pagerFabHostCount } = useMobileDetailSummaryCollapsed();

  if (!isMobile) {
    return <>{children}</>;
  }

  return (
    <>
      {/* Report list (bina pager): fixed FAB — detail pages par pager inline FAB use karta hai */}
      {pagerFabHostCount === 0 ? <MobileDetailSummaryFloatingToggle placement="fixed" /> : null}
      {!collapsed ? (
        <div className={cn("flex flex-shrink-0 flex-col", className)}>{children}</div>
      ) : null}
    </>
  );
}
