"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import {
  SWITCH_ANIM_MS as ANIM_MS,
  SWITCH_KNOB_W_PX as KNOB_W_PX,
  SWITCH_KNOB_PAD_PX as KNOB_PAD_PX,
  SWITCH_KNOB_LEFT_ON as KNOB_LEFT_ON,
  SWITCH_KNOB_LEFT_OFF as KNOB_LEFT_OFF,
  SWITCH_TRACK_H_PX,
  switchKnobMotionClass,
} from "@/lib/switchMotion"

/** Auto voucher strip / header pills: Switch track ke saath same pixel height align karne ke liye export. */
export const SWITCH_TRACK_HEIGHT_PX = SWITCH_TRACK_H_PX

export type SwitchProps = Omit<
  React.ComponentPropsWithoutRef<"button">,
  "role" | "type" | "aria-checked" | "children"
> & {
  /** Controlled */
  checked?: boolean
  /** Uncontrolled initial */
  defaultChecked?: boolean
  onCheckedChange?: (checked: boolean) => void
}

/**
 * Header jaisa: safed track + border, lamba pill knob (length me), green ON / neutral OFF,
 * `file-hover-switch-on/off` motion 400ms — Radix thumb ki jagah custom span (keyframes ke saath).
 */
const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  (
    {
      className,
      checked: checkedProp,
      defaultChecked = false,
      onCheckedChange,
      disabled,
      onClick,
      ...rest
    },
    ref
  ) => {
    const [uncontrolled, setUncontrolled] = React.useState(!!defaultChecked)
    const [motion, setMotion] = React.useState<"to-on" | "to-off" | null>(null)
    const motionTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
    const prevControlledCheckedRef = React.useRef<boolean | undefined>(undefined)
    /** Header `GlobalFileHoverPreviewSwitch` jaisa: click pe turant motion; controlled me effect se duplicate na chale */
    const skipNextPropMotionRef = React.useRef(false)
    const lastClickTargetRef = React.useRef<boolean | null>(null)

    const checked = checkedProp !== undefined ? checkedProp : uncontrolled

    const clearMotionTimer = React.useCallback(() => {
      if (motionTimerRef.current != null) {
        clearTimeout(motionTimerRef.current)
        motionTimerRef.current = null
      }
    }, [])

    const endMotionCycle = React.useCallback(() => {
      setMotion(null)
      skipNextPropMotionRef.current = false
      lastClickTargetRef.current = null
      motionTimerRef.current = null
    }, [])

    React.useEffect(() => () => clearMotionTimer(), [clearMotionTimer])

    /** Sirf parent-driven `checked` (revert / sync) — user click pe motion `handleClick` se hi */
    React.useEffect(() => {
      if (checkedProp === undefined) return
      const prev = prevControlledCheckedRef.current
      if (prev === undefined) {
        prevControlledCheckedRef.current = checkedProp
        return
      }
      if (prev === checkedProp) return

      const optimisticMatch =
        skipNextPropMotionRef.current && lastClickTargetRef.current === checkedProp
      prevControlledCheckedRef.current = checkedProp
      if (optimisticMatch) return

      setMotion(checkedProp ? "to-on" : "to-off")
      clearMotionTimer()
      motionTimerRef.current = setTimeout(() => {
        endMotionCycle()
      }, ANIM_MS)
    }, [checkedProp, clearMotionTimer, endMotionCycle])

    const setChecked = React.useCallback(
      (next: boolean) => {
        if (checkedProp === undefined) setUncontrolled(next)
        onCheckedChange?.(next)
      },
      [checkedProp, onCheckedChange]
    )

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      onClick?.(e)
      if (disabled || e.defaultPrevented) return
      const next = !checked
      // Controlled bhi: header switch jaisa same-frame motion (effect se pehle ek frame jump nahi)
      skipNextPropMotionRef.current = true
      lastClickTargetRef.current = next
      setMotion(next ? "to-on" : "to-off")
      clearMotionTimer()
      motionTimerRef.current = setTimeout(() => {
        endMotionCycle()
      }, ANIM_MS)
      setChecked(next)
    }

    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        ref={ref}
        data-state={checked ? "checked" : "unchecked"}
        className={cn(
          // Toggle track colors: ON dim green theme, OFF gray (global).
          "relative inline-flex w-[88px] shrink-0 cursor-pointer rounded-full border shadow-sm outline-none transition-colors",
          "border-neutral-300 bg-neutral-200",
          "data-[state=checked]:border-green-300 data-[state=checked]:bg-green-100/80",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "dark:border-neutral-500 dark:bg-neutral-700/70 dark:data-[state=checked]:border-green-700 dark:data-[state=checked]:bg-green-900/40",
          className
        )}
        style={{ height: SWITCH_TRACK_H_PX }}
        onClick={handleClick}
        {...rest}
      >
        <span className="sr-only">Toggle</span>
        <span
          className={cn(
            "pointer-events-none absolute top-1/2 z-[1] h-[calc(100%-6px)] -translate-y-1/2 rounded-full shadow-sm",
            motion === null && !checked && "bg-neutral-500 dark:bg-neutral-400",
            // Knob ON: same green family as track (dim, not neon).
            motion === null && checked && "bg-green-400",
            motion === "to-on" && cn(switchKnobMotionClass("file-hover-switch-on"), "bg-green-400"),
            motion === "to-off" && cn(switchKnobMotionClass("file-hover-switch-off"), "bg-neutral-500 dark:bg-neutral-400")
          )}
          style={
            motion === null
              ? {
                  left: !checked ? KNOB_LEFT_OFF : KNOB_LEFT_ON,
                  width: KNOB_W_PX,
                }
              : undefined
          }
          aria-hidden
        />
      </button>
    )
  }
)
Switch.displayName = "Switch"

export { Switch }
