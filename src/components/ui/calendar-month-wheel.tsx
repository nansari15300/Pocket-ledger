"use client";

/**
 * Month picker: infinite vertical "carousel" + 3D-ish perspective; mouse wheel = 1 notch → 1 row step (discrete);
 * parent month sirf row **click** se — center lane par aane se auto-select nahi.
 */
import * as React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { calendarSelectContentClassName } from "@/lib/calendarChrome";
import { Check, ChevronDown } from "lucide-react";

const ITEM_H = 40;
/** Viewport height — wheel list area (+50% vs original 200px). */
const VIEW_H = 300;
/** Top/bottom padding so first/last month can scroll to center (VIEW_H/2 − row/2). */
const PAD_CENTER = VIEW_H / 2 - ITEM_H / 2;
/** Fade bands scale with taller wheel */
const FADE_H = Math.round(VIEW_H * 0.12);
const MONTH_COUNT = 12;
/** Repeated month strips — jump in middle copies for endless scroll. */
const COPIES = 5;
const ONE_SET = MONTH_COUNT * ITEM_H;
const TOTAL_ITEMS = MONTH_COUNT * COPIES;
export type CalendarMonthWheelProps = {
  labels: readonly string[];
  /** 0 = January / Baisakh index — always 0..11 here; parent maps BS to m+1. */
  monthIndex: number;
  onMonthIndexChange: (monthIndex: number) => void;
  disabled?: boolean;
  /** Match legacy month SelectTrigger (year picker ke saath align). */
  triggerClassName?: string;
};

function clampMonthIndex(i: number): number {
  const m = i % MONTH_COUNT;
  return m < 0 ? m + MONTH_COUNT : m;
}

function middleCopyScrollRow(monthIndex: number): number {
  const mid = Math.floor(COPIES / 2);
  return mid * MONTH_COUNT + clampMonthIndex(monthIndex);
}

/** Click / scroll ke liye: current position se sabse paas wala copy (kam jump, loop stable). */
function nearestRowForMonth(scrollTopPx: number, monthIdx: number): number {
  const mi = clampMonthIndex(monthIdx);
  let bestRow = middleCopyScrollRow(mi);
  let bestDist = Math.abs(bestRow * ITEM_H - scrollTopPx);
  for (let c = 0; c < COPIES; c++) {
    const row = c * MONTH_COUNT + mi;
    const d = Math.abs(row * ITEM_H - scrollTopPx);
    if (d < bestDist) {
      bestDist = d;
      bestRow = row;
    }
  }
  return bestRow;
}

