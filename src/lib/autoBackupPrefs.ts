"use client";

import type { CompanyBackupIntent, CompanyBackupSourceMode } from "@/lib/companyBackupCore";
import { isBackupSaveLocationConfigured } from "@/lib/backupSaveLocation";
import { normalizeRestoreAllowedGmailList } from "@/lib/backupRestoreAccess";
import { isEmbeddedOfflinePreloadClient } from "@/lib/isEmbeddedOfflinePreloadClient";

const AUTO_BACKUP_PREFS_KEY = "pl_auto_backup_prefs_v2";

export type AutoBackupFrequency = "off" | "daily" | "weekly";

/** daily = har din; weekly = ek weekday; custom = chune hue din. */
export type AutoBackupScheduleMode = "daily" | "weekly" | "custom";

export type AutoBackupCompanySettings = {
  backupSourceMode: CompanyBackupSourceMode;
  backupIntent: CompanyBackupIntent;
  includeAttachments: boolean;
  /** Gmail addresses allowed to restore backups created for this company. */
  restoreAllowedGmails?: string[];
  /** @deprecated migrated to restoreAllowedGmails */
  restoreAllowedGmail?: string;
};

export type AutoBackupPrefs = {
  enabled: boolean;
  frequency: AutoBackupFrequency;
  scheduleMode: AutoBackupScheduleMode;
  /** 0=Sun … 6=Sat — weekly: pehla entry; custom: saare selected days. */
  weekdays: number[];
  /** Local device time HH:mm (24h). */
  runTimeLocal: string;
  includeAttachments: boolean;
  lastRunAt: number | null;
  lastRunByCompanyId: Record<string, number>;
  companyIds: string[];
  /** Per-company auto backup source + attachment prefs. */
  companySettingsById: Record<string, AutoBackupCompanySettings>;
};

const DEFAULT: AutoBackupPrefs = {
  enabled: false,
  frequency: "off",
  scheduleMode: "daily",
  weekdays: [1],
  runTimeLocal: "02:00",
  includeAttachments: false,
  lastRunAt: null,
  lastRunByCompanyId: {},
  companyIds: [],
  companySettingsById: {},
};

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export const ALL_AUTO_BACKUP_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

export function autoBackupWeekdayLabel(day: number): string {
  return WEEKDAY_LABELS[((day % 7) + 7) % 7] ?? "Day";
}

export function isAllAutoBackupWeekdaysSelected(weekdays: number[]): boolean {
  return ALL_AUTO_BACKUP_WEEKDAYS.every((d) => weekdays.includes(d));
}

/** Weekly/custom, ya daily jab saare 7 din tick hon (auto daily switch). */
export function shouldShowAutoBackupWeekdayPicker(prefs: AutoBackupPrefs): boolean {
  if (!prefs.enabled) return false;
  if (prefs.scheduleMode === "weekly" || prefs.scheduleMode === "custom") return true;
  return prefs.scheduleMode === "daily" && isAllAutoBackupWeekdaysSelected(prefs.weekdays);
}

export function isAutoBackupWeekdayChecked(prefs: AutoBackupPrefs, day: number): boolean {
  const d = ((day % 7) + 7) % 7;
  if (prefs.scheduleMode === "weekly") return (prefs.weekdays[0] ?? 1) === d;
  if (prefs.scheduleMode === "daily" && isAllAutoBackupWeekdaysSelected(prefs.weekdays)) return true;
  return prefs.weekdays.includes(d);
}

export function toggleAutoBackupWeekday(prefs: AutoBackupPrefs, day: number, checked: boolean): AutoBackupPrefs {
  const d = ((day % 7) + 7) % 7;

  if (prefs.scheduleMode === "weekly") {
    if (!checked) return prefs;
    return { ...prefs, weekdays: [d] };
  }

  const baseSet = new Set(
    prefs.scheduleMode === "daily" && isAllAutoBackupWeekdaysSelected(prefs.weekdays)
      ? [...ALL_AUTO_BACKUP_WEEKDAYS]
      : prefs.weekdays
  );

  if (checked) {
    baseSet.add(d);
  } else {
    if (baseSet.size <= 1 && baseSet.has(d)) return prefs;
    baseSet.delete(d);
  }

  const weekdays = [...baseSet].sort((a, b) => a - b);

  if (isAllAutoBackupWeekdaysSelected(weekdays)) {
    return {
      ...prefs,
      scheduleMode: "daily",
      frequency: prefs.enabled ? "daily" : prefs.frequency,
      weekdays: [...ALL_AUTO_BACKUP_WEEKDAYS],
    };
  }

  return {
    ...prefs,
    scheduleMode: "custom",
    frequency: prefs.enabled ? "daily" : prefs.frequency,
    weekdays,
  };
}

