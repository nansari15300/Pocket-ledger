/**
 * Inter Company voucher — dashboard emerald card tone (Pro theme ribbon).
 */
import { cn } from "@/lib/utils";

/** Dashboard stat card jaisa — panels, attachment/narration cards */
export const interCompanyCardClass = cn(
  "pl-chrome-card pl-chrome-tone-emerald pl-dashboard-ribbon-emerald"
);

const IC_FIELD_BASE =
  "border-emerald-200/70 bg-white/85 text-foreground shadow-none focus-visible:border-emerald-500 focus-visible:ring-emerald-500/30 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:focus-visible:ring-emerald-400/40";

/** Text inputs, readonly company rows */
export const interCompanyInputClass = cn("h-9", IC_FIELD_BASE);

/** Amount — text length se width; minimum 25mm (mirror grid + field-sizing fallback) */
export const interCompanyAmountInputSizingClass =
  "min-w-[25mm] max-w-full w-auto tabular-nums text-right [field-sizing:content]";

/** Narration / multi-line notes */
export const interCompanyTextareaClass = cn(
  "min-h-[9rem] max-h-[min(70vh,28rem)] w-full min-w-0 resize-y overflow-y-auto",
  IC_FIELD_BASE
);

/** Voucher column panels (source / target) */
export const interCompanyPanelClass = cn("min-w-0", interCompanyCardClass);

/** Narration — attachment card ke saath same height (grid stretch + flex fill) */
export const interCompanyNarrationCardClass = cn(
  interCompanyCardClass,
  "flex h-full min-h-0 flex-col p-3 min-w-0"
);

export const interCompanyNarrationTextareaInCardClass = cn(
  "h-full min-h-[5.5rem] w-full min-w-0 flex-1 resize-y overflow-y-auto max-h-[min(50vh,20rem)]",
  IC_FIELD_BASE
);

/** shadcn Select trigger */
export const interCompanySelectTriggerClass = cn("h-9 w-full", IC_FIELD_BASE);

/** Combobox trigger button */
export const interCompanyComboboxTriggerClass = interCompanySelectTriggerClass;

/** Date outline button */
export const interCompanyDateButtonClass = cn(
  "h-9 w-full pl-3 text-left font-normal",
  IC_FIELD_BASE,
  "hover:bg-emerald-100/90 dark:hover:bg-emerald-950/70"
);

/** Select / combobox dropdown panel */
export const interCompanyDropdownContentClass =
  "border-emerald-200/70 bg-emerald-50/90 dark:border-emerald-900/60 dark:bg-emerald-950/40";

/** Invite / Join — setting row cards */
export const interCompanySettingsCardClass = cn(interCompanyCardClass, "rounded-md px-3 py-2");

/** Invite / Join — read-only info strip */
export const interCompanyInfoStripClass = cn(
  interCompanyCardClass,
  "rounded-md px-3 py-2 text-sm text-muted-foreground"
);

/** Invite / Join — scrollable partner / invite lists */
export const interCompanySettingsListClass = cn(
  "overflow-y-auto rounded-md border border-emerald-200/70 bg-white/70 p-2 dark:border-emerald-900/60 dark:bg-emerald-950/30"
);

/** Voucher tab — poora section background (dashboard green) */
export const interCompanyVoucherTabShellClass = cn(
  interCompanyCardClass,
  "space-y-4 rounded-lg p-3 sm:p-4"
);

/** Page header strip (standalone Inter Company page) */
export const interCompanyPageHeaderClass = cn(
  interCompanyCardClass,
  "flex shrink-0 items-center gap-2 border-b-0 px-4 py-2"
);
