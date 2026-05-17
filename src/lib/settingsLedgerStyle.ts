/**
 * Shared stroke weights: Voucher Settings, admin Plans, aur koi bhi "ledger line" UI.
 * `1.2px` black — transaction table row dividers se match (patla mota, user-tuned).
 */
export const SETTINGS_LEDGER_CARD = "border-[1.2px] border-black";
/** Ledger panel — Pro theme ribbons ke liye `bg-card` zaroori (sirf border se Card detect nahi hota) */
export const SETTINGS_LEDGER_PANEL = "rounded-lg border-[1.2px] border-black bg-card p-3";
/** Prefix row "+" — primary full green se halka (dim); outline odd/even blue band hatao */
export const SETTINGS_LEDGER_ADD_PREFIX_BTN =
  "shrink-0 border border-primary/30 bg-primary/20 text-primary/70 shadow-none hover:bg-primary/35 hover:text-primary/90 odd:border-primary/30 even:border-primary/30 odd:bg-primary/20 even:bg-primary/20 odd:text-primary/70 even:text-primary/70 hover:odd:bg-primary/35 hover:even:bg-primary/35";
export const SETTINGS_LEDGER_BORDER_B = "border-b-[1.2px] border-black";
export const SETTINGS_LEDGER_BORDER_T = "border-t-[1.2px] border-black";
export const SETTINGS_LEDGER_BORDER_L = "border-l-[1.2px] border-black";
/** Horizontal rule (Separator) — height = stroke weight. */
export const SETTINGS_LEDGER_SEPARATOR = "my-4 h-[1.2px] w-full bg-black shrink-0";
export const SETTINGS_LEDGER_DASHED = "border-[1.2px] border-dashed border-black/55";
export const SETTINGS_LEDGER_FIELD = "border-[1.2px] border-black";
