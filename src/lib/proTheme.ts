/**
 * "Pro" background theme — dashboard jaisa har container alag ribbon fill;
 * saare themes par line 1px black (`globals.css`); Default = white containers, Pro = ribbon colors.
 */

import { cn } from "@/lib/utils";

export const PRO_THEME_CLASS = "theme-pro" as const;
export const PRO_PRIMARY_CLASS = "primary-pro" as const;

/** Naya install / khali localStorage — Light theme default (Pro band). */
export const LIGHT_THEME_CLASS = "theme-pure-white" as const;
export const LIGHT_PRIMARY_CLASS = "primary-pure-white" as const;
export const DEFAULT_THEME_CLASS = LIGHT_THEME_CLASS;
export const DEFAULT_PRIMARY_CLASS = LIGHT_PRIMARY_CLASS;

/** Settings → Theme picker — pehli row */
export const PRO_THEME_DISPLAY_NAME = "Pro";

/** Pro: containers ke baahar page/shell — gray (cards andar colorful) */
export const PRO_PAGE_SURFACE_BG = "hsl(220 14% 96%)";


/** Purana "Default Light" — sirf white + 1px black lines */
export const LIGHT_THEME_DISPLAY_NAME = "Light";

/** Dashboard summary cards — theme CSS me colored border (black outline se alag). */
export const PL_DASHBOARD_TONE_CARD = "pl-dashboard-tone-card" as const;

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

const PRO_DASHBOARD_TONE_KEYS = [
  "emerald",
  "sky",
  "violet",
  "amber",
  "rose",
  "teal",
  "indigo",
] as const;

/** Tailwind border hint — asli rang `globals.css` `.pl-dashboard-tone-*` se. */
export const PRO_DASHBOARD_RIBBON_BORDER_CYCLE = [
  "border-emerald-500/85",
  "border-sky-500/85",
  "border-violet-500/85",
  "border-amber-500/85",
  "border-rose-500/85",
  "border-teal-500/85",
  "border-indigo-500/85",
] as const;

/** Card / section index se dashboard ribbon + card-color border (recon share jaisa bold hue). */
export function proDashboardRibbonClass(index: number): string {
  const i =
    ((index % PRO_DASHBOARD_RIBBON_CYCLE.length) + PRO_DASHBOARD_RIBBON_CYCLE.length) %
    PRO_DASHBOARD_RIBBON_CYCLE.length;
  return cn(
    PL_DASHBOARD_TONE_CARD,
    "border-2",
    PRO_DASHBOARD_RIBBON_BORDER_CYCLE[i],
    PRO_DASHBOARD_RIBBON_CYCLE[i],
    `pl-dashboard-tone-${PRO_DASHBOARD_TONE_KEYS[i]}`,
  );
}
