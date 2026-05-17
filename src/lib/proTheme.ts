/**
 * "Pro" background theme — dashboard jaisa har container alag ribbon fill;
 * saare themes par line 1px black (`globals.css`); Default = white containers, Pro = ribbon colors.
 */

export const PRO_THEME_CLASS = "theme-pro" as const;
export const PRO_PRIMARY_CLASS = "primary-pro" as const;

/** Settings → Theme picker — pehli row */
export const PRO_THEME_DISPLAY_NAME = "Pro";

/** Pro: containers ke baahar page/shell — gray (cards andar colorful) */
export const PRO_PAGE_SURFACE_BG = "hsl(220 14% 96%)";


/** Purana "Default Light" — sirf white + 1px black lines */
export const LIGHT_THEME_DISPLAY_NAME = "Light";

/** Dashboard `FinancialSummaryCards` / Device sync — same rotate order */
export const PRO_DASHBOARD_RIBBON_CYCLE = [
  "pl-dashboard-ribbon-emerald",
  "pl-dashboard-ribbon-sky",
  "pl-dashboard-ribbon-violet",
  "pl-dashboard-ribbon-amber",
  "pl-dashboard-ribbon-rose",
  "pl-dashboard-ribbon-teal",
  "pl-dashboard-ribbon-indigo",
] as const;

export const PRO_DASHBOARD_RIBBON_BORDER_CYCLE = [
  "border-emerald-300/70",
  "border-sky-300/70",
  "border-violet-300/70",
  "border-amber-300/70",
  "border-rose-300/70",
  "border-teal-300/70",
  "border-indigo-300/70",
] as const;

/** Card / section index se dashboard ribbon class (Manage Devices pattern) */
export function proDashboardRibbonClass(index: number): string {
  const i = ((index % PRO_DASHBOARD_RIBBON_CYCLE.length) + PRO_DASHBOARD_RIBBON_CYCLE.length) % PRO_DASHBOARD_RIBBON_CYCLE.length;
  return `${PRO_DASHBOARD_RIBBON_BORDER_CYCLE[i]} ${PRO_DASHBOARD_RIBBON_CYCLE[i]}`;
}
