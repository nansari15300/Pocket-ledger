export type AdRewardTierId = "seconds20" | "seconds30" | "seconds40" | "seconds60";

/** Temporary unlock targets — maps to app feature / plan gates. */
export type AdUnlockId =
  | "extra_shared_user"
  | "drive_upload"
  | "company_share"
  | "extra_vouchers"
  | "multi_device"
  | "party"
  | "bank_cash"
  | "staff"
  | "tax"
  | "incomes"
  | "items"
  | "reports"
  | "gallery"
  | "gate"
  | "production"
  | "sale_note"
  | "purchase_note"
  | "quotations"
  | "messages"
  | "backup"
  | "import_export"
  | "attachments"
  | "company_slot";

export type AdRewardTier = {
  id: AdRewardTierId;
  label: string;
  minimumSeconds: number;
  points: number;
  enabled: boolean;
};

export type AdUnlockOffer = {
  id: AdUnlockId;
  label: string;
  featureId: string;
  pointsCost: number;
  durationHours: number;
  enabled: boolean;
};

export type AdSettings = {
  enabled: boolean;
  placements: {
    /** Master: offer ads on locked feature screens (only for ticked locations). */
    featureLock: boolean;
    /** App screen / feature ids where a locked-feature ad may appear. */
    featureLockScreens: string[];
    billing: boolean;
    settings: boolean;
  };
  dailyMaxPoints: number;
  /**
   * When ad points / unlock data is written to the server.
   * `0` = Live (immediately after reward). `1`–`12` = delay in hours (device-first, then batch sync).
   */
  serverSyncHours: number;
  rewardTiers: AdRewardTier[];
  unlockOffers: AdUnlockOffer[];
  admob: {
    testMode: boolean;
    rewardedUnitId: string;
  };
  updatedAtMs: number;
};

/** Live = 0; then 1…12 hours. */
export const AD_SERVER_SYNC_HOURS_OPTIONS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

export function normalizeAdServerSyncHours(value: unknown): number {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed < 0) return 12;
  return Math.min(12, parsed);
}

export function adServerSyncLabel(hours: number): string {
  return hours <= 0 ? "Live" : `${hours} hr`;
}

export function adServerSyncIntro(hours: number): string {
  if (hours <= 0) {
    return "Live: after a rewarded ad completes, points and unlock data are written to the server immediately. Stronger anti-cheat, higher Firestore read/write cost.";
  }
  return `${hours} hr: ad rewards stay on the device first, then sync to the server in a batch about every ${hours} hour${hours === 1 ? "" : "s"}. Lower Firebase cost; short window where local-only data could be edited before sync.`;
}

/** Screens / locations where a locked-feature rewarded ad may be shown. */
export const AD_FEATURE_LOCK_SCREENS: ReadonlyArray<{ id: string; label: string }> = [
  { id: "party", label: "Parties" },
  { id: "bank-cash", label: "Bank/Cash" },
  { id: "staff", label: "Staff" },
  { id: "tax", label: "Tax" },
  { id: "incomes", label: "Income & Expense" },
  { id: "items", label: "Items & Service" },
  { id: "reports", label: "Reports" },
  { id: "gallery", label: "Gallery" },
  { id: "gate", label: "Gate" },
  { id: "production", label: "Production" },
  { id: "sale-note", label: "Sale Note" },
  { id: "purchase-note", label: "Purchase Note" },
  { id: "quotations", label: "Quotations" },
  { id: "messages", label: "Messages" },
  { id: "attachments", label: "Attachments" },
  { id: "drive-sync", label: "Google Drive sync" },
  { id: "backup", label: "Backup & Restore" },
  { id: "import-export", label: "Import/Export" },
  { id: "company_share", label: "Company sharing" },
  { id: "shared_users", label: "Shared users" },
  { id: "multi_device", label: "Multi-device" },
  { id: "company_slot", label: "Company slot" },
  { id: "voucher_quota", label: "Voucher quota" },
];

const AD_FEATURE_LOCK_SCREEN_IDS = new Set(AD_FEATURE_LOCK_SCREENS.map((row) => row.id));

