"use client";

const AUTO_BACKUP_PREFS_KEY = "pl_auto_backup_prefs_v1";

export type AutoBackupFrequency = "off" | "daily" | "weekly";

export type AutoBackupPrefs = {
  enabled: boolean;
  frequency: AutoBackupFrequency;
  includeAttachments: boolean;
  /** Last successful auto backup ms (device local). */
  lastRunAt: number | null;
};

const DEFAULT: AutoBackupPrefs = {
  enabled: false,
  frequency: "off",
  includeAttachments: false,
  lastRunAt: null,
};

export function readAutoBackupPrefs(): AutoBackupPrefs {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = localStorage.getItem(AUTO_BACKUP_PREFS_KEY);
    if (!raw) return DEFAULT;
    const p = JSON.parse(raw) as Partial<AutoBackupPrefs>;
    const frequency: AutoBackupFrequency =
      p.frequency === "daily" || p.frequency === "weekly" ? p.frequency : p.enabled ? "daily" : "off";
    return {
      enabled: p.enabled === true && frequency !== "off",
      frequency: p.enabled ? frequency : "off",
      includeAttachments: p.includeAttachments === true,
      lastRunAt: typeof p.lastRunAt === "number" && Number.isFinite(p.lastRunAt) ? p.lastRunAt : null,
    };
  } catch {
    return DEFAULT;
  }
}

export function saveAutoBackupPrefs(next: AutoBackupPrefs): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(AUTO_BACKUP_PREFS_KEY, JSON.stringify(next));
}

export function autoBackupIntervalMs(frequency: AutoBackupFrequency): number {
  if (frequency === "daily") return 24 * 60 * 60 * 1000;
  if (frequency === "weekly") return 7 * 24 * 60 * 60 * 1000;
  return 0;
}

export function isAutoBackupDue(prefs: AutoBackupPrefs, now = Date.now()): boolean {
  if (!prefs.enabled || prefs.frequency === "off") return false;
  const interval = autoBackupIntervalMs(prefs.frequency);
  if (!interval) return false;
  if (!prefs.lastRunAt) return true;
  return now - prefs.lastRunAt >= interval;
}
