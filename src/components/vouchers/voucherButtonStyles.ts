/**
 * Shared styles for voucher form action buttons (mobile + desktop).
 * Pill shape and consistent disabled appearance across all voucher forms.
 */
export const VOUCHER_BUTTONS_CLASS =
  "[&_button]:h-10 [&_button]:rounded-full [&_button:disabled]:opacity-45 [&_button:disabled]:shadow-[inset_0_4px_12px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(0,0,0,0.25)] [&_button:disabled]:brightness-50 [&_button:disabled]:saturate-50 [&_button:disabled]:scale-[0.98] [&_button:disabled]:cursor-not-allowed [&_button:disabled]:text-opacity-[0.70]";

/** History button – gray (mobile & PC same) */
export const BTN_HISTORY_CLASS = "bg-gray-500 hover:bg-gray-600 text-white border-0";
/** Save & Print – Sky Blue (mobile & PC same) */
export const BTN_PRINT_CLASS = "bg-sky-500 hover:bg-sky-600 text-white border-0";
/** Cancel – pink (mobile & PC same) */
export const BTN_CANCEL_CLASS = "bg-pink-500 hover:bg-pink-600 text-white border-0";
/** Save & New – Dim Green (mobile & PC same) */
export const BTN_SAVE_NEW_CLASS = "bg-green-800 hover:bg-green-900 text-white border-0";
/** Save – green (mobile & PC same) */
export const BTN_SAVE_CLASS = "bg-green-600 hover:bg-green-700 text-white border-0";
/** Save & Approve / Approve – distinct color (mobile & PC same) */
export const BTN_APPROVE_CLASS = "bg-violet-600 hover:bg-violet-700 text-white border-0";

/**
 * Narration / note body: user can drag-resize vertically + scroll when tall — PC static (Electron) dialog + ScrollArea me bhi poora text.
 * Web jaisa behaviour; max height viewport bound taaki dialog overflow na toot jaye.
 */
export const VOUCHER_NARRATION_TEXTAREA_CLASS =
  "min-h-[9rem] max-h-[min(70vh,28rem)] w-full min-w-0 resize-y overflow-y-auto";

/** Mobile 3-col attach: square `h-24 w-24` — Payment In ke Add / preview jaisa (pehle `w-full` = lamba rectangle). */
export const VOUCHER_MOBILE_ATTACH_TILE_SLOT = "relative h-24 w-24 shrink-0";
export const VOUCHER_MOBILE_ATTACH_PREVIEW_CLASS =
  "h-24 w-24 max-h-24 max-w-24 shrink-0 overflow-hidden";
export const VOUCHER_MOBILE_ATTACH_ADD_SURFACE_CLASS =
  "h-full w-full border-2 border-dashed rounded-md flex flex-col items-center justify-center transition-colors";

/** Desktop flex-wrap: square preview — `w-full` hata (full row stretch); Payment In = `h-24 w-24` */
export const VOUCHER_DESKTOP_ATTACH_TILE_SLOT = "relative h-24 w-24 shrink-0";
export const VOUCHER_DESKTOP_ATTACH_PREVIEW_CLASS =
  "h-24 w-24 max-h-24 max-w-24 shrink-0 overflow-hidden";
export const VOUCHER_DESKTOP_ATTACH_ADD_SURFACE_CLASS =
  "h-full w-full border-2 border-dashed rounded-lg flex flex-col items-center justify-center transition-colors";

/** Create/Edit dialog footers: Cancel — voucher `BTN_CANCEL_CLASS` jaisi pink pill (dusre actions ke saath height match). */
export const BTN_DIALOG_CANCEL_CLASS =
  "bg-pink-500 hover:bg-pink-600 text-white border-0 rounded-full h-10 shrink-0 px-6";
