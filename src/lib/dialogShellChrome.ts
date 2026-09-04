import { cn } from "@/lib/utils";

/** Sab popup dialogs — dim green outer shell (R/P dialog jaisa). */
export const DIALOG_SHELL_ATTR = { "data-pl-dialog-shell": "" } as const;

export const DIALOG_SHELL_BORDER_CN =
  "border-2 border-emerald-300/65 dark:border-emerald-700/45";

export const dialogShellClassName = (...extra: (string | undefined)[]) =>
  cn(DIALOG_SHELL_BORDER_CN, ...extra);

/** Inner boxes / category panels — same dim green tone. */
export const DIALOG_DIM_GREEN_BORDER = DIALOG_SHELL_BORDER_CN;
