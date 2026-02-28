/**
 * Shared styles for voucher form action buttons (mobile + desktop).
 * Pill shape and consistent disabled appearance across all voucher forms.
 */
export const VOUCHER_BUTTONS_CLASS =
  "[&_button]:h-10 [&_button]:rounded-full [&_button:disabled]:opacity-45 [&_button:disabled]:shadow-[inset_0_4px_12px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(0,0,0,0.25)] [&_button:disabled]:brightness-50 [&_button:disabled]:saturate-50 [&_button:disabled]:scale-[0.98] [&_button:disabled]:cursor-not-allowed [&_button:disabled]:text-opacity-[0.70]";

/** History button (same as mobile) */
export const BTN_HISTORY_CLASS = "bg-sky-600 hover:bg-sky-700 text-white border-0";
/** Save & Print (same as mobile) */
export const BTN_PRINT_CLASS = "bg-amber-600 hover:bg-amber-700 text-white border-0";
/** Cancel (same as mobile) */
export const BTN_CANCEL_CLASS = "bg-pink-300 hover:bg-pink-400 text-pink-950 border-0";
/** Save primary */
export const BTN_SAVE_CLASS = "bg-green-200 hover:bg-green-300 text-green-900 dark:bg-green-800/60 dark:hover:bg-green-700/60 dark:text-green-100 border-0";
/** Save & Approve / Approve (same as mobile) */
export const BTN_APPROVE_CLASS = "bg-emerald-700 hover:bg-emerald-800 text-white border-0 hover:text-white";
