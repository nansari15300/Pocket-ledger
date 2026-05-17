
"use client"

import * as React from "react"
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area"

import { cn } from "@/lib/utils"

type ScrollAreaProps = React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root> & {
  /** Master-detail list: gray pill scrollbar — `globals.css` `pl-master-list-scroll` */
  listChrome?: boolean;
};

const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  ScrollAreaProps
>(({ className, children, listChrome, ...props }, ref) => (
  <ScrollAreaPrimitive.Root
    ref={ref}
    className={cn("relative overflow-hidden", listChrome && "pl-master-list-scroll", className)}
    {...props}
  >
    <ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit]">
      {children}
    </ScrollAreaPrimitive.Viewport>
    <ScrollBar listChrome={listChrome} />
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaPrimitive.Root>
))
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName

type ScrollBarProps = React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar> & {
  listChrome?: boolean;
};

const ScrollBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  ScrollBarProps
>(({ className, orientation = "vertical", listChrome, ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    orientation={orientation}
    className={cn(
      "flex touch-none select-none transition-colors",
      orientation === "vertical" &&
        (listChrome ? "h-full w-2.5 border-l border-l-transparent p-0.5" : "h-full w-2.5 border-l border-l-transparent p-[1px]"),
      orientation === "horizontal" &&
        (listChrome ? "h-2.5 flex-col border-t border-t-transparent p-0.5" : "h-2.5 flex-col border-t border-t-transparent p-[1px]"),
      // Gutter sits above the viewport; without this, right-edge controls (e.g. voucher attach) never receive clicks.
      "pointer-events-none",
      listChrome && "pl-master-list-scroll-bar",
      className
    )}
    {...props}
  >
    <ScrollAreaPrimitive.ScrollAreaThumb
      className={cn(
        "relative flex-1 rounded-full pointer-events-auto",
        listChrome
          ? "bg-[#a6a6a6] hover:bg-[#8f8f8f]"
          : "bg-border"
      )}
    />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
))
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName

export { ScrollArea, ScrollBar }
