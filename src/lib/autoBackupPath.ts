"use client";

import { adToBs, NEPALI_MONTHS } from "@/lib/bs-date";

/** AD vs BS calendar for backup folder year / month / day + file stamp. */
export type BackupFolderDateSystem = "AD" | "BS";

/** Safe folder / file segment. */
export function sanitizeBackupFolderSegment(raw: string): string {
  const s = String(raw || "")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, " ")
    .slice(0, 80);
  return s || "company";
}

const AD_MONTH_FULL = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export function normalizeBackupFolderDateSystem(raw: unknown): BackupFolderDateSystem {
  return String(raw || "").trim().toUpperCase() === "BS" ? "BS" : "AD";
}

/** Year + full English month name + day for selected date system. */
export function backupFolderCalendarParts(
  at = new Date(),
  dateSystem: BackupFolderDateSystem = "AD"
): { year: string; monthName: string; day: string } {
  const system = normalizeBackupFolderDateSystem(dateSystem);
  if (system === "BS") {
    const bs = adToBs(at);
    const monthName = sanitizeBackupFolderSegment(NEPALI_MONTHS[bs.m - 1] ?? `M${bs.m}`);
    return {
      year: String(bs.y),
      monthName,
      day: String(bs.d).padStart(2, "0"),
    };
  }
  return {
    year: String(at.getFullYear()),
    monthName: AD_MONTH_FULL[at.getMonth()] ?? "January",
    day: String(at.getDate()).padStart(2, "0"),
  };
}

/** Local calendar date key `YYYY-MM-DD` (AD wall clock — due checks). */
export function backupLocalDateKey(at = new Date()): string {
  const y = at.getFullYear();
  const m = String(at.getMonth() + 1).padStart(2, "0");
  const d = String(at.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * File stamp with selected calendar + full month name.
 * AD: `2026-July-27-Time-7-28-14-PM` ; BS: `2083-Shrawan-11-Time-7-28-14-PM`
 */
export function backupLocalDateTimeStamp(
  at = new Date(),
  dateSystem: BackupFolderDateSystem = "AD"
): string {
  const { year, monthName, day } = backupFolderCalendarParts(at, dateSystem);
  const h24 = at.getHours();
  const ampm = h24 >= 12 ? "PM" : "AM";
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  const mm = String(at.getMinutes()).padStart(2, "0");
  const ss = String(at.getSeconds()).padStart(2, "0");
  return `${year}-${monthName}-${day}-Time-${h12}-${mm}-${ss}-${ampm}`;
}

export function companyBackupFileNameSlug(companyName: string): string {
  return (
    String(companyName || "")
      .trim()
      .replace(/\s+/g, "_")
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
      .slice(0, 80) || "company"
  );
}

/** Manual backup click vs scheduled auto backup — file name prefix. */
export type BackupFileRunKind = "Manual" | "Auto";

export function normalizeBackupFileRunKind(raw: unknown): BackupFileRunKind {
  return String(raw || "").trim().toLowerCase() === "auto" ? "Auto" : "Manual";
}

/**
 * `Manual_backup_{Company}_{YYYY}-{MonthFull}-{DD}-Time-{h}-{mm}-{ss}-{AM|PM}.plbp`
 * `Auto_backup_…`
 */
export function buildCompanyBackupFileName(
  companyName: string,
  at: Date = new Date(),
  dateSystem: BackupFolderDateSystem = "AD",
  runKind: BackupFileRunKind = "Manual"
): string {
  const slug = companyBackupFileNameSlug(companyName);
  const kind = normalizeBackupFileRunKind(runKind);
  return `${kind}_backup_${slug}_${backupLocalDateTimeStamp(at, dateSystem)}.plbp`;
}

/**
 * `{Company}/{year}/{MonthFull}/{DD}`
 * AD → `…/2026/July/27` ; BS → `…/2082/Shrawan/11`
 */
export function buildAutoBackupRelativeDir(
  companyName: string,
  companyId: string,
  at: Date = new Date(),
  dateSystem: BackupFolderDateSystem = "AD"
): string {
  const companyFolder = sanitizeBackupFolderSegment(companyName || companyId);
  const { year, monthName, day } = backupFolderCalendarParts(at, dateSystem);
  return `${companyFolder}/${year}/${monthName}/${day}`;
}

async function ensureWebSubdirectory(
  root: FileSystemDirectoryHandle,
  relativeDir: string
): Promise<FileSystemDirectoryHandle> {
  let current = root;
  for (const segment of relativeDir.split(/[/\\]+/).filter(Boolean)) {
    current = await current.getDirectoryHandle(segment, { create: true });
  }
  return current;
}

export async function resolveWebBackupDirectoryForRelativePath(
  root: FileSystemDirectoryHandle,
  relativeDir?: string | null
): Promise<FileSystemDirectoryHandle> {
  const rel = String(relativeDir || "").trim();
  if (!rel) return root;
  return ensureWebSubdirectory(root, rel);
}
