/**
 * Google Drive par Pocket Ledger folder layout — shared (server + client).
 * Layout: `Pocket Ledger/{CompanyName__uniqueSuffix}/{backup|data|attachments}/`
 * Id segment me company name slug dobara nahi — sirf `generateCompanyId` ka random suffix.
 */

/** Drive root folder — user ke My Drive ke andar ek hi baar. */
export const POCKET_LEDGER_DRIVE_ROOT = "Pocket Ledger";

/** Har company folder ke andar branches. */
export const POCKET_LEDGER_DRIVE_BRANCH = {
  backup: "backup",
  data: "data",
  attachments: "attachments",
  opening: "opening",
} as const;

/** Opening folder ke andar — masters / users / avatars / attachments alag. */
export const POCKET_LEDGER_OPENING_SUB = {
  masters: "masters",
  users: "users",
  avatars: "avatars",
  attachments: "attachments",
} as const;

/** Masters opening JSON — `opening/masters/{segment}/opening.json`. */
export const POCKET_LEDGER_OPENING_MASTER_SEGMENTS = [
  "parties",
  "bank",
  "staff",
  "items",
  "expense",
  "tax",
] as const;

export type PocketLedgerDriveBranch = keyof typeof POCKET_LEDGER_DRIVE_BRANCH;

/** Purana layout — read fallback jab tak purane users migrate na ho jayein. */
export const LEGACY_DRIVE_SYNC_ROOT = "accounting-sync";

