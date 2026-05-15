/**
 * Billing table + profile dropdown: Balance / Usage pills — ek hi styling taaki renew quote match rahe.
 */

/** Balance pill (pink) — `border-2`, width content jitni. */
export const PRORATION_PILL_CREDIT_CLASS =
  "inline-flex w-fit max-w-full flex-wrap items-center justify-center gap-x-1 rounded-full border-2 border-pink-400 bg-pink-100/90 px-2.5 py-0.5 text-center text-xs tabular-nums leading-tight text-pink-950 dark:border-pink-400 dark:bg-pink-950/50 dark:text-pink-50";

/** Snapshot balance (chhoda hua tier) — dashed pink, live quote se alag. */
export const PRORATION_PILL_CREDIT_FROZEN_CLASS =
  "inline-flex w-fit max-w-full flex-wrap items-center justify-center gap-x-1 rounded-full border-2 border-dashed border-pink-500 bg-pink-100/90 px-2.5 py-0.5 text-center text-xs tabular-nums leading-tight text-pink-950 dark:border-pink-400 dark:bg-pink-950/50 dark:text-pink-50";

/** Usage pill — halka green, mota border. */
export const PRORATION_PILL_USAGE_CLASS =
  "inline-flex w-fit max-w-full flex-wrap items-center justify-center gap-x-1 rounded-full border-2 border-emerald-500 bg-emerald-100/90 px-2.5 py-0.5 text-center text-xs tabular-nums leading-tight text-emerald-950 dark:border-emerald-400 dark:bg-emerald-950/50 dark:text-emerald-50";

/** Chhoda hua tier — dashed border; Firestore snapshot, live trailing-year math nahi. */
export const PRORATION_PILL_USAGE_FROZEN_CLASS =
  "inline-flex w-fit max-w-full flex-wrap items-center justify-center gap-x-1 rounded-full border-2 border-dashed border-emerald-600 bg-emerald-100/90 px-2.5 py-0.5 text-center text-xs tabular-nums leading-tight text-emerald-950 dark:border-emerald-400 dark:bg-emerald-950/50 dark:text-emerald-50";

/** Profile Balance row — white fill, black normal-weight text (billing table alag). */
export const PROFILE_PRORATION_PILL_CREDIT_CLASS =
  "inline-flex w-full max-w-full flex-wrap items-center justify-start gap-x-1 rounded-full border-2 border-pink-300 bg-white px-2.5 py-0.5 text-left text-xs font-normal tabular-nums leading-tight text-black shadow-sm dark:border-pink-400 dark:bg-white dark:text-black";

/** Profile Usage — same typography as Balance row. */
export const PROFILE_PRORATION_PILL_USAGE_CLASS =
  "inline-flex w-full max-w-full flex-wrap items-center justify-start gap-x-1 rounded-full border-2 border-emerald-300 bg-white px-2.5 py-0.5 text-left text-xs font-normal tabular-nums leading-tight text-black shadow-sm dark:border-emerald-400 dark:bg-white dark:text-black";

/** Balance pill: adjusted din — UI par hamesha 2 decimal (Usage pill ke `≈ X days` ke saath tally). */
export function formatCreditPillDaysLeftDisplay(days: number): string {
  return Math.max(0, days).toFixed(2);
}

/** Balance pill ~1.00 adjusted ho to "day", warna "days". */
export function creditPillAdjustedDayWord(adjustedDays: number): "day" | "days" {
  return Math.abs(adjustedDays - 1) < 0.005 ? "day" : "days";
}

/** Net ko target yearly par din + gross % — Usage pill line. */
export function formatUsageLineSuffix(netNpr: number, targetYearly: number, grossNpr: number): string {
  let s = "";
  if (targetYearly > 0 && netNpr > 0) {
    const daysEq = (netNpr / targetYearly) * 365;
    if (daysEq < 0.005) s += " · <0.01 days";
    else if (daysEq < 1) s += ` · ≈ ${daysEq.toFixed(2)} days`;
    else {
      const d = Math.round(daysEq);
      s += ` · ≈ ${d} day${d === 1 ? "" : "s"}`;
    }
  } else if (netNpr <= 0) {
    s += " · 0 days";
  }
  if (grossNpr > 0) {
    const pct = (netNpr / grossNpr) * 100;
    const pctStr = pct > 0 && pct < 0.01 ? pct.toFixed(3) : pct.toFixed(2);
    s += ` · ${pctStr}%`;
  }
  return s;
}

/** Profile avatar Usage — chhota net (renew quote) ko `≈ 0 days` taaki naya subscribe confuse na ho; billing table full precision. */
export function formatUsageLineSuffixProfile(netNpr: number, targetYearly: number, grossNpr: number): string {
  let s = "";
  if (targetYearly > 0 && netNpr > 0) {
    const daysEq = (netNpr / targetYearly) * 365;
    // Pehle branch already daysEq < 0.05 ko pakad leta hai — nested micro-branch zaroorat nahi.
    if (daysEq < 0.05) {
      s += " · ≈ 0 days";
    } else if (daysEq < 1) {
      s += ` · ≈ ${daysEq.toFixed(2)} days`;
    } else {
      const d = Math.round(daysEq);
      s += ` · ≈ ${d} day${d === 1 ? "" : "s"}`;
    }
  } else if (netNpr <= 0) {
    s += " · 0 days";
  }
  if (grossNpr > 0) {
    const pct = (netNpr / grossNpr) * 100;
    const pctStr = pct > 0 && pct < 0.01 ? pct.toFixed(3) : pct.toFixed(2);
    s += ` · ${pctStr}%`;
  }
  return s;
}
