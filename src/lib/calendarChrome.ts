import { cn } from "@/lib/utils";

/**
 * Calendar UI chrome — BS/AD panels + month/year dropdowns ek hi visual language me (reference app jaisa).
 * Mota neela border + 3D-style shadow (lift + soft blue glow).
 */
export const CALENDAR_CHROME_BORDER = cn(
  "border-[3px] border-blue-600",
  "ring-2 ring-blue-500/35 ring-offset-2 ring-offset-background"
);

/** NepaliCalendar / AdCalendar wrapper — white surface + depth (inset highlight neeche) */
export const calendarPanelClassName = cn(
  "p-3 rounded-xl w-full bg-white text-card-foreground",
  "dark:bg-card",
  CALENDAR_CHROME_BORDER,
  // 3D: neeche gehra shadow, upar halka inset sheen, neela ambient
  "shadow-[0_12px_40px_-8px_rgba(37,99,235,0.22),0_8px_24px_-12px_rgba(0,0,0,0.18),inset_0_1px_0_0_rgba(255,255,255,0.95)]",
  "dark:shadow-[0_12px_40px_-8px_rgba(37,99,235,0.15),0_8px_24px_-12px_rgba(0,0,0,0.4)]"
);

/** Radix Select month list ya year shell ke liye — panel jaisi border */
export const calendarSelectContentClassName = cn(CALENDAR_CHROME_BORDER, "shadow-md");

/** Dusre popovers (year list width) ke liye base surface */
export const calendarPopoverSurfaceClassName = cn(CALENDAR_CHROME_BORDER, "shadow-md");

/**
 * AD `DayPicker` / `YearSelectShowMore` — `AdCalendar` (1950–2100) jaisa.
 * `toYear = current+5` na rakho: initial window `value+5` turant max par aa jata tha,
 * isliye niche "Show more · newer years" (5 saal add) kabhi nahi dikhta tha.
 */
export const AD_PICKER_MIN_YEAR = 1950;
export const AD_PICKER_MAX_YEAR = 2100;

/**
 * Month SelectItem: hover = green border; selected = tick + border (year row pattern).
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