export function normalizeFeatureLockScreens(raw: unknown, featureLockEnabled: boolean): string[] {
  if (Array.isArray(raw)) {
    const picked = raw
      .map((id) => String(id || "").trim())
      .filter((id) => AD_FEATURE_LOCK_SCREEN_IDS.has(id));
    return Array.from(new Set(picked));
  }
  // Legacy docs only had featureLock boolean — default to all screens when that was ON.
  return featureLockEnabled ? AD_FEATURE_LOCK_SCREENS.map((row) => row.id) : [];
}

export const AD_SETTINGS_DOC = "app_settings/ad_settings";

export const DEFAULT_AD_SETTINGS: AdSettings = {
  // Critical: ads are opt-in. Existing app behavior remains unchanged until Super Admin enables this.
  enabled: false,
  placements: {
    featureLock: true,
    featureLockScreens: AD_FEATURE_LOCK_SCREENS.map((row) => row.id),
    billing: true,
    settings: false,
  },
  dailyMaxPoints: 100,
  // Default delayed sync — cheaper until Admin chooses Live for stricter control.
  serverSyncHours: 12,
  rewardTiers: [
    { id: "seconds20", label: "20 seconds", minimumSeconds: 20, points: 5, enabled: true },
    { id: "seconds30", label: "30 seconds", minimumSeconds: 30, points: 10, enabled: true },
    { id: "seconds40", label: "40 seconds", minimumSeconds: 40, points: 15, enabled: true },
    { id: "seconds60", label: "60 seconds or more", minimumSeconds: 60, points: 25, enabled: true },
  ],
  unlockOffers: [
    { id: "extra_shared_user", label: "Extra shared user", featureId: "shared_users", pointsCost: 20, durationHours: 24, enabled: true },
    { id: "drive_upload", label: "Google Drive sync", featureId: "drive-sync", pointsCost: 30, durationHours: 24, enabled: true },
    { id: "company_share", label: "Company sharing", featureId: "company_share", pointsCost: 25, durationHours: 24, enabled: true },
    { id: "extra_vouchers", label: "Extra voucher quota", featureId: "voucher_quota", pointsCost: 15, durationHours: 168, enabled: true },
    { id: "attachments", label: "Attachments", featureId: "attachments", pointsCost: 15, durationHours: 24, enabled: false },
    { id: "multi_device", label: "Multi-device access", featureId: "multi_device", pointsCost: 40, durationHours: 24, enabled: true },
    { id: "company_slot", label: "Extra company slot", featureId: "company_slot", pointsCost: 50, durationHours: 24, enabled: true },
    { id: "party", label: "Parties", featureId: "party", pointsCost: 10, durationHours: 24, enabled: false },
    { id: "bank_cash", label: "Bank/Cash", featureId: "bank-cash", pointsCost: 10, durationHours: 24, enabled: false },
    { id: "staff", label: "Staff", featureId: "staff", pointsCost: 10, durationHours: 24, enabled: false },
    { id: "tax", label: "Tax", featureId: "tax", pointsCost: 10, durationHours: 24, enabled: false },
    { id: "incomes", label: "Income & Expense", featureId: "incomes", pointsCost: 15, durationHours: 24, enabled: false },
    { id: "items", label: "Items & Service", featureId: "items", pointsCost: 15, durationHours: 24, enabled: false },
    { id: "reports", label: "Reports", featureId: "reports", pointsCost: 20, durationHours: 24, enabled: true },
    { id: "gallery", label: "Gallery", featureId: "gallery", pointsCost: 10, durationHours: 24, enabled: false },
    { id: "gate", label: "Gate", featureId: "gate", pointsCost: 15, durationHours: 24, enabled: false },
    { id: "production", label: "Production", featureId: "production", pointsCost: 20, durationHours: 24, enabled: false },
    { id: "sale_note", label: "Sale Note", featureId: "sale-note", pointsCost: 15, durationHours: 24, enabled: false },
    { id: "purchase_note", label: "Purchase Note", featureId: "purchase-note", pointsCost: 15, durationHours: 24, enabled: false },
    { id: "quotations", label: "Quotations", featureId: "quotations", pointsCost: 15, durationHours: 24, enabled: false },
    { id: "messages", label: "Messages", featureId: "messages", pointsCost: 10, durationHours: 24, enabled: false },
    { id: "backup", label: "Backup & Restore", featureId: "backup", pointsCost: 25, durationHours: 24, enabled: false },
    { id: "import_export", label: "Import/Export", featureId: "import-export", pointsCost: 20, durationHours: 24, enabled: false },
  ],
  admob: {
    testMode: true,
    rewardedUnitId: "",
  },
  updatedAtMs: 0,
};

