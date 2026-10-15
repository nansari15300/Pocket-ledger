"use client";

import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMobileDetailSummaryCollapsed } from "@/contexts/MobileDetailSummaryCollapseContext";
import { MasterListChromeChevronToggle } from "@/components/layout/MasterListChromeChevronToggle";
import { mdcNoEdgeSwipeCapture } from "@/lib/mobileDetailChrome";

/** Mobile entity ledger — list dock jaisa round blue FAB; footer hide/show, hamesha right. */
export function MobileLedgerFooterChevronFab({ className }: { className?: string }) {
  const isMobile = useIsMobile();
  const { collapsed, toggle } = useMobileDetailSummaryCollapsed();

  if (!isMobile || !collapsed) return null;

  return (
    <div
      className={cn(
        "pointer-events-none fixed right-2 z-[45] flex justify-end bottom-[calc(env(safe-area-inset-bottom,0px)+8px)]",
        className
      )}
      {...mdcNoEdgeSwipeCapture}
    >
      <MasterListChromeChevronToggle
        expanded={!collapsed}
        onClick={() => toggle()}
        variant="inline"
        className="pointer-events-auto pl-mobile-ledger-footer-fab rounded-full"
        ariaLabelWhenExpanded="Hide footer controls"
        ariaLabelWhenCollapsed="Show footer controls"
      />
    </div>
  );
}
