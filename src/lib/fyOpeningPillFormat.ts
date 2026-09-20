"use client";

export type FyOpeningPillFormat = "short" | "mixed" | "full";

export const FY_OPENING_PILL_FORMAT_KEY = "pocket-ledger:fy-opening-pill-format:v1";
export const FY_OPENING_PILL_FORMAT_CHANGED_EVENT = "pl-fy-opening-pill-format-changed";

export const FY_OPENING_PILL_FORMAT_OPTIONS: Array<{
  value: FyOpeningPillFormat;
  label: string;
  sampleBs: string;
  sampleAd: string;
}> = [
  {
    value: "short",
    label: "Short FY",
    sampleBs: "fy 83-84 opening",
    sampleAd: "fy 26-27 opening",
  },
  {
    value: "mixed",
    label: "Mixed FY",
    sampleBs: "fy 2083-84 opening",
    sampleAd: "fy 2026-27 opening",
  },
  {
    value: "full",
    label: "Full FY",
    sampleBs: "fy 2083-2084 opening",
    sampleAd: "fy 2026-2027 opening",
  },
];

export function parseFyOpeningPillFormat(raw: unknown): FyOpeningPillFormat {
  if (raw === "mixed" || raw === "full" || raw === "short") return raw;
  return "short";
}

export function readFyOpeningPillFormat(): FyOpeningPillFormat {
  if (typeof window === "undefined") return "short";
  try {
    return parseFyOpeningPillFormat(window.localStorage.getItem(FY_OPENING_PILL_FORMAT_KEY));
  } catch {
    return "short";
  }
}

export function writeFyOpeningPillFormat(next: FyOpeningPillFormat): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FY_OPENING_PILL_FORMAT_KEY, next);
    window.dispatchEvent(
      new CustomEvent(FY_OPENING_PILL_FORMAT_CHANGED_EVENT, { detail: { format: next } })
    );
  } catch {
    /* ignore */
  }
}
