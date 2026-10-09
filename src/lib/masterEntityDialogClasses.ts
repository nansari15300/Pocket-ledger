import { cn } from "@/lib/utils";
import { cnStaticMobileFullscreenDialog } from "@/lib/staticMobileFullscreenDialog";
import {
  NESTED_MASTER_GROUP_DIALOG_CONTENT_CN,
  NESTED_MASTER_GROUP_DIALOG_OVERLAY_CN,
  NESTED_VOUCHER_MASTER_CREATE_CONTENT_CN,
} from "@/lib/dialogShellChrome";

/**
 * Add/Edit master flows (party, bank, staff, tax, expense, item):
 * max ~90vh, flex min-h-0, inner scroll; static APK + mobile = fullscreen via cnStatic.
 */
/** Portal master dialogs — Pro: emerald dashboard card shell; fields gray (`globals.css`) */
export const masterEntityFormChromeClassName =
  "pl-master-entity-form-chrome pl-dashboard-ribbon-emerald border-black";

const MASTER_ENTITY_BASE =
  `${NESTED_VOUCHER_MASTER_CREATE_CONTENT_CN} max-h-[85vh] w-[98vw] max-w-[98vw] flex min-h-0 flex-col rounded-xl px-0.5 sm:max-h-[90vh] sm:w-full sm:px-6`;

export const masterEntityDialogHeaderClassName = "shrink-0";
export const masterEntityDialogFormWrapperClassName =
  "flex min-h-0 flex-1 flex-col overflow-hidden py-0";

export function cnMasterEntityDialogContent(
  isMobile: boolean,
  ...extra: (string | undefined | false | null)[]
): string {
  return cn(
    cnStaticMobileFullscreenDialog(isMobile, MASTER_ENTITY_BASE, "sm:max-w-3xl"),
    masterEntityFormChromeClassName,
    ...(extra as string[])
  );
}

/** Group-only short dialogs: same 90vh cap, `sm:max-w-md` */
export function cnMasterEntityNarrowDialogContent(
  isMobile: boolean,
  ...extra: (string | undefined | false | null)[]
): string {
  return cn(
    cnStaticMobileFullscreenDialog(isMobile, MASTER_ENTITY_BASE, "sm:max-w-md"),
    masterEntityFormChromeClassName,
    ...(extra as string[])
  );
}

const MASTER_NESTED_GROUP_DIALOG_BASE = `${NESTED_MASTER_GROUP_DIALOG_CONTENT_CN} max-h-[85vh] w-[98vw] max-w-[98vw] flex min-h-0 flex-col rounded-xl px-0.5 sm:max-h-none sm:w-full sm:max-w-md sm:grid sm:flex-none sm:px-6`;

/** Create Group from party/bank/staff/etc. master form — stack above parent z-[93]. */
export function masterEntityNestedGroupDialogShell(
  isMobile: boolean,
  ...extraContentClass: (string | undefined | false | null)[]
) {
  return {
    overlayClassName: NESTED_MASTER_GROUP_DIALOG_OVERLAY_CN,
    className: cn(
      cnStaticMobileFullscreenDialog(isMobile, MASTER_NESTED_GROUP_DIALOG_BASE),
      masterEntityFormChromeClassName,
      ...(extraContentClass as string[])
    ),
  };
}
