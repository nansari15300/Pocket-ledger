/** Opening Balance row edit inside Balance Sheet / Trial Balance ledger popup — z-index + dismiss guard. */

import { cn } from "@/lib/utils";

export type MasterEditPresentationMode = "default" | "nested-ledger";

export const NESTED_LEDGER_MASTER_EDIT_BACKDROP_CN =
  "fixed inset-0 bg-black/45 backdrop-blur-sm z-[100] pointer-events-auto";

export const NESTED_LEDGER_MASTER_EDIT_OVERLAY_CN = "!z-[100]";

export const NESTED_LEDGER_MASTER_EDIT_CONTENT_CN = "!z-[101]";

/** Dialog `!z-[101]` se upar — date/group popovers (calendar Pick a date). */
export const NESTED_LEDGER_MASTER_EDIT_POPOVER_CN = "!z-[110]";

export function masterEditBackdropClassName(
  mode?: MasterEditPresentationMode
): string {
  return mode === "nested-ledger"
    ? NESTED_LEDGER_MASTER_EDIT_BACKDROP_CN
    : "fixed inset-0 bg-black/45 backdrop-blur-sm z-40";
}

export function masterEditPopoverContentClassName(
  mode?: MasterEditPresentationMode,
  ...extra: (string | undefined | false | null)[]
): string {
  return cn(
    mode === "nested-ledger" ? NESTED_LEDGER_MASTER_EDIT_POPOVER_CN : "z-[102]",
    ...extra
  );
}

/** Radix outside dismiss — nested ledger popup ke neeche table click-through band. */
export function guardMasterEditOutsideDismiss(
  mode: MasterEditPresentationMode | undefined,
  e: { preventDefault: () => void },
  nestedSubDialogOpen?: boolean
) {
  if (nestedSubDialogOpen) {
    e.preventDefault();
    return;
  }
  if (mode === "nested-ledger") {
    e.preventDefault();
  }
}
