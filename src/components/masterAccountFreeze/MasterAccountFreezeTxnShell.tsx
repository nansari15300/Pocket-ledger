"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/** Extra vertical room so the -45° banner is not clipped at shell edges. */
const FREEZE_SHELL_BANNER_PAD_PX = 48;

type MasterAccountFreezeTxnShellProps = {
  children: React.ReactNode;
  className?: string;
  /** Full-area diagonal freeze overlay (covers txn list + footer). */
  overlay?: React.ReactNode;
};

function measureFrozenShellMinHeight(shell: HTMLElement): number {
  const content = shell.querySelector<HTMLElement>("[data-pl-freeze-shell-content]");
  const banner = shell.querySelector<HTMLElement>("[data-pl-freeze-banner]");
  const contentHeight = content?.scrollHeight ?? 0;
  const bannerHeight = banner?.getBoundingClientRect().height ?? 0;
  if (bannerHeight <= 0) return contentHeight;
  return Math.max(contentHeight, bannerHeight + FREEZE_SHELL_BANNER_PAD_PX);
}

/** Relative wrapper — full overlay on txn table; grows when frozen so banner is not clipped. */
export function MasterAccountFreezeTxnShell({
  children,
  className,
  overlay,
}: MasterAccountFreezeTxnShellProps) {
  const shellRef = React.useRef<HTMLDivElement>(null);
  const [frozenMinHeightPx, setFrozenMinHeightPx] = React.useState(0);
  const isFrozen = Boolean(overlay);

  React.useLayoutEffect(() => {
    const shell = shellRef.current;
    if (!isFrozen || !shell) {
      setFrozenMinHeightPx(0);
      return;
    }

    const update = () => {
      setFrozenMinHeightPx(measureFrozenShellMinHeight(shell));
    };

    update();

    const ro = new ResizeObserver(update);
    ro.observe(shell);

    const content = shell.querySelector("[data-pl-freeze-shell-content]");
    const banner = shell.querySelector("[data-pl-freeze-banner]");
    if (content) ro.observe(content);
    if (banner) ro.observe(banner);

    return () => ro.disconnect();
  }, [isFrozen, overlay]);

  return (
    <div
      ref={shellRef}
      style={
        isFrozen && frozenMinHeightPx > 0
          ? { minHeight: frozenMinHeightPx }
          : undefined
      }
      className={cn(
        "relative min-h-0 flex flex-1 flex-col",
        isFrozen && frozenMinHeightPx <= 0 && "min-h-[28rem]",
        className
      )}
    >
      {overlay ? (
        <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden [&_[data-pl-master-account-freeze-overlay]]:pointer-events-auto">
          {overlay}
        </div>
      ) : null}
      <div data-pl-freeze-shell-content="" className="relative flex min-h-0 flex-1 flex-col">
        {children}
      </div>
    </div>
  );
}
