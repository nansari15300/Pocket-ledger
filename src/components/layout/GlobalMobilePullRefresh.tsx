"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useIsMobile, isElectronEnvironment } from "@/hooks/use-mobile";
import { useMobileRoutePullRefreshController } from "@/contexts/MobileRoutePullRefreshContext";

const SCROLL_TOP_EPS = 2;
const PULL_CAPTURE_PX = 8;
const REVERSE_CANCEL_PX = 12;
const IGNORED_PULL_SELECTOR =
  '[role="dialog"], [aria-modal="true"], [data-radix-popper-content-wrapper], [data-vaul-drawer], input, textarea, select, [contenteditable="true"]';

type Props = {
  scrollRef: React.RefObject<HTMLElement | null>;
};

type PullSession = {
  startX: number;
  startY: number;
  maxDeltaY: number;
  thresholdPx: number;
  pathname: string;
  scrollChain: HTMLElement[];
  cancelled: boolean;
};

function isVerticallyScrollable(el: HTMLElement): boolean {
  const overflowY = window.getComputedStyle(el).overflowY;
  return (
    (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
    el.scrollHeight > el.clientHeight + 1
  );
}

function collectScrollChain(target: Element, main: HTMLElement): HTMLElement[] {
  const chain: HTMLElement[] = [];
  let current: Element | null = target;
  while (current && main.contains(current)) {
    if (current instanceof HTMLElement && isVerticallyScrollable(current)) {
      chain.push(current);
    }
    if (current === main) break;
    current = current.parentElement;
  }
  const documentScroller = document.scrollingElement;
  if (
    documentScroller instanceof HTMLElement &&
    documentScroller !== main &&
    !chain.includes(documentScroller) &&
    isVerticallyScrollable(documentScroller)
  ) {
    chain.push(documentScroller);
  }
  if (!chain.length) chain.push(main);
  return chain;
}

function allScrollAreasAtTop(chain: HTMLElement[]): boolean {
  return chain.every((el) => el.isConnected && el.scrollTop <= SCROLL_TOP_EPS);
}

function resolvePullThreshold(): number {
  return Math.max(96, Math.min(144, Math.round(window.innerHeight * 0.18)));
}

export function GlobalMobilePullRefresh({ scrollRef }: Props) {
  const pathname = usePathname() || "/";
  const pathnameRef = React.useRef(pathname);
  pathnameRef.current = pathname;
  const isMobile = useIsMobile();
  const { runRefresh } = useMobileRoutePullRefreshController();
  const enabled = isMobile && !isElectronEnvironment();

  const [pullPx, setPullPx] = React.useState(0);
  const pullPxRef = React.useRef(0);
  const [thresholdPx, setThresholdPx] = React.useState(112);
  const [refreshing, setRefreshing] = React.useState(false);
  const refreshingRef = React.useRef(false);
  const [notice, setNotice] = React.useState("");
  const touchRef = React.useRef<PullSession | null>(null);
  const noticeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (!enabled) return;
    let disposed = false;

    const resetPull = () => {
      touchRef.current = null;
      pullPxRef.current = 0;
      setPullPx(0);
    };

    const onTouchStart = (event: TouchEvent) => {
      if (refreshingRef.current || event.touches.length !== 1) return;
      const main = scrollRef.current;
      const target = event.target instanceof Element ? event.target : null;
      if (!main || !target || !main.contains(target) || target.closest(IGNORED_PULL_SELECTOR)) return;

      const touch = event.touches[0];
      if (!touch) return;
      const scrollChain = collectScrollChain(target, main);
      if (!allScrollAreasAtTop(scrollChain)) return;

      const threshold = resolvePullThreshold();
      setThresholdPx(threshold);
      setNotice("");
      pullPxRef.current = 0;
      setPullPx(0);
      touchRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        maxDeltaY: 0,
        thresholdPx: threshold,
        pathname: pathnameRef.current,
        scrollChain,
        cancelled: false,
      };
    };

    const onTouchMove = (event: TouchEvent) => {
      const session = touchRef.current;
      if (!session || session.cancelled || refreshingRef.current) return;
      if (event.touches.length !== 1 || !allScrollAreasAtTop(session.scrollChain)) {
        session.cancelled = true;
        pullPxRef.current = 0;
        setPullPx(0);
        return;
      }

      const touch = event.touches[0];
      if (!touch) return;
      const deltaX = touch.clientX - session.startX;
      const deltaY = touch.clientY - session.startY;
      if (session.maxDeltaY < PULL_CAPTURE_PX && Math.abs(deltaX) > Math.abs(deltaY) + 6) {
        session.cancelled = true;
        pullPxRef.current = 0;
        setPullPx(0);
        return;
      }

      if (session.maxDeltaY > 0 && session.maxDeltaY - deltaY >= REVERSE_CANCEL_PX) {
        session.cancelled = true;
        pullPxRef.current = 0;
        setPullPx(0);
        return;
      }

      session.maxDeltaY = Math.max(session.maxDeltaY, deltaY);
      if (deltaY <= 0) {
        pullPxRef.current = 0;
        setPullPx(0);
        return;
      }

      if (deltaY > PULL_CAPTURE_PX && event.cancelable) event.preventDefault();
      const next = Math.min(deltaY, session.thresholdPx * 1.12);
      pullPxRef.current = next;
      setPullPx(next);
    };

    const waitForUiPaint = () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });

    const finishRefresh = async (session: PullSession | null) => {
      if (!session || session.cancelled || refreshingRef.current) {
        pullPxRef.current = 0;
        setPullPx(0);
        return;
      }

      const pulled = pullPxRef.current;
      pullPxRef.current = 0;
      setPullPx(0);
      if (pulled < session.thresholdPx) return;

      refreshingRef.current = true;
      setRefreshing(true);
      setNotice("");
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
      try {
        await runRefresh(session.pathname);
        await waitForUiPaint();
        if (!disposed) setNotice("Updated");
      } catch {
        if (!disposed) setNotice("Refresh failed · showing saved data");
      } finally {
        refreshingRef.current = false;
        if (!disposed) {
          setRefreshing(false);
          noticeTimerRef.current = setTimeout(() => setNotice(""), 1800);
        }
      }
    };

    const onTouchEnd = () => {
      const session = touchRef.current;
      touchRef.current = null;
      void finishRefresh(session);
    };

    const onTouchCancel = () => {
      resetPull();
    };

    document.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
    document.addEventListener("touchmove", onTouchMove, { capture: true, passive: false });
    document.addEventListener("touchend", onTouchEnd, { capture: true, passive: true });
    document.addEventListener("touchcancel", onTouchCancel, { capture: true, passive: true });

    return () => {
      disposed = true;
      document.removeEventListener("touchstart", onTouchStart, true);
      document.removeEventListener("touchmove", onTouchMove, true);
      document.removeEventListener("touchend", onTouchEnd, true);
      document.removeEventListener("touchcancel", onTouchCancel, true);
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
      resetPull();
      setNotice("");
    };
  }, [enabled, runRefresh, scrollRef]);

  if (!enabled) return null;

  const progress = thresholdPx > 0 ? Math.min(1, pullPx / thresholdPx) : 0;
  const visible = refreshing || !!notice || pullPx > 6;
  const label = refreshing
    ? "Refreshing…"
    : notice || (progress >= 1 ? "Release finger to refresh" : "Pull down to refresh");

  return (
    <div
      aria-hidden={!visible}
      className={cn(
        "pointer-events-none absolute left-0 right-0 top-0 z-[60] flex justify-center",
        !visible && "opacity-0"
      )}
      style={{
        height: visible ? Math.max(48, Math.min(92, 36 + pullPx * 0.45)) : 0,
        transition: refreshing ? undefined : "height 100ms ease-out",
      }}
    >
      <div
        role="status"
        aria-live="polite"
        className={cn(
          "mt-2 flex items-center gap-2 rounded-full border border-blue-600/30 bg-background/95 px-3 py-1.5 text-xs font-medium text-blue-800 shadow-sm backdrop-blur-sm dark:text-blue-100",
          refreshing && "border-blue-600/50"
        )}
        style={{
          transform: `translateY(${refreshing ? 8 : Math.min(pullPx * 0.35, 28)}px)`,
          opacity: refreshing || notice ? 1 : 0.35 + progress * 0.65,
        }}
      >
        <Loader2 className={cn("h-4 w-4 shrink-0", refreshing && "animate-spin")} />
        <span>{label}</span>
      </div>
    </div>
  );
}
