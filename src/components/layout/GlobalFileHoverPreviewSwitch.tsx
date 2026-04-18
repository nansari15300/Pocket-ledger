"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useFileHoverPreview } from "@/contexts/FileHoverPreviewContext";

// User: header hover-preview knob motion 400ms (tailwind `file-hover-switch-*` se sync)
const ANIM_MS = 400;

/** Track height — base ~25px se 25% kam (app `Switch` se same) */
const TRACK_H_PX = Math.round(36 * 0.7 * 0.75);

/** Knob length — base ~43px se 25% kam; keyframes tailwind.config se match */
const KNOB_W_PX = Math.round(54 * 0.8 * 0.75);
const KNOB_PAD_PX = 3;
/** Static ON: left = 100% − pad − knob (`tailwind` keyframes jaisa) */
const KNOB_LEFT_ON = `calc(100% - ${KNOB_W_PX + KNOB_PAD_PX}px)`;

/**
 * Fullscreen icon ke baayein: upar label, neeche track.
 * Motion 400ms linear — tailwind `file-hover-switch-*` duration se sync.
 */
export function GlobalFileHoverPreviewSwitch({ className }: { className?: string }) {
  const { enabled, toggle } = useFileHoverPreview();
  const [motion, setMotion] = React.useState<"to-on" | "to-off" | null>(null);
  const motionTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearMotionTimer = React.useCallback(() => {
    if (motionTimerRef.current != null) {
      clearTimeout(motionTimerRef.current);
      motionTimerRef.current = null;
    }
  }, []);

  React.useEffect(() => () => clearMotionTimer(), [clearMotionTimer]);

  const handleClick = React.useCallback(() => {
    const next = !enabled;
    toggle();
    setMotion(next ? "to-on" : "to-off");
    clearMotionTimer();
    motionTimerRef.current = setTimeout(() => {
      setMotion(null);
      motionTimerRef.current = null;
    }, ANIM_MS);
  }, [enabled, toggle, clearMotionTimer]);

  return (
    <div
      className={cn(
        "inline-flex max-w-[100vw] flex-col items-stretch gap-0.5 shrink-0 text-center",
        className
      )}
      data-theme-header="global-hover-preview"
    >
      {/* Ek line = poori string ki width; neeche switch same width (`w-full`) */}
      {/* User: label pure black (#000) — muted-foreground hata kar contrast */}
      <span className="whitespace-nowrap px-0.5 text-[9px] font-medium leading-tight text-[#000000] sm:text-[10px]">
        Globale Mouse Hover Preview
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        title={enabled ? "Hover preview on" : "Hover preview off"}
        onClick={handleClick}
        className={cn(
          "relative w-full shrink-0 rounded-full border border-neutral-300 bg-white shadow-sm outline-none transition-shadow",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "dark:border-neutral-400 dark:bg-white"
        )}
        style={{ height: TRACK_H_PX }}
      >
        <span className="sr-only">Toggle global mouse hover preview {enabled ? "on" : "off"}</span>
        {/* Knob width animation ke dauran max-width mat band karo */}
        <span
          className={cn(
            "pointer-events-none absolute top-1/2 z-[1] h-[calc(100%-6px)] -translate-y-1/2 rounded-full shadow-sm",
            // OFF knob: black ki jagah neutral gray (readable light/dark dono par)
            motion === null && !enabled && "bg-neutral-500 dark:bg-neutral-400",
            motion === null && enabled && "bg-green-500",
            // Animation ke dauran bhi rang — warna sirf `animate-*` ho to bg missing (tailwind me pehle keyframes define hi nahi the)
            motion === "to-on" && "animate-file-hover-switch-on bg-green-500",
            motion === "to-off" && "animate-file-hover-switch-off bg-neutral-500 dark:bg-neutral-400"
          )}
          style={
            motion === null
              ? {
                  left: !enabled ? `${KNOB_PAD_PX}px` : KNOB_LEFT_ON,
                  width: KNOB_W_PX,
                }
              : undefined
          }
          aria-hidden
        />
      </button>
    </div>
  );
}
