import { cn } from "@/lib/utils";

/**
 * Calendar UI chrome in one place: BS/AD panels + month/year dropdown surfaces stay visually consistent.
 * Update CALENDAR_CHROME_BORDER only when changing this style app-wide.
 */
export const CALENDAR_CHROME_BORDER = "border-2 border-blue-600";

/** Outer card around NepaliCalendar / AdCalendar / shadcn Calendar (DayPicker). */
export const calendarPanelClassName = cn(
  "p-3 rounded-lg shadow-md bg-card text-card-foreground w-full",
  CALENDAR_CHROME_BORDER
);

/** Radix Select list for month — same blue frame as calendar panel & year popover. */
export const calendarSelectContentClassName = cn(CALENDAR_CHROME_BORDER, "shadow-md");

/** Popover list (e.g. year “Show more”); add width/padding/z-index in the component. */
export const calendarPopoverSurfaceClassName = cn(CALENDAR_CHROME_BORDER, "shadow-md");

/**
 * Month SelectItem (variant=calendar ke saath): hover/highlight = sirf green border; selected = border + tick (year row jaisa).
 * `SelectItem` default `focus:bg-accent` variant se band — yahan sirf border/bg overrides.
 */
export const calendarMonthSelectItemClassName = cn(
  "!bg-transparent",
  "hover:!bg-transparent hover:!border-green-600",
  "focus:!bg-transparent",
  "data-[highlighted]:!bg-transparent data-[highlighted]:!text-foreground data-[highlighted]:!border-green-600",
  "data-[state=checked]:!border-green-600 data-[state=checked]:!bg-background data-[state=checked]:font-semibold",
  "data-[state=checked]:data-[highlighted]:!border-green-600 data-[state=checked]:data-[highlighted]:!bg-background",
  "[&_svg]:text-green-600"
);
