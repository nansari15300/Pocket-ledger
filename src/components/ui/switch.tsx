"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

/** Header se align; user: track height + knob length dono ~25% kam — keyframes `tailwind.config` se sync */
const ANIM_MS = 400
const TRACK_H_PX = Math.round(36 * 0.7 * 0.75)
const KNOB_W_PX = Math.round(54 * 0.8 * 0.75)
const KNOB_PAD_PX = 3
const KNOB_LEFT_ON = `calc(100% - ${KNOB_W_PX + KNOB_PAD_PX}px)`

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

    const checked = checkedProp !== undefined ? checkedProp : uncontrolled

    const clearMotionTimer = React.useCallback(() => {
      if (motionTimerRef.current != null) {
        clearTimeout(motionTimerRef.current)
        motionTimerRef.current = null
      }
    }, [])

    React.useEffect(() => () => clearMotionTimer(), [clearMotionTimer])

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
      setChecked(next)
      setMotion(next ? "to-on" : "to-off")
      clearMotionTimer()
      motionTimerRef.current = setTimeout(() => {
        setMotion(null)
        motionTimerRef.current = null
      }, ANIM_MS)
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
          "relative inline-flex w-[88px] shrink-0 cursor-pointer rounded-full border border-neutral-300 bg-white shadow-sm outline-none transition-shadow",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "dark:border-neutral-400 dark:bg-white",
          className
        )}
        style={{ height: TRACK_H_PX }}
        onClick={handleClick}
        {...rest}
      >
        <span className="sr-only">Toggle</span>
        <span
          className={cn(
            "pointer-events-none absolute top-1/2 z-[1] h-[calc(100%-6px)] -translate-y-1/2 rounded-full shadow-sm",
            motion === null && !checked && "bg-neutral-500 dark:bg-neutral-400",
            motion === null && checked && "bg-green-500",
            motion === "to-on" && "animate-file-hover-switch-on bg-green-500",
            motion === "to-off" && "animate-file-hover-switch-off bg-neutral-500 dark:bg-neutral-400"
          )}
          style={
            motion === null
              ? {
                  left: !checked ? `${KNOB_PAD_PX}px` : KNOB_LEFT_ON,
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
