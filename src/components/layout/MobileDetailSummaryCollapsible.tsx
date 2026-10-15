"use client";

/**
 * Mobile-only: date / balance / filters summary — collapse state; fixed FAB provider se ek hi.
 */
import * as React from "react";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { useMobileDetailSummaryCollapsed } from "@/contexts/MobileDetailSummaryCollapseContext";
import { useIsMobile } from "@/hooks/use-mobile";

export type MobileDetailSummaryCollapsibleProps = {
  children: ReactNode;
  className?: string;
};

function isPinnedBalanceRow(child: ReactNode): boolean {
  if (!React.isValidElement(child)) return false;
  const props = child.props as Record<string, unknown>;
  return props["data-pl-mobile-txn-balance-row"] === "";
}

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

  const collapsibleParts: ReactNode[] = [];
  const pinnedParts: ReactNode[] = [];
  React.Children.forEach(children, (child) => {
    if (isPinnedBalanceRow(child)) pinnedParts.push(child);
    else collapsibleParts.push(child);
  });

  return (
    <>
      {!collapsed && collapsibleParts.length > 0 ? (
        <div className={cn("flex flex-shrink-0 flex-col", className)}>{collapsibleParts}</div>
      ) : null}
      {pinnedParts.length > 0 ? (
        <div className={cn("flex flex-shrink-0 flex-col", className)}>{pinnedParts}</div>
      ) : null}
    </>
  );
}