export type PocketLedgerDriveCompanyRef = {
  companyId: string;
  companyName?: string;
  /** Joined user ke liye — owner ka share kiya hua company folder id. */
  driveSharedFolderId?: string;
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

/** Drive folder `__` ke baad — poora companyId nahi, sirf unique suffix (name slug repeat nahi). */
export function pocketLedgerDriveCompanyIdPart(companyId: string): string {
  const id = String(companyId ?? "").trim();
  if (!id) return "unknown";
  // Local ids: `local-now_12fd7f75` → Drive par sirf `12fd7f75`.
  const lastUnderscore = id.lastIndexOf("_");
  if (lastUnderscore > 0 && lastUnderscore < id.length - 1) {
    const suffix = id.slice(lastUnderscore + 1);
    if (/^[a-zA-Z0-9]{6,12}$/.test(suffix)) {
      return suffix;
    }
  }
  return id.replace(/[^a-zA-Z0-9._-]/g, "_") || "unknown";
}

/** `Inaruwa_Traders__12fd7f75` — readable name + unique suffix (company name id me dubara nahi). */
export function pocketLedgerCompanyFolderSegment(ref: PocketLedgerDriveCompanyRef): string {
  const namePart = sanitizePocketLedgerDriveCompanyNamePart(ref.companyName ?? "company");
  const idPart = pocketLedgerDriveCompanyIdPart(ref.companyId);
  return `${namePart}__${idPart}`;
}

/** Purana layout: poora companyId id segment me — existing Drive folders lookup ke liye. */
export function pocketLedgerCompanyFolderSegmentLegacy(ref: PocketLedgerDriveCompanyRef): string {
  const namePart = sanitizePocketLedgerDriveCompanyNamePart(ref.companyName ?? "company");
  const idPart =
    String(ref.companyId ?? "")
      .trim()
      .replace(/[^a-zA-Z0-9._-]/g, "_") || "unknown";
  return `${namePart}__${idPart}`;
}

/** Folder dhoondho/create — pehle naya naam, phir legacy fallback. */
export function pocketLedgerCompanyFolderSegmentCandidates(ref: PocketLedgerDriveCompanyRef): string[] {
  const next = pocketLedgerCompanyFolderSegment(ref);
  const legacy = pocketLedgerCompanyFolderSegmentLegacy(ref);
  return next === legacy ? [next] : [next, legacy];
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

/** Encrypted file wrapper extension — logical path same, Drive par ye naam. */
export const DRIVE_ENCRYPTED_FILE_SUFFIX = ".plenc.json";

/** Non-encrypted attachment wrapper — web/static/APK/EXE sab par same JSON upload path. */
export const DRIVE_PLAIN_ATTACHMENT_SUFFIX = ".plattach.json";

/** Drive attachment URL prefix — `local:` jaisa, SQLite me remote path store. */
export const DRIVE_FILE_PREFIX = "drive:";

/** Purana cloud-sync ref — read-only compat. */
export const LEGACY_DRIVE_FILE_PREFIX = "drive://";

/** Logical attachment path → Drive storage name (encrypt OFF → raw file; ON → `.plenc.json`). */
export function driveStoragePathForLogicalFile(logicalPath: string, encryptFiles: boolean): string {
  if (!encryptFiles) return String(logicalPath || "").trim();
  const parts = logicalPath.split("/");
  const file = parts.pop() || "file";
  if (file.endsWith(DRIVE_ENCRYPTED_FILE_SUFFIX)) return logicalPath;
  parts.push(`${file}${DRIVE_ENCRYPTED_FILE_SUFFIX}`);
  return parts.join("/");
}

/** Plain (non-encrypted) attachment bytes → Drive JSON wrapper path. */
export function drivePlainAttachmentStoragePath(logicalPath: string): string {
  const path = String(logicalPath || "").trim();
  if (!path || path.endsWith(DRIVE_PLAIN_ATTACHMENT_SUFFIX)) return path;
  return `${path}${DRIVE_PLAIN_ATTACHMENT_SUFFIX}`;
}

/** Upload — ek hi helper web / static / APK / EXE ke liye. */
export function driveAttachmentUploadStoragePath(logicalPath: string, encryptFiles: boolean): string {
  return driveStoragePathForLogicalFile(logicalPath, encryptFiles);
}

/** Download — storage paths try order (legacy `.plattach.json` fallback jab encrypt OFF). */
export function driveAttachmentDownloadTryPaths(logicalPath: string, encryptFiles: boolean): string[] {
  if (encryptFiles) {
    return [driveStoragePathForLogicalFile(logicalPath, true), logicalPath];
  }
  const plain = String(logicalPath || "").trim();
  const legacy = drivePlainAttachmentStoragePath(plain);
  return legacy !== plain ? [plain, legacy] : [plain];
}

export function isDriveAttachmentWrapperStoragePath(path: string): boolean {
  const p = String(path || "");
  return p.endsWith(DRIVE_ENCRYPTED_FILE_SUFFIX) || p.endsWith(DRIVE_PLAIN_ATTACHMENT_SUFFIX);
}

/** Drive storage path se logical path (SQLite `drive:` ref) — wrapper suffix hatao. */
export function logicalPathFromDriveStoragePath(storagePath: string): string {
  const path = String(storagePath || "").trim();
  if (path.endsWith(DRIVE_ENCRYPTED_FILE_SUFFIX)) {
    const parts = path.split("/");
    const file = parts.pop() || "";
    parts.push(file.slice(0, -DRIVE_ENCRYPTED_FILE_SUFFIX.length));
    return parts.join("/");
  }
  if (path.endsWith(DRIVE_PLAIN_ATTACHMENT_SUFFIX)) {
    return path.slice(0, -DRIVE_PLAIN_ATTACHMENT_SUFFIX.length);
  }
  return path;
}

export function isDriveFileRef(url: string): boolean {
  if (typeof url !== "string") return false;
  const t = url.trim();
  if (t.startsWith(LEGACY_DRIVE_FILE_PREFIX)) return t.length > LEGACY_DRIVE_FILE_PREFIX.length;
  return t.startsWith(DRIVE_FILE_PREFIX) && t.length > DRIVE_FILE_PREFIX.length;
}

export function toDriveFileRef(remotePath: string): string {
  return `${DRIVE_FILE_PREFIX}${remotePath}`;
}

export function remotePathFromDriveFileRef(url: string): string | null {
  if (typeof url !== "string") return null;
  const t = url.trim();
  if (t.startsWith(LEGACY_DRIVE_FILE_PREFIX)) {
    const path = t.slice(LEGACY_DRIVE_FILE_PREFIX.length).trim();
    return path || null;
  }
  if (t.startsWith(DRIVE_FILE_PREFIX)) {
    const path = t.slice(DRIVE_FILE_PREFIX.length).trim();
    return path || null;
  }
  return null;
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

/** Drive folder segment `Local_Now__12fd7f75` → suffix + display name (join list ke liye). */
export function parsePocketLedgerCompanyFolderSegment(segment: string): {
  companyId: string;
  companyName: string;
  driveIdSuffix: string;
} | null {
  const seg = String(segment || "").trim();
  const idx = seg.lastIndexOf("__");
  if (idx <= 0) return null;
  const driveIdSuffix = seg.slice(idx + 2).trim();
  if (!driveIdSuffix) return null;
  const namePart = seg.slice(0, idx);
  const companyName = namePart.replace(/_/g, " ").trim() || "Company";
  // Join/sync canonical id manifest.json se aata hai; yahan folder suffix fallback.
  return { companyId: driveIdSuffix, companyName, driveIdSuffix };
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

/** `Pocket Ledger/{companySeg}/attachments/...` → `attachments/...` (shared join download API). */
export function branchRelativePathFromPocketLedgerRemotePath(remotePath: string): string | null {
  const parts = String(remotePath || "")
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 4 || parts[0] !== POCKET_LEDGER_DRIVE_ROOT) return null;
  const branchRel = parts.slice(2).join("/");
  return branchRel || null;
}
