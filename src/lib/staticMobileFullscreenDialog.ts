import { cn } from "@/lib/utils";

/** `build:static` / Capacitor client bundle ma true (NEXT_PUBLIC_STATIC_BUILD). */
export const IS_STATIC_APK = process.env.NEXT_PUBLIC_STATIC_BUILD === "1";

/**
 * Static APK + mobile: voucher/account/item group dialogs poori screen (100dvh).
 * Radix default center + max-w-lg lai override; `cn` ko tailwind-merge le pachhadi ko classes lai priority dinchha.
 */
const STATIC_MOBILE_FULLSCREEN_DIALOG =
  "flex h-[100dvh] max-h-[100dvh] w-full max-w-none !left-0 !top-0 !translate-x-0 !translate-y-0 gap-0 rounded-none border-0 p-0 overflow-hidden";

export function cnStaticMobileFullscreenDialog(
  isMobile: boolean,
  ...classNames: (string | undefined | false | null)[]
): string {
  return cn(...(classNames.filter(Boolean) as string[]), IS_STATIC_APK && isMobile ? STATIC_MOBILE_FULLSCREEN_DIALOG : "");
}
