"use client";

const AUTO_BACKUP_DRIVE_PREFS_KEY = "pl_auto_backup_drive_prefs_v1";

export type AutoBackupDriveUploadMode = "all" | "days";

export type AutoBackupDrivePrefs = {
  /** Google Drive root ke neeche main folder naam. */
  mainFolderName: string;
  uploadMode: AutoBackupDriveUploadMode;
  /** `uploadMode === "days"` — kitne din purane tak upload. */
  uploadDays: number;
  /** Har company folder par Drive par kitni `.plbp` files rakhein. */
  keepPerCompany: number;
  /** Backup complete hone ke baad nayi `.plbp` Drive par upload karo. */
  autoUploadEnabled: boolean;
  /** Drive upload / auto-upload — in companies ke folder se `.plbp` upload. */
  uploadCompanyIds: string[];
};

const DEFAULT: AutoBackupDrivePrefs = {
  mainFolderName: "Pocket Ledger Backups",
  uploadMode: "days",
  uploadDays: 7,
  keepPerCompany: 30,
  autoUploadEnabled: false,
  uploadCompanyIds: [],
};

function clampInt(raw: unknown, min: number, max: number, fallback: number): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function readAutoBackupDrivePrefs(): AutoBackupDrivePrefs {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = localStorage.getItem(AUTO_BACKUP_DRIVE_PREFS_KEY);
    if (!raw) return DEFAULT;
    const p = JSON.parse(raw) as Partial<AutoBackupDrivePrefs>;
    const mainFolderName = String(p.mainFolderName || DEFAULT.mainFolderName).trim().slice(0, 80);
    return {
      mainFolderName: mainFolderName || DEFAULT.mainFolderName,
      uploadMode: p.uploadMode === "all" ? "all" : "days",
      uploadDays: clampInt(p.uploadDays, 1, 365, DEFAULT.uploadDays),
      keepPerCompany: clampInt(p.keepPerCompany, 1, 500, DEFAULT.keepPerCompany),
      autoUploadEnabled: p.autoUploadEnabled === true,
      uploadCompanyIds: Array.isArray(p.uploadCompanyIds)
        ? [...new Set(p.uploadCompanyIds.map((id) => String(id || "").trim()).filter(Boolean))]
        : [],
    };
  } catch {
    return DEFAULT;
  }
}

export function saveAutoBackupDrivePrefs(next: AutoBackupDrivePrefs): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(AUTO_BACKUP_DRIVE_PREFS_KEY, JSON.stringify(next));
}
