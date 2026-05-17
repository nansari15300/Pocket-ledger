"use client";

import * as React from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useFileHoverPreview,
  type FilePreviewMode,
} from "@/contexts/FileHoverPreviewContext";
import {
  SWITCH_ANIM_MS,
  SWITCH_KNOB_W_PX,
  SWITCH_KNOB_LEFT_OFF,
  SWITCH_KNOB_LEFT_MID,
  SWITCH_KNOB_LEFT_ON,
  SWITCH_TRACK_H_PX,
  filePreviewModeTransitionMotion,
  switchKnobMotionClass,
  type SwitchKnobMotion,
} from "@/lib/switchMotion";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const MODES: FilePreviewMode[] = ["off", "hover", "click"];

const MODE_LABEL: Record<FilePreviewMode, string> = {
  off: "Off",
  hover: "Hover preview",
  click: "Click preview",
};

/** Header track — compact ke baad +30% (~104/116px); teen zone + i icon ke liye */
const TRACK_WIDTH_CLASS = "w-[6.5rem] min-w-[6.5rem] shrink-0 sm:w-[10.25rem] sm:min-w-[7.25rem]";

const MODE_DETAIL: Record<
  FilePreviewMode,
  { title: string; body: string }
> = {
  off: {
    title: "Off",
    body: "Hovering or clicking voucher, party, or item attachments will not open the preview panel. Use the Preview button where it is shown.",
  },
  hover: {
    title: "Hover preview",
    body: "Rest the pointer on a thumbnail or attachment icon to open the preview panel. Moving the pointer away (for example while scrolling a table) closes the panel.",
  },
  click: {
    title: "Click preview",
    body: "Click or tap an attachment to open the preview panel. After you click inside, it stays open until you click outside. This is also the default on mobile.",
  },
};

/** Resting knob position — motion ke baad */
function knobLeftForMode(mode: FilePreviewMode): string {
  if (mode === "off") return SWITCH_KNOB_LEFT_OFF;
  if (mode === "hover") return SWITCH_KNOB_LEFT_MID;
  return SWITCH_KNOB_LEFT_ON;
}

/** Toggle left/off/hover → i right; toggle right (click) → i left */
function infoIconOnRight(mode: FilePreviewMode): boolean {
  return mode !== "click";
}

/**
 * Header: 3-step file preview switch — chhota track, andar i icon (opposite side), popup me detail.
 */
