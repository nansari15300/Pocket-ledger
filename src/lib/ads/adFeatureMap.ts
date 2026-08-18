import type { AdSettings, AdUnlockOffer } from "@/lib/adSettings";

/** App screen / route ids that can show a locked-feature rewarded offer. */
export const AD_SCREEN_BY_PATH_PREFIX: ReadonlyArray<{ prefix: string; screenId: string }> = [
  { prefix: "/party", screenId: "party" },
  { prefix: "/bank-cash", screenId: "bank-cash" },
  { prefix: "/staff", screenId: "staff" },
  { prefix: "/tax", screenId: "tax" },
  { prefix: "/incomes", screenId: "incomes" },
  { prefix: "/items", screenId: "items" },
  { prefix: "/reports", screenId: "reports" },
  { prefix: "/gallery", screenId: "gallery" },
  { prefix: "/gate", screenId: "gate" },
  { prefix: "/production", screenId: "production" },
  { prefix: "/sale-note", screenId: "sale-note" },
  { prefix: "/purchase-note", screenId: "purchase-note" },
  { prefix: "/quotations", screenId: "quotations" },
  { prefix: "/messages", screenId: "messages" },
  { prefix: "/backup", screenId: "backup" },
  { prefix: "/import-export", screenId: "import-export" },
];

export function adScreenIdFromPathname(pathname: string | null | undefined): string | null {
  const path = String(pathname || "").split("?")[0]?.split("#")[0] || "";
  for (const row of AD_SCREEN_BY_PATH_PREFIX) {
    if (path === row.prefix || path.startsWith(`${row.prefix}/`)) return row.screenId;
  }
  return null;
}

export function findUnlockOfferForScreen(
  settings: AdSettings,
  screenId: string
): AdUnlockOffer | undefined {
  return settings.unlockOffers.find((offer) => offer.enabled && offer.featureId === screenId);
}

export function findUnlockOfferByFeatureId(
  settings: AdSettings,
  featureId: string
): AdUnlockOffer | undefined {
  return settings.unlockOffers.find((offer) => offer.enabled && offer.featureId === featureId);
}

export function isFeatureLockScreenTicked(settings: AdSettings, screenId: string): boolean {
  return settings.placements.featureLock === true && settings.placements.featureLockScreens.includes(screenId);
}
