import { cn } from "@/lib/utils";
import { cnStaticMobileFullscreenDialog } from "@/lib/staticMobileFullscreenDialog";

/**
 * Add/Edit master flows (party, bank, staff, tax, expense, item):
 * max ~90vh, flex min-h-0, inner scroll; static APK + mobile = fullscreen via cnStatic.
 */
const MASTER_ENTITY_BASE =
  "z-50 max-h-[85vh] w-[98vw] max-w-[98vw] flex min-h-0 flex-col rounded-xl px-0.5 sm:max-h-[90vh] sm:w-full sm:px-6";

export const masterEntityDialogHeaderClassName = "shrink-0";
export const masterEntityDialogFormWrapperClassName =
  "flex min-h-0 flex-1 flex-col overflow-hidden py-0";

export function cnMasterEntityDialogContent(
  isMobile: boolean,
  ...extra: (string | undefined | false | null)[]
): string {
  return cn(
    cnStaticMobileFullscreenDialog(isMobile, MASTER_ENTITY_BASE, "sm:max-w-3xl"),
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
    ...(extra as string[])
  );
}