export function GlobalFileHoverPreviewSwitch({ className }: { className?: string }) {
  const { mode, setMode } = useFileHoverPreview();
  const [knobMotion, setKnobMotion] = React.useState<SwitchKnobMotion | null>(null);
  const [infoOpen, setInfoOpen] = React.useState(false);
  const motionTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearMotionTimer = React.useCallback(() => {
    if (motionTimerRef.current != null) {
      clearTimeout(motionTimerRef.current);
      motionTimerRef.current = null;
    }
  }, []);

  React.useEffect(() => () => clearMotionTimer(), [clearMotionTimer]);

  const pickModeFromClick = React.useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const idx = Math.min(2, Math.max(0, Math.floor(x / (rect.width / 3))));
      return MODES[idx]!;
    },
    []
  );

  const handleTrackClick = React.useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const next = pickModeFromClick(e);
      if (next === mode) return;
      const fromIdx = MODES.indexOf(mode);
      const toIdx = MODES.indexOf(next);
      const motion = filePreviewModeTransitionMotion(fromIdx, toIdx);
      setKnobMotion(motion);
      setMode(next);
      clearMotionTimer();
      motionTimerRef.current = setTimeout(() => {
        setKnobMotion(null);
        motionTimerRef.current = null;
      }, SWITCH_ANIM_MS);
    },
    [mode, pickModeFromClick, setMode, clearMotionTimer]
  );

  const knobTowardActive =
    knobMotion !== null &&
    knobMotion !== "file-hover-switch-off" &&
    knobMotion !== "file-hover-switch-to-off-from-mid";

  const infoRight = infoIconOnRight(mode);

  return (
    <div
      className={cn("inline-flex shrink-0 items-center", className)}
      data-theme-header="global-file-preview"
    >
      <div className={cn("relative", TRACK_WIDTH_CLASS)}>
        <button
          type="button"
          role="radiogroup"
          aria-label="File preview mode"
          title={`${MODE_LABEL[mode]} — tap a zone to change`}
          onClick={handleTrackClick}
          className={cn(
            "relative w-full cursor-pointer rounded-full border shadow-sm outline-none transition-colors",
            "border-neutral-300 bg-neutral-200",
            mode !== "off" && "border-green-300 bg-green-100/80",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            "dark:border-neutral-500 dark:bg-neutral-700/70",
            mode !== "off" && "dark:border-green-700 dark:bg-green-900/40"
          )}
          style={{ height: SWITCH_TRACK_H_PX }}
        >
          {MODES.map((m) => (
            <span
              key={m}
              className="sr-only"
              role="radio"
              aria-checked={mode === m}
              aria-label={MODE_LABEL[m]}
            />
          ))}
          <span
            className={cn(
              "pointer-events-none absolute top-1/2 z-[1] h-[calc(100%-6px)] -translate-y-1/2 rounded-full shadow-sm",
              knobMotion === null && mode === "off" && "bg-neutral-500 dark:bg-neutral-400",
              knobMotion === null && mode !== "off" && "bg-green-400",
              knobMotion !== null &&
                (knobTowardActive ? "bg-green-400" : "bg-neutral-500 dark:bg-neutral-400"),
              switchKnobMotionClass(knobMotion)
            )}
            style={
              knobMotion === null
                ? {
                    left: knobLeftForMode(mode),
                    width: SWITCH_KNOB_W_PX,
                  }
                : undefined
            }
            aria-hidden
          />
          <span className="pointer-events-none absolute inset-y-1 left-1/3 w-px bg-black/10" aria-hidden />
          <span className="pointer-events-none absolute inset-y-1 left-2/3 w-px bg-black/10" aria-hidden />
        </button>

        {/* i icon — knob ke ulte side; click se detail popup (track toggle nahi) */}
        <Popover open={infoOpen} onOpenChange={setInfoOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "absolute top-1/2 z-[2] flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full",
                "text-neutral-600 hover:bg-black/5 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                infoRight ? "right-0.5" : "left-0.5"
              )}
              aria-label="File preview modes — details"
              title="File preview help"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <Info className="h-3.5 w-3.5" strokeWidth={2.25} />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            side="bottom"
            sideOffset={8}
            className="z-[200] w-[min(20rem,calc(100vw-1.5rem))] p-0"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <div className="border-b px-3 py-2">
              <p className="text-sm font-semibold leading-tight">File preview</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Current: <span className="font-medium text-foreground">{MODE_LABEL[mode]}</span>
              </p>
            </div>
            <ul className="space-y-0 divide-y text-sm">
              {MODES.map((m) => (
                <li
                  key={m}
                  className={cn(
                    "px-3 py-2.5",
                    mode === m && "bg-green-50/80 dark:bg-green-950/20"
                  )}
                >
                  <p
                    className={cn(
                      "font-semibold leading-tight",
                      mode === m ? "text-green-800 dark:text-green-300" : "text-foreground"
                    )}
                  >
                    {MODE_DETAIL[m].title}
                    {mode === m ? (
                      <span className="ml-1.5 text-[10px] font-normal text-green-700">(active)</span>
                    ) : null}
                  </p>
                  <p className="mt-1 text-xs leading-snug text-muted-foreground">
                    {MODE_DETAIL[m].body}
                  </p>
                </li>
              ))}
            </ul>
            <p className="border-t px-3 py-2 text-[11px] leading-snug text-muted-foreground">
              Tap a zone on the switch: left Off, middle Hover preview, right Click preview.
            </p>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

