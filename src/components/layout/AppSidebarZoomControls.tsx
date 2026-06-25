"use client";

import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppUiZoom } from "@/hooks/useAppUiZoom";

type Props = {
  sidebarOpen: boolean;
};

/** APK / Capacitor iOS: sidebar me Gallery ke neeche − / + screen zoom. */
export function AppSidebarZoomControls({ sidebarOpen }: Props) {
  const { scale, zoomIn, zoomOut, canZoomIn, canZoomOut } = useAppUiZoom();
  const pctLabel = `${Math.round(scale * 100)}%`;

  return (
    <div
      className={cn(
        "mt-1 flex w-full items-center gap-2 rounded-md border border-border/60 bg-background/40 px-2 py-1.5",
        !sidebarOpen && "justify-center px-1"
      )}
      data-pl-sidebar-zoom
    >
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          zoomOut();
        }}
        disabled={!canZoomOut}
        aria-label="Zoom out"
        title="Zoom out"
      >
        <Minus className="h-4 w-4" />
      </Button>
      {sidebarOpen ? (
        <span className="min-w-0 flex-1 text-center text-xs font-medium tabular-nums text-muted-foreground">
          {pctLabel}
        </span>
      ) : (
        <span className="sr-only">{pctLabel}</span>
      )}
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          zoomIn();
        }}
        disabled={!canZoomIn}
        aria-label="Zoom in"
        title="Zoom in"
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}