/**
 * Formal unlock-offer help text for Admin (i) tooltips.
 * Uses the pts / hrs values currently typed in the fields so the setting is clear.
 */
export function adUnlockIntro(
  id: AdUnlockId,
  pointsCost: number,
  durationHours: number,
  labelFallback = "this feature"
): string {
  const pts = Number.isFinite(pointsCost) ? Math.max(0, Math.floor(pointsCost)) : 0;
  const hrs = Number.isFinite(durationHours) ? Math.max(0, Math.floor(durationHours)) : 0;
  const benefit: Record<AdUnlockId, string> = {
    extra_shared_user:
      "add one extra shared user to a company beyond the active plan limit",
    drive_upload:
      "use Google Drive sync for company backup and cloud file synchronisation",
    company_share:
      "share a company with another device or user",
    extra_vouchers:
      "receive a temporary increase in voucher / entry quota when the plan limit is reached",
    attachments:
      "attach files to vouchers and masters when attachment upload or storage is limited by the plan",
    multi_device:
      "keep the same account signed in on additional devices beyond the plan limit",
    company_slot:
      "open one extra company slot beyond the plan company limit",
    party:
      "use the Parties menu to manage customers and suppliers",
    bank_cash:
      "use Bank/Cash accounts and related cash or bank transactions",
    staff:
      "use the Staff menu for employees and payroll-related entries",
    tax:
      "use Tax features for tax ledgers and tax reports",
    incomes:
      "use Income & Expense tracking",
    items:
      "use the Items & Service catalog for stock and services",
    reports:
      "use Reports, including day book, ledgers, summaries, and related views",
    gallery:
      "use Gallery for voucher and document photos",
    gate:
      "use Gate for vehicle and entry–exit tracking",
    production:
      "use Production for manufacturing and stock conversion",
    sale_note:
      "create and manage Sale Note vouchers",
    purchase_note:
      "create and manage Purchase Note vouchers",
    quotations:
      "create and manage Quotations for estimates and offers",
    messages:
      "use Messages for in-app communication features",
    backup:
      "use Backup & Restore tools",
    import_export:
      "use Import/Export for data transfer",
  };

  const action = benefit[id] || `use ${labelFallback}`;
  return `${pts} pts can provide upto ${hrs} hrs to the user to ${action}.`;
}

