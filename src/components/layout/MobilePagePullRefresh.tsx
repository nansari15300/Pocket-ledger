"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useIsMobile, isElectronEnvironment } from "@/hooks/use-mobile";
import {
  MOBILE_PULL_REFRESH_DISTANCE_RATIO,
  PL_MOBILE_PULL_SCROLL_ATTR,
} from "@/lib/mobileRoutePullRefresh";
import { useMobilePagePullRefreshController } from "@/contexts/MobilePagePullRefreshContext";

const SCROLL_TOP_EPS = 2;

type Props = {
  scrollRef: React.RefObject<HTMLElement | null>;
};

function collectPullScrollTargets(main: HTMLElement | null): HTMLElement[] {
  const out = new Set<HTMLElement>();
  if (main) out.add(main);
  if (typeof document === "undefined") return [...out];
  document.querySelectorAll<HTMLElement>(`[${PL_MOBILE_PULL_SCROLL_ATTR}]`).forEach((el) => out.add(el));
  document.querySelectorAll<HTMLElement>(".pl-ledger-txn-scroll-native").forEach((el) => {
    const oy = window.getComputedStyle(el).overflowY;
    if (oy === "auto" || oy === "scroll") out.add(el);
  });
  return [...out];
}

export function MobilePagePullRefresh({ scrollRef }: Props) {
  const pathname = usePathname() || "/";
  const isMobile = useIsMobile();
  const { runRefresh } = useMobilePagePullRefreshController();
  const enabled = isMobile && !isElectronEnvironment();

  const [pullPx, setPullPx] = React.useState(0);
  const pullPxRef = React.useRef(0);
  const [refreshing, setRefreshing] = React.useState(false);
  const refreshingRef = React.useRef(false);
  refreshingRef.current = refreshing;
  const touchRef = React.useRef<{ y: number; el: HTMLElement } | null>(null);

  const thresholdPx = React.useMemo(() => {
    if (typeof window === "undefined") return 280;
    return Math.max(120, Math.floor(window.innerHeight * MOBILE_PULL_REFRESH_DISTANCE_RATIO));
  }, []);

  React.useEffect(() => {
    if (!enabled) return;

    const onTouchStart = (e: TouchEvent) => {
      if (refreshingRef.current) return;
      const el = e.currentTarget as HTMLElement;
      if (el.scrollTop > SCROLL_TOP_EPS) return;
      const t = e.touches[0];
      if (!t) return;
      touchRef.current = { y: t.clientY, el };
      setPullPx(0);
      pullPxRef.current = 0;
    };

    const onTouchMove = (e: TouchEvent) => {
      const session = touchRef.current;
      if (!session || refreshingRef.current) return;
      const el = session.el;
      if (el.scrollTop > SCROLL_TOP_EPS) {
        touchRef.current = null;
        setPullPx(0);
        pullPxRef.current = 0;
        return;
      }
      const t = e.touches[0];
      if (!t) return;
      const dy = t.clientY - session.y;
      if (dy <= 0) {
        setPullPx(0);
        pullPxRef.current = 0;
        return;
      }
      const next = Math.min(dy, thresholdPx * 1.15);
      pullPxRef.current = next;
      setPullPx(next);
      if (dy > 8) e.preventDefault();
    };

    const onTouchEnd = async () => {
      const session = touchRef.current;
      touchRef.current = null;
      if (!session || refreshingRef.current) {
        setPullPx(0);
        pullPxRef.current = 0;
        return;
      }
      const pulled = pullPxRef.current;
      setPullPx(0);
      pullPxRef.current = 0;
      if (pulled < thresholdPx) return;
      setRefreshing(true);
      refreshingRef.current = true;
      try {
        await runRefresh(pathname);
      } finally {
        refreshingRef.current = false;
        setRefreshing(false);
      }
    };

    const bound: HTMLElement[] = [];
    const bindTargets = () => {
      const targets = collectPullScrollTargets(scrollRef.current);
      for (const el of targets) {
        if (bound.includes(el)) continue;
        bound.push(el);
        el.addEventListener("touchstart", onTouchStart, { passive: true });
        el.addEventListener("touchmove", onTouchMove, { passive: false });
        el.addEventListener("touchend", onTouchEnd, { passive: true });
        el.addEventListener("touchcancel", onTouchEnd, { passive: true });
      }
    };

    bindTargets();
    const raf = requestAnimationFrame(bindTargets);
    const mo =
      scrollRef.current &&
      new MutationObserver(() => {
        bindTargets();
      });
    if (mo && scrollRef.current) {
      mo.observe(scrollRef.current, { childList: true, subtree: true });
    }

    return () => {
      cancelAnimationFrame(raf);
      mo?.disconnect();
      for (const el of bound) {
        el.removeEventListener("touchstart", onTouchStart);
        el.removeEventListener("touchmove", onTouchMove);
        el.removeEventListener("touchend", onTouchEnd);
        el.removeEventListener("touchcancel", onTouchEnd);
      }
    };
  }, [enabled, scrollRef, thresholdPx, pathname, runRefresh]);

  if (!enabled) return null;

  const progress = thresholdPx > 0 ? Math.min(1, pullPx / thresholdPx) : 0;
  const visible = refreshing || pullPx > 6;

  return (
    <div
      aria-hidden={!visible}
      className={cn(
        "pointer-events-none absolute left-0 right-0 top-0 z-[60] flex justify-center",
        !visible && "opacity-0"
      )}
      style={{
        height: Math.max(48, pullPx),
        transition: refreshing ? undefined : "height 120ms ease-out",
      }}
    >
      <div
        className={cn(
          "mt-2 flex items-center gap-2 rounded-full border border-blue-600/30 bg-background/95 px-3 py-1.5 text-xs font-medium text-blue-800 shadow-sm backdrop-blur-sm dark:text-blue-100",
          refreshing && "border-blue-600/50"
        )}
        style={{
          transform: `translateY(${refreshing ? 8 : Math.min(pullPx * 0.35, 28)}px)`,
          opacity: refreshing ? 1 : 0.35 + progress * 0.65,
        }}
      >
        <Loader2 className={cn("h-4 w-4 shrink-0", refreshing && "animate-spin")} />
        <span>{refreshing ? "Refreshing…" : progress >= 1 ? "Release to refresh" : "Pull to refresh"}</span>
      </div>
    </div>
  );
}
