"use client";

import { useState, useEffect, useRef } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddVoucherDialog } from "@/components/vouchers/AddVoucherDialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";

function isCompanySelectOrCreatePath(pathname: string | null): boolean {
  if (!pathname) return false;
  const p = pathname.replace(/\/+$/, "") || "/";
  return p === "/company" || p === "/company/create";
}

export function MobileFloatingButton() {
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [showButton, setShowButton] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastScrollY = useRef(0);
  const mainElementRef = useRef<HTMLElement | null>(null);
  const attachedRef = useRef<Set<HTMLElement | Window>>(new Set());

  useEffect(() => {
    if (!isMobile) return;

    // Find the scroll container: report page transaction list, or main with overflow-y-auto, or window
    const findScrollContainers = (): HTMLElement[] => {
      const list: HTMLElement[] = [];
      const reportScroll = document.querySelector('[data-floating-button-scroll]') as HTMLElement;
      if (reportScroll) list.push(reportScroll);
      const main = document.querySelector('main[class*="overflow-y-auto"]') as HTMLElement;
      if (main && !list.includes(main)) list.push(main);
      return list;
    };

    const reportScrollEl = () => document.querySelector('[data-floating-button-scroll]') as HTMLElement | null;
    const isScrollable = (el: HTMLElement | null) => el && el.scrollHeight > el.clientHeight;

    // On report page when transaction list has no scroll (few items), always show FAB
    const updateReportNoScrollVisibility = () => {
      const report = reportScrollEl();
      if (report && !isScrollable(report)) {
        setShowButton(true);
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      }
    };

    const handleScroll = (scrollTop: number, targetEl?: HTMLElement | null) => {
      const report = reportScrollEl();
      // Party/Group Report: if this container has no scroll, keep button visible
      if (report && targetEl === report && !isScrollable(report)) {
        setShowButton(true);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        lastScrollY.current = scrollTop;
        return;
      }

      const isScrollingDown = scrollTop > lastScrollY.current;
      const isScrollingUp = scrollTop < lastScrollY.current;
      const moved = scrollTop !== lastScrollY.current;

      // Scroll DOWN shows button; scroll UP hides it
      if (isScrollingDown && moved) {
        setShowButton(true);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => setShowButton(false), 3000);
      } else if (isScrollingUp && moved) {
        setShowButton(false);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
      }

      lastScrollY.current = scrollTop;
    };

    const onScroll = (e?: Event) => {
      const target = e?.target as HTMLElement | undefined;
      const scrollTop = target ? target.scrollTop : window.scrollY;
      handleScroll(scrollTop, target);
    };

    const attach = (el: HTMLElement | Window) => {
      if (attachedRef.current.has(el)) return;
      attachedRef.current.add(el);
      if (el === window) window.addEventListener("scroll", onScroll, { passive: true });
      else (el as HTMLElement).addEventListener("scroll", onScroll, { passive: true });
    };
    const detach = (el: HTMLElement | Window) => {
      if (!attachedRef.current.has(el)) return;
      attachedRef.current.delete(el);
      if (el === window) window.removeEventListener("scroll", onScroll);
      else (el as HTMLElement).removeEventListener("scroll", onScroll);
    };

    const containers = findScrollContainers();
    if (containers.length > 0) {
      mainElementRef.current = containers[0];
      containers.forEach((el) => attach(el));
      updateReportNoScrollVisibility();
    } else {
      attach(window);
    }

    const checkInterval = setInterval(() => {
      const next = findScrollContainers();
      next.forEach((el) => attach(el));
      updateReportNoScrollVisibility();
    }, 500);

    return () => {
      clearInterval(checkInterval);
      Array.from(attachedRef.current).forEach((el) => detach(el));
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [isMobile]);

  if (!isMobile || isCompanySelectOrCreatePath(pathname)) {
    return null;
  }

  return (
    <>
      <div className={cn(
        "fixed left-1/2 -translate-x-1/2 z-50",
        "transition-opacity duration-300",
        "bottom-20",
        showButton ? "opacity-100" : "opacity-0 pointer-events-none"
      )}>
        <Button
          size="lg"
          className={cn(
            "h-7 px-4 rounded-full shadow-lg",
            "bg-primary hover:bg-primary/90",
            "flex items-center justify-center gap-1.5",
            "animate-in fade-in zoom-in duration-200"
          )}
          onClick={() => setIsDialogOpen(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          <span className="font-semibold text-xs">Add New</span>
        </Button>
      </div>
      <AddVoucherDialog
        isOpen={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onVoucherCreated={() => {}}
      />
    </>
  );
}
