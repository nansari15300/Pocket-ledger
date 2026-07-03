"use client";

import * as React from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProfileMenuOpen, type ProfileMenuOpenMode } from "@/contexts/ProfileMenuOpenContext";
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

const MODES: ProfileMenuOpenMode[] = ["off", "hover", "click"];

const MODE_LABEL: Record<ProfileMenuOpenMode, string> = {
  off: "Off",
  hover: "Hover open",
  click: "Click open",
};

const TRACK_WIDTH_CLASS = "w-[6.5rem] min-w-[6.5rem] shrink-0 sm:w-[10.25rem] sm:min-w-[7.25rem]";

const MODE_DETAIL: Record<ProfileMenuOpenMode, { title: string; body: string }> = {
  off: {
    title: "Off",
    body: "Profile plan menu sirf avatar par click se khulega — mouse le jane par auto open nahi hoga.",
  },
  hover: {
    title: "Hover open",
    body: "Avatar par mouse le jate hi plan menu khul jayega (pehle wala behavior).",
  },
  click: {
    title: "Click open",
    body: "Plan menu sirf avatar click par khulega — hover par nahi.",
  },
};

function knobLeftForMode(mode: ProfileMenuOpenMode): string {
  if (mode === "off") return SWITCH_KNOB_LEFT_OFF;
  if (mode === "hover") return SWITCH_KNOB_LEFT_MID;
  return SWITCH_KNOB_LEFT_ON;
}

function infoIconOnRight(mode: ProfileMenuOpenMode): boolean {
  return mode !== "click";
}

/** Header: profile plan menu — Off / Hover / Click (file preview switch jaisa). */
export function GlobalProfileMenuOpenSwitch({ className }: { className?: string }) {
  const { mode, setMode } = useProfileMenuOpen();
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

  const pickModeFromClick = React.useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const idx = Math.min(2, Math.max(0, Math.floor(x / (rect.width / 3))));
    return MODES[idx]!;
  }, []);

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
    <div className={cn("inline-flex shrink-0 items-center", className)} data-theme-header="global-profile-menu">
      <div className={cn("relative", TRACK_WIDTH_CLASS)}>
        <button
          type="button"
          role="radiogroup"
          aria-label="Profile menu open mode"
          title={`${MODE_LABEL[mode]} — tap a zone to change`}
          onClick={handleTrackClick}
          data-pl-header-profile-menu-switch
          data-profile-menu-mode={mode}
          className={cn(
            "relative w-full cursor-pointer rounded-full border-2 shadow-sm outline-none transition-colors",
            "border-sky-300 bg-sky-50",
            mode !== "off" && "border-sky-400 bg-sky-100",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            "dark:border-sky-600 dark:bg-sky-950/35",
            mode !== "off" && "dark:border-sky-500 dark:bg-sky-900/45"
          )}
          style={{ height: SWITCH_TRACK_H_PX }}
        >
          <span
            className={cn(
              "pointer-events-none absolute top-1/2 z-[1] h-[calc(100%-6px)] -translate-y-1/2 rounded-full shadow-sm",
              knobMotion === null && mode === "off" && "bg-neutral-500 dark:bg-neutral-400",
              knobMotion === null && mode !== "off" && "bg-sky-400",
              knobMotion !== null &&
                (knobTowardActive ? "bg-sky-400" : "bg-neutral-500 dark:bg-neutral-400"),
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

        <Popover open={infoOpen} onOpenChange={setInfoOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "absolute inset-y-0 z-[2] flex w-5 items-center justify-center rounded-full border-0 bg-transparent shadow-none",
                "text-sky-400 hover:bg-sky-100/50 hover:text-sky-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300",
                infoRight ? "right-0" : "left-0"
              )}
              aria-label="Profile menu modes — details"
              title="Profile menu help"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <Info className="size-3.5 shrink-0 -translate-y-0.5" strokeWidth={2.25} />
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
              <p className="text-sm font-semibold leading-tight">Profile menu</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Current: <span className="font-medium text-foreground">{MODE_LABEL[mode]}</span>
              </p>
            </div>
            <ul className="space-y-0 divide-y text-sm">
              {MODES.map((m) => (
                <li key={m} className={cn("px-3 py-2.5", mode === m && "bg-sky-50/80 dark:bg-sky-950/20")}>
                  <p className={cn("font-semibold leading-tight", mode === m ? "text-sky-800 dark:text-sky-300" : "text-foreground")}>
                    {MODE_DETAIL[m].title}
                  </p>
                  <p className="mt-1 text-xs leading-snug text-muted-foreground">{MODE_DETAIL[m].body}</p>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
