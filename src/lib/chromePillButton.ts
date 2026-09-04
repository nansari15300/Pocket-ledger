import { cn } from "@/lib/utils";

/**
 * Pro / pic-4 pill — ek hi blue tone (detail, group, report header pills match).
 * `pl-chrome-btn-drop` sirf 1px + soft shadow; border-color yahan se.
 */
export const chromeProPillCn =
  "pl-chrome-btn-drop border border-blue-300 bg-blue-100/80 text-blue-900 hover:border-blue-400 hover:bg-blue-200/80";

/** Header chromePill text color — border / bg nahi. */
export const chromeProPillTextCn = "text-blue-900";
/** Same blue family, dimmer — entity/type labels. */
export const chromeProPillTextMutedCn = "text-blue-400";

/** Footer span pills — button variant jaisa */
export const chromePillBase = chromeProPillCn;

/** Active / selected pill — green border (header view-mode pills, …); PC footer toggles is se alag — hamesha blue chrome. */
export const chromePillActive =
  "!border-2 !border-green-600 !bg-green-50/90 !text-green-900 ring-2 ring-green-600/40 hover:!bg-green-100/90";

export function chromePillBtn(active?: boolean, className?: string) {
  return cn(chromePillBase, active && chromePillActive, className);
}
