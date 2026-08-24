"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

const BANNER_TOGGLE_HORIZONTAL_PAD_PX = 16;

type MasterAccountFreezeBannerTopActionsProps = {
  bannerRef: React.RefObject<HTMLDivElement | null>;
  onFitsChange?: (fits: boolean) => void;
  children: React.ReactNode;
};

/** Mobile: show banner toggle only when the rotated banner is wide enough. */
export function MasterAccountFreezeBannerTopActions({
  bannerRef,
  onFitsChange,
  children,
}: MasterAccountFreezeBannerTopActionsProps) {
  const isMobile = useIsMobile();
  const actionsRef = React.useRef<HTMLDivElement>(null);
  const neededWidthRef = React.useRef(0);
  const [showOnBanner, setShowOnBanner] = React.useState(true);

  React.useLayoutEffect(() => {
    if (!children) {
      setShowOnBanner(true);
      onFitsChange?.(true);
      return;
    }

    if (!isMobile) {
      setShowOnBanner(true);
      onFitsChange?.(true);
      return;
    }

    const measure = () => {
      const banner = bannerRef.current;
      const actions = actionsRef.current;
      if (!banner) return;

      if (actions && actions.scrollWidth > 0) {
        neededWidthRef.current = actions.scrollWidth;
      }

      const available = banner.clientWidth - BANNER_TOGGLE_HORIZONTAL_PAD_PX;
      const fits =
        neededWidthRef.current > 0 ? neededWidthRef.current <= available : available > 0;

      setShowOnBanner(fits);
      onFitsChange?.(fits);
    };

    measure();

    const ro = new ResizeObserver(measure);
    const banner = bannerRef.current;
    const actions = actionsRef.current;
    if (banner) ro.observe(banner);
    if (actions) ro.observe(actions);

    return () => ro.disconnect();
  }, [isMobile, bannerRef, onFitsChange, children]);

  if (!children) return null;

  return (
    <div
      ref={actionsRef}
      className={cn(
        "flex w-full shrink-0 justify-center",
        isMobile && !showOnBanner && "hidden"
      )}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}
