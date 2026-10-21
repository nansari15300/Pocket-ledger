
"use client"

import * as React from "react"
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area"

import { cn } from "@/lib/utils"

type ScrollAreaProps = React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root> & {
  /** Master-detail list: gray pill scrollbar — `globals.css` `pl-master-list-scroll` */
  listChrome?: boolean;
  /** Ledger / report txn table vertical scroll — dim gray thumb (`pl-ledger-txn-scroll`) */
  txnChrome?: boolean;
  /** Inter Company voucher — light gray thumb; gutter par border-l nahi (4K black line avoid) */
  icVoucherChrome?: boolean;
  /** Master list touch scroll — layout animation pause (frame drop kam) */
  onViewportScroll?: React.UIEventHandler<HTMLDivElement>;
  onViewportTouchMove?: React.TouchEventHandler<HTMLDivElement>;
};

const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  ScrollAreaProps
>(({ className, children, listChrome, txnChrome, icVoucherChrome, onViewportScroll, onViewportTouchMove, ...props }, ref) => (
  <ScrollAreaPrimitive.Root
    ref={ref}
    className={cn(
      "relative overflow-hidden",
      listChrome && "pl-master-list-scroll",
      txnChrome && "pl-ledger-txn-scroll",
      className
    )}
    {...props}
  >
    <ScrollAreaPrimitive.Viewport
      className="h-full w-full rounded-[inherit]"
      onScroll={onViewportScroll}
      onTouchMove={onViewportTouchMove}
    >
      {children}
    </ScrollAreaPrimitive.Viewport>
    <ScrollBar listChrome={listChrome} txnChrome={txnChrome} icVoucherChrome={icVoucherChrome} />
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaPrimitive.Root>
))
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName

type ScrollBarProps = React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar> & {
  listChrome?: boolean;
  txnChrome?: boolean;
  icVoucherChrome?: boolean;
};

const ScrollBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  ScrollBarProps
>(({ className, orientation = "vertical", listChrome, txnChrome, icVoucherChrome, ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    orientation={orientation}
    className={cn(
      "flex touch-none select-none transition-colors",
      // Uniform app-wide scrollbar: ~6px thumb (8px gutter - 1px padding each side), see "UNIFORM SCROLLBARS" in globals.css
      orientation === "vertical" && "h-full w-2 p-[1px]",
      orientation === "horizontal" && "h-2 flex-col p-[1px]",
      // Gutter sits above the viewport; without this, right-edge controls (e.g. voucher attach) never receive clicks.
      "pointer-events-none",
      listChrome && "pl-master-list-scroll-bar",
      txnChrome && "pl-ledger-txn-scroll-bar",
      icVoucherChrome && "pl-ic-voucher-scroll-bar",
      className
    )}
    {...props}
  >
    <ScrollAreaPrimitive.ScrollAreaThumb
      className={cn(
        "relative flex-1 rounded-full pointer-events-auto pl-uniform-scroll-thumb"
      )}
    />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
))
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName

export { ScrollArea, ScrollBar }
