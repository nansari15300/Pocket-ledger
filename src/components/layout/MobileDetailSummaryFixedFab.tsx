"use client";

/**
 * Mobile detail/report: bina pager wale list par ek hi summary collapse FAB (body portal).
 */
import { useIsMobile } from "@/hooks/use-mobile";
import { useAppModalOverlayOpen } from "@/hooks/useAppModalOverlayOpen";
import { useMobileDetailSummaryCollapsed } from "@/contexts/MobileDetailSummaryCollapseContext";
import { MobileDetailSummaryFloatingToggle } from "@/components/layout/MobileDetailSummaryFloatingToggle";

export function MobileDetailSummaryFixedFab() {
  const isMobile = useIsMobile();
  const overlayOpen = useAppModalOverlayOpen();
  const { collapsibleHostCount, pagerFabHostCount } = useMobileDetailSummaryCollapsed();

  if (!isMobile || overlayOpen || collapsibleHostCount === 0 || pagerFabHostCount > 0) {
    return null;
  }

  return <MobileDetailSummaryFloatingToggle placement="fixed" />;
}
