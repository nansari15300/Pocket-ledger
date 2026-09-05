import { cn } from "@/lib/utils";

/** Sab popup dialogs — dim green outer shell (R/P dialog jaisa). */
export const DIALOG_SHELL_ATTR = { "data-pl-dialog-shell": "" } as const;

export const DIALOG_SHELL_BORDER_CN =
  "border-2 border-emerald-300/65 dark:border-emerald-700/45";

export const dialogShellClassName = (...extra: (string | undefined)[]) =>
  cn(DIALOG_SHELL_BORDER_CN, ...extra);

/** AddVoucherDialog (Edit Trxn): overlay z-[80], content z-[81]. */
export const VOUCHER_EDIT_DIALOG_OVERLAY_CN = "z-[80] bg-black/45 backdrop-blur-sm";
export const VOUCHER_EDIT_DIALOG_CONTENT_CN = "z-[81]";

/** Bill/spend wise link popups opened inside Edit Trxn — stack above voucher edit shell. */
export const NESTED_VOUCHER_LINK_DIALOG_OVERLAY_CN = "z-[90] bg-black/45 backdrop-blur-sm";
export const NESTED_VOUCHER_LINK_DIALOG_CONTENT_CN = "z-[91]";

/** Inner boxes / category panels — same dim green tone. */
export const DIALOG_DIM_GREEN_BORDER = DIALOG_SHELL_BORDER_CN;
