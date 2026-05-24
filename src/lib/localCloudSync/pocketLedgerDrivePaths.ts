/**
 * Google Drive par Pocket Ledger folder layout — shared (server + client).
 * Layout: `Pocket Ledger/{CompanyName__companyId}/{backup|data|attachments}/`
 */

/** Drive root folder — user ke My Drive ke andar ek hi baar. */
export const POCKET_LEDGER_DRIVE_ROOT = "Pocket Ledger";

/** Har company folder ke andar teen branches. */
export const POCKET_LEDGER_DRIVE_BRANCH = {
  backup: "backup",
  data: "data",
  attachments: "attachments",
} as const;

export type PocketLedgerDriveBranch = keyof typeof POCKET_LEDGER_DRIVE_BRANCH;

/** Purana layout — read fallback jab tak purane users migrate na ho jayein. */
export const LEGACY_DRIVE_SYNC_ROOT = "accounting-sync";

export type PocketLedgerDriveCompanyRef = {
  companyId: string;
  companyName?: string;
};

/** Explorer-safe company segment — local mirror (`liveDataFolderMirror`) jaisa hi. */
export function sanitizePocketLedgerDriveCompanyNamePart(raw: string): string {
  return (
    String(raw || "")
      .trim()
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^\.+/, "")
      .slice(0, 80) || "company"
  );
}

/** `Inaruwa_Traders__abc123` — readable name + stable id. */
export function pocketLedgerCompanyFolderSegment(ref: PocketLedgerDriveCompanyRef): string {
  const namePart = sanitizePocketLedgerDriveCompanyNamePart(ref.companyName ?? "company");
  const idPart =
    String(ref.companyId ?? "")
      .trim()
      .replace(/[^a-zA-Z0-9._-]/g, "_") || "unknown";
  return `${namePart}__${idPart}`;
}

/** Purana server layout: `company_{id}` (sirf id, name nahi). */
export function legacyDriveCompanyFolderSegment(companyId: string): string {
  return `company_${String(companyId || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

/** Human-readable relative path — logs / API stub responses ke liye. */
export function buildPocketLedgerDriveRelativePath(
  ref: PocketLedgerDriveCompanyRef,
  branch: PocketLedgerDriveBranch,
  ...rest: string[]
): string {
  const parts = [
    POCKET_LEDGER_DRIVE_ROOT,
    pocketLedgerCompanyFolderSegment(ref),
    POCKET_LEDGER_DRIVE_BRANCH[branch],
    ...rest.filter(Boolean),
  ];
  return parts.join("/");
}

/** Backup `.plbp` file ka suggested naam. */
export function pocketLedgerDriveBackupFileName(isoTimestamp: string): string {
  return `${isoTimestamp}.plbp`;
}

/** Drive attachment URL prefix — `local:` jaisa, SQLite me remote path store. */
export const DRIVE_FILE_PREFIX = "drive:";

export function isDriveFileRef(url: string): boolean {
  return typeof url === "string" && url.startsWith(DRIVE_FILE_PREFIX);
}

export function toDriveFileRef(remotePath: string): string {
  return `${DRIVE_FILE_PREFIX}${remotePath}`;
}

export function remotePathFromDriveFileRef(url: string): string | null {
  if (!isDriveFileRef(url)) return null;
  const path = url.slice(DRIVE_FILE_PREFIX.length).trim();
  return path || null;
}

/** Attachment / backup file name safe segment. */
export function sanitizePocketLedgerDriveFileNamePart(raw: string): string {
  return (
    String(raw || "")
      .trim()
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .slice(0, 120) || "file"
  );
}

/** Remote path → company id (`Name__id` ke baad wala segment). */
export function companyIdFromPocketLedgerDriveRemotePath(remotePath: string): string | null {
  const parts = String(remotePath || "")
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 2 || parts[0] !== POCKET_LEDGER_DRIVE_ROOT) return null;
  const seg = parts[1] || "";
  const idx = seg.lastIndexOf("__");
  if (idx < 0) return null;
  return seg.slice(idx + 2) || null;
}
