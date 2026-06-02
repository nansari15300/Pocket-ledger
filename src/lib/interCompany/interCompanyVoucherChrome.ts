/**
 * Inter Company voucher — dashboard emerald card tone (Pro theme ribbon).
 */
import { cn } from "@/lib/utils";

/** Dashboard stat card jaisa — panels, attachment/narration cards */
export const interCompanyCardClass = cn(
  "pl-chrome-card pl-chrome-tone-emerald pl-dashboard-ribbon-emerald"
);

/** Payment In / Unapproved sky pill jaisa — fields par; text hamesha black */
const IC_FIELD_BASE = cn(
  "pl-ic-sky-field rounded-md",
  "!border-sky-400/90 !bg-sky-100 text-black shadow-none",
  "placeholder:text-black/45",
  "focus-visible:!border-sky-500 focus-visible:ring-sky-500/25",
  "dark:!border-sky-400/55 dark:!bg-sky-950/35 dark:text-black dark:placeholder:text-black/50"
);

/** Read-only company rows (source/target) — same sky fill as fields */
export const interCompanyIcReadonlyFieldClass = "bg-sky-100/90 dark:bg-sky-950/35";

/** Entity avatar — sky border (fields jaisa); `pl-ic-avatar` = globals override */
export const interCompanyIcAvatarClass = cn(
  "pl-ic-avatar border-2 border-solid border-sky-400/90 bg-sky-100 ring-0",
  "dark:border-sky-400/55 dark:bg-sky-950/35"
);

export const interCompanyIcAvatarFallbackClass =
  "bg-sky-100 font-semibold text-black dark:bg-sky-950/35 dark:text-black";

/** Account section divider */
export const interCompanyIcSectionDividerClass =
  "border-t border-sky-400/50 pt-3 dark:border-sky-400/40";

/** Source/target panel — company → bank → account (create + edit); CSS order in globals */
export const interCompanyVoucherSideRowsClass = "ic-voucher-side-rows flex flex-col gap-3";
export const interCompanyVoucherRowCompanyClass = "ic-voucher-row-company min-w-0";
export const interCompanyVoucherRowBankClass = "ic-voucher-row-bank min-w-0";
export const interCompanyVoucherRowAccountClass = "ic-voucher-row-account min-w-0";

/** Edit/view lock — edit band, par mouse se text select + copy ho sake (`disabled` + `select-none` mat lagao) */
export const interCompanyViewOnlyAllowCopyClass = "select-text";

/** Read-only field — copy-friendly cursor */
export const interCompanyReadOnlyCopyInputClass = "cursor-text select-text";

/** Text inputs, readonly company rows */
export const interCompanyInputClass = cn("h-9", IC_FIELD_BASE);

/** Amount — text length se width; minimum 25mm (mirror grid + field-sizing fallback) */
export const interCompanyAmountInputSizingClass =
  "min-w-[25mm] max-w-full w-auto tabular-nums text-right [field-sizing:content]";

/** Voucher No / Date — lamba stretch na ho; text ke hisaab se, kam se kam 40mm */
export const interCompanyVoucherNumberInputSizingClass =
  "w-auto min-w-[40mm] max-w-full [field-sizing:content]";

/** Date (BS + AD) — voucher no jaisi width */
export const interCompanyDateFieldSizingClass = interCompanyVoucherNumberInputSizingClass;

/** Voucher No + Date — label upar, field niche; dono columns same align */
export const interCompanyVoucherHeaderFieldColClass = cn(
  "flex w-fit max-w-full min-w-0 flex-col gap-1.5"
);

/** @deprecated — use interCompanyVoucherHeaderFieldColClass */
export const interCompanyDateFieldColClass = interCompanyVoucherHeaderFieldColClass;

export const interCompanyVoucherHeaderLabelClass =
  "block text-xs font-medium leading-none text-foreground";

/** Date trigger — Input jaisa rounded-md (pill nahi); sky + black text; border width zaroori (ghost par border hide ho jata) */
export const interCompanyDateButtonClass = cn(
  interCompanyInputClass,
  interCompanyDateFieldSizingClass,
  "border border-solid",
  "inline-flex !h-9 min-h-9 items-center justify-start gap-2 px-3 text-sm shadow-none",
  "rounded-md !rounded-full !rounded-md",
  "font-normal text-black hover:bg-sky-200/70 dark:hover:bg-sky-900/50",
  "[&_svg]:shrink-0 [&_svg]:opacity-50"
);