function normalizeWeekdays(raw: unknown, scheduleMode: AutoBackupScheduleMode = "daily"): number[] {
  if (!Array.isArray(raw)) return scheduleMode === "daily" ? [] : [1];
  const out: number[] = [];
  const seen = new Set<number>();
  for (const d of raw) {
    const n = Number(d);
    if (!Number.isFinite(n) || n < 0 || n > 6 || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  if (!out.length) return scheduleMode === "daily" ? [] : [1];
  return out;
}

function normalizeRunTimeLocal(raw: unknown): string {
  const s = String(raw || "").trim();
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return DEFAULT.runTimeLocal;
  const h = Math.min(23, Math.max(0, Number(m[1])));
  const min = Math.min(59, Math.max(0, Number(m[2])));
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function migrateV1(raw: string): AutoBackupPrefs | null {
  try {
    const p = JSON.parse(raw) as Partial<AutoBackupPrefs & { frequency?: string }>;
    if (p.scheduleMode || p.runTimeLocal || p.companyIds) return null;
    const frequency: AutoBackupFrequency =
      p.frequency === "daily" || p.frequency === "weekly" ? p.frequency : p.enabled ? "daily" : "off";
    return {
      ...DEFAULT,
      enabled: p.enabled === true && frequency !== "off",
      frequency: p.enabled ? frequency : "off",
      scheduleMode: frequency === "weekly" ? "weekly" : "daily",
      weekdays: frequency === "weekly" ? [0] : [1],
      includeAttachments: p.includeAttachments === true,
      lastRunAt: typeof p.lastRunAt === "number" && Number.isFinite(p.lastRunAt) ? p.lastRunAt : null,
      companySettingsById: {},
    };
  } catch {
    return null;
  }
}

export function readAutoBackupPrefs(): AutoBackupPrefs {
  if (typeof window === "undefined") return DEFAULT;
  try {
    let raw = localStorage.getItem(AUTO_BACKUP_PREFS_KEY);
    if (!raw) {
      raw = localStorage.getItem("pl_auto_backup_prefs_v1");
      const migrated = raw ? migrateV1(raw) : null;
      if (migrated) {
        saveAutoBackupPrefs(migrated);
        return migrated;
      }
      return DEFAULT;
    }
    const p = JSON.parse(raw) as Partial<AutoBackupPrefs>;
    const frequency: AutoBackupFrequency =
      p.frequency === "daily" || p.frequency === "weekly" ? p.frequency : p.enabled ? "daily" : "off";
    const scheduleMode: AutoBackupScheduleMode =
      p.scheduleMode === "weekly" || p.scheduleMode === "custom" || p.scheduleMode === "daily"
        ? p.scheduleMode
        : frequency === "weekly"
          ? "weekly"
          : "daily";
    return {
      enabled: p.enabled === true && frequency !== "off",
      frequency: p.enabled ? frequency : "off",
      scheduleMode,
      weekdays: normalizeWeekdays(p.weekdays, scheduleMode),
      runTimeLocal: normalizeRunTimeLocal(p.runTimeLocal),
      includeAttachments: p.includeAttachments === true,
      lastRunAt: typeof p.lastRunAt === "number" && Number.isFinite(p.lastRunAt) ? p.lastRunAt : null,
      lastRunByCompanyId:
        p.lastRunByCompanyId && typeof p.lastRunByCompanyId === "object"
          ? (p.lastRunByCompanyId as Record<string, number>)
          : {},
      companyIds: Array.isArray(p.companyIds)
        ? [...new Set(p.companyIds.map((id) => String(id || "").trim()).filter(Boolean))].slice(0, 200)
        : [],
      companySettingsById: (() => {
        const rawMap = (p as { companySettingsById?: Record<string, unknown> }).companySettingsById;
        if (!rawMap || typeof rawMap !== "object") return {};
        const out: Record<string, AutoBackupCompanySettings> = {};
        for (const [id, row] of Object.entries(rawMap)) {
          const cid = String(id || "").trim();
          const norm = normalizeCompanySettings(row);
          if (cid && norm) out[cid] = norm;
        }
        return out;
      })(),
    };
  } catch {
    return DEFAULT;
  }
}

export function saveAutoBackupPrefs(next: AutoBackupPrefs): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(AUTO_BACKUP_PREFS_KEY, JSON.stringify(next));
}

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseRunTimeLocal(runTimeLocal: string): { hour: number; minute: number } {
  const [h, m] = runTimeLocal.split(":").map(Number);
  return { hour: Number.isFinite(h) ? h : 2, minute: Number.isFinite(m) ? m : 0 };
}

export function isPastAutoBackupRunTimeToday(runTimeLocal: string, now = new Date()): boolean {
  const { hour, minute } = parseRunTimeLocal(runTimeLocal);
  const h = now.getHours();
  const min = now.getMinutes();
  return h > hour || (h === hour && min >= minute);
}

export function isAutoBackupScheduledToday(prefs: AutoBackupPrefs, now = new Date()): boolean {
  const day = now.getDay();
  if (prefs.scheduleMode === "custom") {
    return prefs.weekdays.includes(day);
  }
  if (prefs.scheduleMode === "weekly") {
    return day === (prefs.weekdays[0] ?? 0);
  }
  return true;
}

export function isAutoBackupDueForCompany(
  prefs: AutoBackupPrefs,
  companyId: string,
  now = new Date()
): boolean {
  if (!prefs.enabled || prefs.frequency === "off") return false;
  if (!isBackupSaveLocationConfigured()) return false;
  if (!isAutoBackupScheduledToday(prefs, now)) return false;
  if (!isPastAutoBackupRunTimeToday(prefs.runTimeLocal, now)) return false;

  const cid = String(companyId || "").trim();
  if (!cid) return false;
  if (prefs.companyIds.length > 0 && !prefs.companyIds.includes(cid)) return false;

  const last = prefs.lastRunByCompanyId[cid] ?? prefs.lastRunAt;
  if (!last) return true;
  const lastDate = localDateKey(new Date(last));
  const today = localDateKey(now);
  if (prefs.scheduleMode === "weekly") {
    return lastDate !== today;
  }
  return lastDate !== today;
}

/** Legacy scheduler interval check — ab time + weekday based. */
export function isAutoBackupDue(prefs: AutoBackupPrefs, now = Date.now()): boolean {
  if (!prefs.enabled || prefs.frequency === "off") return false;
  if (!isBackupSaveLocationConfigured()) return false;
  const d = new Date(now);
  if (!isAutoBackupScheduledToday(prefs, d)) return false;
  if (!isPastAutoBackupRunTimeToday(prefs.runTimeLocal, d)) return false;
  if (prefs.companyIds.length === 0) return true;
  return prefs.companyIds.some((id) => isAutoBackupDueForCompany(prefs, id, d));
}

export function markAutoBackupCompanyRun(prefs: AutoBackupPrefs, companyId: string, at = Date.now()): AutoBackupPrefs {
  const cid = String(companyId || "").trim();
  return {
    ...prefs,
    lastRunAt: at,
    lastRunByCompanyId: { ...prefs.lastRunByCompanyId, [cid]: at },
  };
}

export function canEnableAutoBackup(): boolean {
  return isBackupSaveLocationConfigured();
}

function normalizeBackupSourceMode(raw: unknown): CompanyBackupSourceMode {
  return raw === "local_only" ? "local_only" : "online_merge";
}

function normalizeBackupIntent(raw: unknown): CompanyBackupIntent {
  return raw === "for_online" ? "for_online" : "for_offline";
}

function normalizeCompanySettings(raw: unknown): AutoBackupCompanySettings | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<AutoBackupCompanySettings>;
  const restoreAllowedGmails = normalizeRestoreAllowedGmailList(
    row.restoreAllowedGmails,
    row.restoreAllowedGmail
  );
  return {
    backupSourceMode: normalizeBackupSourceMode(row.backupSourceMode),
    backupIntent: normalizeBackupIntent(row.backupIntent),
    includeAttachments: row.includeAttachments === true,
    ...(restoreAllowedGmails.length ? { restoreAllowedGmails } : {}),
  };
}

export function defaultAutoBackupCompanySettings(staticClient?: boolean): AutoBackupCompanySettings {
  const staticBackupClient = staticClient ?? isEmbeddedOfflinePreloadClient();
  return {
    backupSourceMode: staticBackupClient ? "local_only" : "online_merge",
    backupIntent: staticBackupClient ? "for_offline" : "for_online",
    includeAttachments: false,
  };
}

export function getAutoBackupCompanySettings(
  prefs: AutoBackupPrefs,
  companyId: string,
  staticClient?: boolean
): AutoBackupCompanySettings {
  const id = String(companyId || "").trim();
  const saved = id ? normalizeCompanySettings(prefs.companySettingsById?.[id]) : null;
  if (saved) return saved;
  const base = defaultAutoBackupCompanySettings(staticClient);
  return { ...base, includeAttachments: prefs.includeAttachments === true };
}

export function patchAutoBackupCompanySettings(
  prefs: AutoBackupPrefs,
  companyId: string,
  settings: AutoBackupCompanySettings
): AutoBackupPrefs {
  const id = String(companyId || "").trim();
  if (!id) return prefs;
  const normalized = normalizeCompanySettings(settings) ?? defaultAutoBackupCompanySettings();
  return {
    ...prefs,
    companySettingsById: { ...prefs.companySettingsById, [id]: normalized },
  };
}
