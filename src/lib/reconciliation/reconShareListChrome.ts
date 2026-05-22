import { cn } from "@/lib/utils";

/** Shared list + search — same full width (search card jitni length). */
export const reconShareListSurfaceCn = "w-full box-border rounded-md border";

/** List/search card shell — dashboard ribbon fill; top ribbon strip nahi (double border avoid). */
export const reconShareListCardCn = cn(
  "pl-recon-share-list-card w-full box-border pl-chrome-card border-2 p-3 space-y-2",
);

/** Shared list tone cycle: green → blue → pink → phir green (dashboard ribbons). */
const reconShareListCardRibbonTones = [
  "pl-recon-share-tone-emerald border-emerald-500/85 pl-dashboard-ribbon-emerald",
  "pl-recon-share-tone-sky border-sky-500/85 pl-dashboard-ribbon-sky",
  "pl-recon-share-tone-rose border-rose-500/85 pl-dashboard-ribbon-rose",
] as const;

/** Search + list cards — index se ribbon tone (0 = green, 1 = blue, 2 = pink, …). */
export function reconShareListCardToneCn(cardIndex: number): string {
  return reconShareListCardRibbonTones[cardIndex % reconShareListCardRibbonTones.length];
}

const reconShareListToneKeys = ["emerald", "sky", "rose"] as const;
export type ReconShareListToneKey = (typeof reconShareListToneKeys)[number];

/** Owned / Other company inner boxes — parent card ke hue se match border. */
export function reconShareListChildCardCn(cardIndex: number): string {
  const tone = reconShareListToneKeys[cardIndex % reconShareListToneKeys.length];
  return cn(
    "pl-recon-share-child-card min-w-0 w-full rounded border bg-muted/30 p-2",
    `pl-recon-share-child-tone-${tone}`,
  );
}
