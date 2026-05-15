/**
 * Device sync tables: Android par Firestore label `Model (android 16)` hota hai —
 * list me sirf model; pura string hover `title` par (mouse / long-press tooltip).
 */

/** Tail jisme sirf Android OS version bracket ho — list view se hatao. */
const ANDROID_OS_TAIL_RE = /\s*\(\s*[Aa]ndroid\s+[^)]*\)\s*$/;

export function shortDeviceLabelForList(label: string | undefined, deviceType?: "mobile" | "desktop"): string {
  let raw = label;
  if (raw === "Chrome (K)") raw = "Chrome (Mobile)";
  const base = raw?.trim() || (deviceType === "mobile" ? "Mobile" : deviceType === "desktop" ? "Desktop" : "Device");
  const trimmed = base.replace(ANDROID_OS_TAIL_RE, "").trim();
  return trimmed.length > 0 ? trimmed : base;
}

/** Short se alag ho to native tooltip ke liye full label (warna undefined = redundant title). */
export function deviceLabelTooltipIfTruncated(label: string | undefined, short: string): string | undefined {
  const full = (label === "Chrome (K)" ? "Chrome (Mobile)" : label)?.trim() ?? "";
  if (!full) return undefined;
  return full !== short ? full : undefined;
}