export function CalendarMonthWheel({
  labels,
  monthIndex,
  onMonthIndexChange,
  disabled,
  triggerClassName,
}: CalendarMonthWheelProps) {
  const safeIndex = clampMonthIndex(monthIndex);
  const [open, setOpen] = React.useState(false);
  const viewportRef = React.useRef<HTMLDivElement>(null);
  /** Wheel listener hataane ke liye — popover band / remount par leak na ho. */
  const wheelTeardownRef = React.useRef<(() => void) | null>(null);
  /** Radix / hamari jump scroll par debounce snap na chale. */
  const programmaticScrollRef = React.useRef(false);
  /** Popover portal mount ke baad pehla layout kabhi `scrollTop` set hone se pehle paint ho jata — snap galat month commit na kare. */
  const positioningRef = React.useRef(false);
  const positioningEndTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Row click → smooth scroll; is dauran snap/jump band (warna flicker / galat commit). */
  const clickAnimatingRef = React.useRef(false);
  const clickFinishTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [scrollTop, setScrollTop] = React.useState(0);
  const snapTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const labelForTrigger = labels[safeIndex] ?? labels[0];

  const jumpIfNearEdge = React.useCallback((el: HTMLDivElement) => {
    const st = el.scrollTop;
    const low = ONE_SET * 0.28;
    const high = ONE_SET * (COPIES - 1.28);
    if (st < low) {
      programmaticScrollRef.current = true;
      el.scrollTop = st + ONE_SET * 2;
      requestAnimationFrame(() => {
        programmaticScrollRef.current = false;
      });
    } else if (st > high) {
      programmaticScrollRef.current = true;
      el.scrollTop = st - ONE_SET * 2;
      requestAnimationFrame(() => {
        programmaticScrollRef.current = false;
      });
    }
  }, []);

  const scrollCenterRowToTop = React.useCallback((row: number) => {
    const el = viewportRef.current;
    if (!el) return;
    const target = row * ITEM_H;
    programmaticScrollRef.current = true;
    el.scrollTop = target;
    // DOM turant sync — render wala center row galat na ho (Chaitra dikhe, Baisakh highlight na)
    setScrollTop(el.scrollTop);
    requestAnimationFrame(() => {
      programmaticScrollRef.current = false;
    });
  }, []);

  // Khulte hi sahi row par scroll: portal + layout ke baad 1–2 frame retry; warna scrollTop=0 reh jata = uper blank + Baisakh center.
  React.useLayoutEffect(() => {
    if (!open) {
      positioningRef.current = false;
      clickAnimatingRef.current = false;
      if (clickFinishTimerRef.current) {
        clearTimeout(clickFinishTimerRef.current);
        clickFinishTimerRef.current = null;
      }
      if (positioningEndTimerRef.current) {
        clearTimeout(positioningEndTimerRef.current);
        positioningEndTimerRef.current = null;
      }
      if (snapTimerRef.current) {
        clearTimeout(snapTimerRef.current);
        snapTimerRef.current = null;
      }
      return;
    }
    positioningRef.current = true;
    if (snapTimerRef.current) {
      clearTimeout(snapTimerRef.current);
      snapTimerRef.current = null;
    }
    const row = middleCopyScrollRow(safeIndex);
    const focusLater = () => viewportRef.current?.focus({ preventScroll: true });

    const apply = () => {
      const el = viewportRef.current;
      if (!el) return;
      const target = row * ITEM_H;
      programmaticScrollRef.current = true;
      el.scrollTop = target;
      setScrollTop(el.scrollTop);
      requestAnimationFrame(() => {
        programmaticScrollRef.current = false;
      });
    };

    apply();
    const r1 = requestAnimationFrame(() => {
      apply();
      requestAnimationFrame(() => {
        apply();
        focusLater();
        if (positioningEndTimerRef.current) clearTimeout(positioningEndTimerRef.current);
        positioningEndTimerRef.current = setTimeout(() => {
          positioningEndTimerRef.current = null;
          positioningRef.current = false;
        }, 220);
      });
    });

    return () => {
      cancelAnimationFrame(r1);
      if (positioningEndTimerRef.current) {
        clearTimeout(positioningEndTimerRef.current);
        positioningEndTimerRef.current = null;
      }
      positioningRef.current = false;
    };
  }, [open, safeIndex]);

  // Sirf pehli layout pass: scroll galat ho to ek baar seedha — baad mein user scroll overwrite na ho.
  React.useEffect(() => {
    if (!open) return;
    const el = viewportRef.current;
    if (!el) return;
    let disconnected = false;
    let ran = false;
    const row = middleCopyScrollRow(safeIndex);
    const target = row * ITEM_H;
    const ro = new ResizeObserver(() => {
      if (disconnected || ran || clickAnimatingRef.current || positioningRef.current) return;
      if (el.clientHeight < 40 || el.scrollHeight < el.clientHeight + ITEM_H) return;
      if (Math.abs(el.scrollTop - target) <= 8) {
        ran = true;
        return;
      }
      programmaticScrollRef.current = true;
      el.scrollTop = target;
      setScrollTop(el.scrollTop);
      requestAnimationFrame(() => {
        programmaticScrollRef.current = false;
      });
      ran = true;
    });
    ro.observe(el);
    return () => {
      disconnected = true;
      ro.disconnect();
    };
  }, [open, safeIndex]);

  // useLayoutEffect: portal mount ke baad ref set; useEffect(null ref) wheel miss karta tha — isliye dheema scroll dikhta hi nahi tha.
  React.useLayoutEffect(() => {
    if (!open) {
      wheelTeardownRef.current?.();
      wheelTeardownRef.current = null;
      return;
    }
    let cancelled = false;
    const bind = (): boolean => {
      const el = viewportRef.current;
      if (!el || cancelled) return false;
      wheelTeardownRef.current?.();
      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (positioningRef.current || clickAnimatingRef.current) return;
        if (e.deltaY === 0) return;
        // Har wheel notch ≈ 1 event: 1 month row up/down (pixel delta ignore).
        const dir = e.deltaY > 0 ? 1 : -1;
        const k = Math.round(el.scrollTop / ITEM_H);
        let nextK = k + dir;
        const maxST = Math.max(0, el.scrollHeight - el.clientHeight);
        const maxRow = Math.max(0, Math.floor(maxST / ITEM_H));
        nextK = Math.max(0, Math.min(maxRow, nextK));
        el.scrollTop = Math.min(nextK * ITEM_H, maxST);
      };
      el.addEventListener("wheel", onWheel, { passive: false, capture: true });
      wheelTeardownRef.current = () =>
        el.removeEventListener("wheel", onWheel, { capture: true });
      return true;
    };
    if (!bind()) {
      const id = requestAnimationFrame(() => {
        if (!cancelled) bind();
      });
      return () => {
        cancelled = true;
        cancelAnimationFrame(id);
        wheelTeardownRef.current?.();
        wheelTeardownRef.current = null;
      };
    }
    return () => {
      cancelled = true;
      wheelTeardownRef.current?.();
      wheelTeardownRef.current = null;
    };
  }, [open]);

  /** Scroll rukne par sirf snap row — `onMonthIndexChange` nahi (select = click only). */
  const scheduleSnapOnly = React.useCallback(() => {
    if (positioningRef.current || clickAnimatingRef.current) return;
    if (snapTimerRef.current) clearTimeout(snapTimerRef.current);
    snapTimerRef.current = setTimeout(() => {
      snapTimerRef.current = null;
      if (programmaticScrollRef.current || positioningRef.current) return;
      const el = viewportRef.current;
      if (!el) return;
      const k = Math.round(el.scrollTop / ITEM_H);
      const snapped = k * ITEM_H;
      if (Math.abs(el.scrollTop - snapped) > 0.5) {
        programmaticScrollRef.current = true;
        el.scrollTop = snapped;
        setScrollTop(snapped);
        requestAnimationFrame(() => {
          programmaticScrollRef.current = false;
        });
      }
    }, 140);
  }, []);

  const onScrollViewport = React.useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    setScrollTop(el.scrollTop);
    if (positioningRef.current || clickAnimatingRef.current) return;
    if (!programmaticScrollRef.current) {
      jumpIfNearEdge(el);
    }
    scheduleSnapOnly();
  }, [jumpIfNearEdge, scheduleSnapOnly]);

  /** Kisi aur month par click: smooth center → parent update → popover band (spinner = iOS-style pick). */
  const onRowPointerPick = React.useCallback(
    (mi: number) => {
      const el = viewportRef.current;
      if (!el) return;
      const targetRow = nearestRowForMonth(el.scrollTop, mi);
      const targetTop = targetRow * ITEM_H;
      const k = Math.round(el.scrollTop / ITEM_H);
      if (clampMonthIndex(k) === mi && Math.abs(el.scrollTop - k * ITEM_H) < 3) {
        onMonthIndexChange(mi);
        setOpen(false);
        return;
      }
      if (snapTimerRef.current) {
        clearTimeout(snapTimerRef.current);
        snapTimerRef.current = null;
      }
      clickAnimatingRef.current = true;
      if (clickFinishTimerRef.current) clearTimeout(clickFinishTimerRef.current);
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        if (clickFinishTimerRef.current) {
          clearTimeout(clickFinishTimerRef.current);
          clickFinishTimerRef.current = null;
        }
        clickAnimatingRef.current = false;
        if (!viewportRef.current) return;
        const v = viewportRef.current;
        const snapped = Math.round(v.scrollTop / ITEM_H) * ITEM_H;
        programmaticScrollRef.current = true;
        v.scrollTop = snapped;
        setScrollTop(v.scrollTop);
        requestAnimationFrame(() => {
          programmaticScrollRef.current = false;
        });
        onMonthIndexChange(mi);
        setOpen(false);
      };
      el.scrollTo({ top: targetTop, behavior: "smooth" });
      el.addEventListener("scrollend", finish, { once: true });
      clickFinishTimerRef.current = setTimeout(finish, 480);
    },
    [onMonthIndexChange]
  );

  React.useEffect(() => () => {
    if (snapTimerRef.current) clearTimeout(snapTimerRef.current);
  }, []);

  /** Arrow keys: sirf scroll / snap — commit nahi (click jaisa rule). */
  const nudgeRow = React.useCallback(
    (delta: number) => {
      const el = viewportRef.current;
      if (!el) return;
      const k = Math.round(el.scrollTop / ITEM_H);
      scrollCenterRowToTop(k + delta);
    },
    [scrollCenterRowToTop]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            // YearSelectShowMore / purana SelectTrigger: same footprint
            "w-[120px] h-8 text-sm justify-between px-3 font-normal",
            triggerClassName
          )}
        >
          <span className="truncate">{labelForTrigger}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn("p-0 z-[120] w-[min(180px,85vw)]", calendarSelectContentClassName)}
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {/* Faint top/bottom fades — center lane zyada readable (3D wheel depth cue). */}
        <div className="relative rounded-[inherit] overflow-hidden">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-popover to-transparent"
            style={{ height: FADE_H }}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-popover to-transparent"
            style={{ height: FADE_H }}
            aria-hidden
          />

          {/* perspective yahan: scroll container par nahi — overflow clip 3D kam todta hai */}
          <div
            className="rounded-[inherit]"
            style={{ perspective: "520px", perspectiveOrigin: "50% 50%" }}
          >
          <div
            ref={viewportRef}
            role="listbox"
            tabIndex={0}
            aria-activedescendant={open ? "calendar-month-wheel-active" : undefined}
            onScroll={onScrollViewport}
            onKeyDown={(e) => {
              if (e.key === "ArrowUp") {
                e.preventDefault();
                nudgeRow(-1);
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                nudgeRow(1);
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
            className={cn(
              "overflow-y-auto overflow-x-hidden outline-none",
              "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            )}
            style={{
              height: VIEW_H,
              // touch ko browser dedo; wheel ko sirf hamara listener (ref callback)
              overscrollBehaviorY: "contain",
            }}
          >
            <div style={{ paddingTop: PAD_CENTER, paddingBottom: PAD_CENTER }}>
              {(() => {
                const centerFloat =
                  (scrollTop + VIEW_H / 2 - PAD_CENTER - ITEM_H / 2) / ITEM_H;
                const centerRowIdx = Math.max(
                  0,
                  Math.min(TOTAL_ITEMS - 1, Math.round(centerFloat))
                );
                return Array.from({ length: TOTAL_ITEMS }, (_, i) => {
                const mi = i % MONTH_COUNT;
                const label = labels[mi] ?? String(mi);
                const itemTop = PAD_CENTER + i * ITEM_H;
                const itemCenter = itemTop + ITEM_H / 2;
                const viewCenter = scrollTop + VIEW_H / 2;
                const deltaRows = (itemCenter - viewCenter) / ITEM_H;
                const rotateX = Math.max(-56, Math.min(56, -deltaRows * 14));
                const scale = Math.max(0.82, 1 - Math.min(1, Math.abs(deltaRows) * 0.07));
                const opacity = Math.max(0.45, 1 - Math.min(1, Math.abs(deltaRows) * 0.14));
                const isGeometricCenter = i === centerRowIdx;
                /** Poora select UI sirf jab committed month center lane par ho; warna halqa slot = preview. */
                const showFullSelect = isGeometricCenter && mi === safeIndex;

                return (
                  <div
                    key={i}
                    id={isGeometricCenter ? "calendar-month-wheel-active" : undefined}
                    role="option"
                    aria-selected={showFullSelect}
                    className={cn(
                      "mx-auto flex w-[calc(100%-12px)] shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full border-2 px-2 text-sm transition-[border-color,font-weight] duration-100",
                      showFullSelect &&
                        "border-green-600 bg-background font-semibold text-foreground shadow-sm",
                      isGeometricCenter &&
                        !showFullSelect &&
                        "border-green-600/45 bg-background/80 text-foreground",
                      !isGeometricCenter && "border-transparent text-foreground hover:border-green-600"
                    )}
                    onClick={() => onRowPointerPick(mi)}
                    style={{
                      height: ITEM_H,
                      transform: `translateZ(-${Math.abs(deltaRows) * 8}px) rotateX(${rotateX}deg) scale(${scale})`,
                      opacity,
                      transformStyle: "preserve-3d",
                    }}
                  >
                    {showFullSelect ? (
                      <Check className="h-3.5 w-3.5 shrink-0 text-green-600" aria-hidden />
                    ) : (
                      <span className="w-3.5 shrink-0" aria-hidden />
                    )}
                    <span className="truncate">{label}</span>
                  </div>
                );
              });
              })()}
            </div>
          </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
