import { cn } from "@/lib/utils";

/**
 * Pro / pic-4 pill — halka blue/indigo tint; border same family se thoda dark (odd/even).
 * `pl-chrome-btn-drop` sirf 1px + soft shadow; border-color yahan se.
 */
export const chromeProPillCn =
  "pl-chrome-btn-drop border odd:border-blue-300 even:border-indigo-300 odd:bg-blue-100/80 even:bg-indigo-100/80 odd:text-blue-900 even:text-indigo-900 hover:odd:bg-blue-200/80 hover:even:bg-indigo-200/80";

/** Footer span pills — button variant jaisa */
export const chromePillBase = chromeProPillCn;

/** Active / selected pill — green border (Default, Show Narration, view mode, …) */
export const chromePillActive =
  "border-green-600 !bg-green-50/90 !text-green-900 ring-2 ring-green-600/40 odd:border-green-600 even:border-green-600 hover:!bg-green-100/90";

export function chromePillBtn(active?: boolean, className?: string) {
  return cn(chromePillBase, active && chromePillActive, className);
}
