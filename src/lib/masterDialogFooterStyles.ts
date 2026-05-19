import { cn } from "@/lib/utils";
import { masterDialogFooterChromeClassName } from "@/lib/masterFormPillChrome";

/** Masters + items dialogs: Cancel | beechn action | Save — flex-col-reverse takraane par `!flex-row` */
export const MASTER_DIALOG_FOOTER_ROW_CLASS = cn(
  masterDialogFooterChromeClassName,
  "mt-0 flex w-full !flex-row flex-nowrap shrink-0 items-center gap-2 border-t border-border/80 bg-background/95 py-3"
);

/** Gray filled pill Cancel (`variant="ghost"` ke saath) — vouchers ka pink `BTN_DIALOG_CANCEL_CLASS` yahan na use karo */
export const MASTER_DIALOG_CANCEL_GRAY_PILL_BTN_CLASS = cn(
  "rounded-full border border-slate-300/80 bg-slate-100 px-5 text-sm font-medium text-slate-800 shadow-none transition-colors",
  "hover:bg-slate-200 hover:border-slate-400 hover:text-slate-900 focus-visible:ring-slate-400",
  "dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-slate-500 dark:hover:bg-slate-700",
  "shrink-0"
);

/** Bin confirm `AlertDialogCancel` — shadcn `outline` odd/even blue neutralize */
export const MASTER_ALERT_DIALOG_CANCEL_GRAY_CLASS = cn(
  MASTER_DIALOG_CANCEL_GRAY_PILL_BTN_CLASS,
  "!mt-0 sm:!mt-0",
  "odd:!border-slate-300/80 even:!border-slate-300/80 hover:odd:!border-slate-400 hover:even:!border-slate-400",
  "odd:!bg-slate-100 even:!bg-slate-100 hover:odd:!bg-slate-200 hover:even:!bg-slate-200",
  "odd:!text-slate-800 even:!text-slate-900"
);

/** Purane `@/components/party/partyDialogFooterStyles` imports — sirf naam compatibility */
export const PARTY_DIALOG_CANCEL_GRAY_PILL_BTN_CLASS = MASTER_DIALOG_CANCEL_GRAY_PILL_BTN_CLASS;
export const PARTY_ALERT_DIALOG_CANCEL_GRAY_CLASS = MASTER_ALERT_DIALOG_CANCEL_GRAY_CLASS;