/** Switch (i) tip — what applies when this catalog offer is ON or OFF. */
export function adUnlockSwitchIntro(
  id: AdUnlockId,
  enabled: boolean,
  pointsCost: number,
  durationHours: number,
  label: string
): string {
  const pts = Number.isFinite(pointsCost) ? Math.max(0, Math.floor(pointsCost)) : 0;
  const hrs = Number.isFinite(durationHours) ? Math.max(0, Math.floor(durationHours)) : 0;
  const freeUse: Record<AdUnlockId, string> = {
    extra_shared_user:
      "extra shared-user slots stay governed only by the plan; this offer does not add a points gate",
    drive_upload:
      "Google Drive sync stays available only as the plan already allows; this offer does not add a points gate",
    company_share:
      "company sharing stays available only as the plan already allows; this offer does not add a points gate",
    extra_vouchers:
      "voucher quota stays governed only by the plan; this offer does not add a points gate",
    attachments:
      "Attachments remain allowed under normal plan rules — users can add files with no points barrier from ads",
    multi_device:
      "multi-device access stays governed only by the plan; this offer does not add a points gate",
    company_slot:
      "company slots stay governed only by the plan; this offer does not add a points gate",
    party:
      "Parties remain fully allowed — users can add and manage parties with no points barrier from ads",
    bank_cash:
      "Bank/Cash remains fully allowed — users can use bank and cash accounts with no points barrier from ads",
    staff:
      "Staff remains fully allowed — users can use Staff with no points barrier from ads",
    tax:
      "Tax remains fully allowed — users can use Tax with no points barrier from ads",
    incomes:
      "Income & Expense remains fully allowed with no points barrier from ads",
    items:
      "Items & Service remains fully allowed with no points barrier from ads",
    reports:
      "Reports remain fully allowed with no points barrier from ads",
    gallery:
      "Gallery remains fully allowed with no points barrier from ads",
    gate:
      "Gate remains fully allowed with no points barrier from ads",
    production:
      "Production remains fully allowed with no points barrier from ads",
    sale_note:
      "Sale Note remains fully allowed with no points barrier from ads",
    purchase_note:
      "Purchase Note remains fully allowed with no points barrier from ads",
    quotations:
      "Quotations remain fully allowed with no points barrier from ads",
    messages:
      "Messages remain fully allowed with no points barrier from ads",
    backup:
      "Backup & Restore remains fully allowed with no points barrier from ads",
    import_export:
      "Import/Export remains fully allowed with no points barrier from ads",
  };

  if (!enabled) {
    const detail = freeUse[id] || `${label} remains allowed under normal plan rules with no points barrier from ads`;
    return `Switch OFF: this reward offer is inactive. ${detail}.`;
  }

  return `Switch ON: this reward offer is active. When the plan locks ${label}, ${pts} pts can provide upto ${hrs} hrs temporary access for the user.`;
}

function numberInRange(value: unknown, fallback: number, max: number): number {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) ? Math.min(max, Math.max(0, parsed)) : fallback;
}

export function normalizeAdSettings(raw: unknown): AdSettings {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const placements = row.placements && typeof row.placements === "object"
    ? (row.placements as Record<string, unknown>)
    : {};
  const admob = row.admob && typeof row.admob === "object"
    ? (row.admob as Record<string, unknown>)
    : {};
  const rewards = Array.isArray(row.rewardTiers) ? row.rewardTiers : [];
  const offers = Array.isArray(row.unlockOffers) ? row.unlockOffers : [];

  return {
    enabled: row.enabled === true,
    placements: {
      featureLock: placements.featureLock !== false,
      featureLockScreens: normalizeFeatureLockScreens(
        placements.featureLockScreens,
        placements.featureLock !== false
      ),
      billing: placements.billing !== false,
      settings: placements.settings === true,
    },
    dailyMaxPoints: numberInRange(row.dailyMaxPoints, DEFAULT_AD_SETTINGS.dailyMaxPoints, 10_000),
    serverSyncHours: normalizeAdServerSyncHours(
      row.serverSyncHours !== undefined ? row.serverSyncHours : DEFAULT_AD_SETTINGS.serverSyncHours
    ),
    rewardTiers: DEFAULT_AD_SETTINGS.rewardTiers.map((fallback) => {
      const saved = rewards.find((item) => item && typeof item === "object" && (item as { id?: unknown }).id === fallback.id) as Record<string, unknown> | undefined;
      return {
        ...fallback,
        points: numberInRange(saved?.points, fallback.points, 10_000),
        enabled: saved?.enabled !== false,
      };
    }),
    unlockOffers: DEFAULT_AD_SETTINGS.unlockOffers.map((fallback) => {
      const saved = offers.find((item) => item && typeof item === "object" && (item as { id?: unknown }).id === fallback.id) as Record<string, unknown> | undefined;
      return {
        ...fallback,
        pointsCost: numberInRange(saved?.pointsCost, fallback.pointsCost, 100_000),
        durationHours: numberInRange(saved?.durationHours, fallback.durationHours, 8_760),
        // New catalog rows default from DEFAULT; previously saved rows keep saved enabled flag.
        enabled: saved ? saved.enabled !== false : fallback.enabled,
      };
    }),
    admob: {
      testMode: admob.testMode !== false,
      rewardedUnitId: String(admob.rewardedUnitId || "").trim().slice(0, 240),
    },
    updatedAtMs: numberInRange(row.updatedAtMs, 0, Number.MAX_SAFE_INTEGER),
  };
}