/** Narration / multi-line notes */
export const interCompanyTextareaClass = cn(
  "min-h-[9rem] max-h-[min(70vh,28rem)] w-full min-w-0 resize-y overflow-y-auto",
  IC_FIELD_BASE
);

/** Voucher column panels (source / target) — scroll niche card border tak */
export const interCompanyPanelClass = cn(
  "flex min-w-0 flex-col overflow-hidden",
  interCompanyCardClass
);

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

/** Select / combobox dropdown panel */
export const interCompanyDropdownContentClass =
  "border-sky-400/80 bg-sky-50/95 text-black dark:border-sky-400/55 dark:bg-sky-950/40 dark:text-black";

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

/** Poora voucher form — Radix vertical scrollbar light gray (`.inter-company-voucher-y-scroll` in globals) */
export const interCompanyVoucherScrollAreaClass = "inter-company-voucher-y-scroll";

/** Source/target card — horizontal scroll; patla light-gray bar card ke niche (`.inter-company-panel-x-scroll`) */
export const interCompanyPanelScrollOuterClass = cn(
  "inter-company-panel-x-scroll",
  "min-w-0 max-w-full flex-1 overflow-x-auto overflow-y-hidden overscroll-x-contain",
  "[-webkit-overflow-scrolling:touch]"
);

/** Panel ke andar — min width; niche padding kam taaki scrollbar card border ke paas rahe */
export const interCompanyPanelScrollInnerClass = cn(
  "flex w-max min-w-full flex-col gap-3 px-3 pt-3 pb-2",
  "min-w-[34rem]"
);

/** Company row: naam | Code | A/c | PAN | Mobile */
export const interCompanyCompanyFieldsRowClass = cn(
  "grid w-full items-end gap-2",
  "grid-cols-[minmax(8.5rem,1fr)_minmax(6.5rem,8rem)_minmax(7rem,9rem)_minmax(6.5rem,8rem)_minmax(7rem,9.5rem)]"
);

/** Account row: Type | naam | A/c | Mobile — text ke hisaab se width; horizontal scroll parent par */
export const interCompanyAccountFieldsRowClass = cn(
  "flex w-max min-w-full flex-nowrap items-end gap-2"
);

/** Chhote screen: 20ch ke baad … ; sm+ par poora text (width content se) */
export const interCompanyIcResponsiveLabelClass =
  "max-w-[20ch] truncate sm:max-w-none sm:overflow-visible sm:whitespace-nowrap";

/** Type Select — fixed grid column nahi; label truncate sirf narrow screen par */
export const interCompanyIcTypeSelectTriggerClass = cn(
  interCompanySelectTriggerClass,
  "h-9 w-auto shrink-0 px-2",
  "[&>span]:max-w-[20ch] [&>span]:truncate sm:[&>span]:max-w-none sm:[&>span]:overflow-visible"
);

/** Account naam Combobox — w-auto; chhote screen par label 20ch ke baad … */
export const interCompanyIcAccountComboboxTriggerClass = cn(
  interCompanyComboboxTriggerClass,
  "h-9 !w-auto shrink-0 px-2",
  "max-sm:[&>span>span]:max-w-[20ch] max-sm:[&>span>span]:truncate sm:[&>span>span]:max-w-none sm:[&>span>span]:overflow-visible"
);

/** A/c No / Mobile — content width; chhote screen par 20ch cap */
export const interCompanyIcInputSizingClass = cn(
  "w-auto min-w-[7ch] max-w-[20ch] truncate sm:max-w-none sm:overflow-visible [field-sizing:content]"
);

/** Scroll row ke andar — column shrink na ho (company naam row) */
export const interCompanyFieldColClass = "shrink-0 space-y-0.5";

/** Account row columns — label upar, control niche (flex-col) */
export const interCompanyAccountFieldColClass = cn(
  "flex min-w-0 shrink flex-col items-stretch justify-end gap-1"
);

/** Account naam — label hamesha combobox ke upar (side-by-side na ho) */
export const interCompanyAccountNameFieldColClass = "flex w-auto min-w-0 flex-col gap-1";
