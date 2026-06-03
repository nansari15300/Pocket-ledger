"use client";

import { canSyncCompanyToServer } from "@/lib/localVoucherOutbox";
import { getLocalCompanyById, upsertLocalCompany, type LocalCompanyDoc } from "@/lib/localCompanyStore";
import type {
  CloudSyncCompanyConfig,
  CloudSyncManifest,
  CloudSyncProviderId,
  CloudSyncRunStatus,
  CloudSyncDriveShareUser,
  CloudSyncIntervalSec,
  CloudSyncLastSyncSummary,
} from "@/lib/localCloudSync/types";
import {
  CLOUD_SYNC_INTERVAL_SEC_OPTIONS,
  DEFAULT_CLOUD_SYNC_INTERVAL_SEC,
} from "@/lib/localCloudSync/types";
import { normalizeLocalCompanyAppRole } from "@/lib/localCompanyAppRoles";
import { mergeDriveShareUsersIntoLocalCompanyUsers, parseLocalCompanyUserRows } from "@/lib/localCompanyUsers";
import { resolveCountryDriveAttachmentDateFolderMode } from "@/lib/localCloudSync/driveAttachmentPath";
import { localCompanyRowIsDeleted } from "@/lib/localCompanyStore";
import { isLocalCompanyDriveFolderOwner } from "@/lib/localCloudSync/driveCompanyFolderLifecycle";

/** Registry se share user list — purani writer/reader ya `role` field migrate. */
export function readCloudSyncDriveShareUsers(
  company: LocalCompanyDoc | Record<string, unknown> | null | undefined
): CloudSyncDriveShareUser[] {
  const c = (company ?? {}) as Record<string, unknown>;
  const raw = c.cloudSyncDriveShareUsers;
  if (Array.isArray(raw)) {
    return raw
      .map((row) => {
        const r = row as { email?: string; appRole?: string; role?: string };
        const email = String(r.email ?? "").trim().toLowerCase();
        if (!email.includes("@")) return null;
        const appRole =
          r.appRole != null
            ? normalizeLocalCompanyAppRole(r.appRole)
            : r.role === "reader"
              ? "viewer"
              : normalizeLocalCompanyAppRole(r.role ?? "manager");
        return { email, appRole };
      })
      .filter(Boolean) as CloudSyncDriveShareUser[];
  }
  const emails = Array.isArray(c.cloudSyncSharedEmails)
    ? c.cloudSyncSharedEmails.map((e) => String(e || "").trim().toLowerCase()).filter((e) => e.includes("@"))
    : [];
  return emails.map((email) => ({ email, appRole: "manager" as const }));
}

export function shareUsersToEmailList(users: CloudSyncDriveShareUser[]): string[] {
  return users.map((u) => u.email.trim().toLowerCase()).filter((e) => e.includes("@"));
}

function parseProvider(raw: unknown): CloudSyncProviderId | null {
  const s = String(raw ?? "").toLowerCase().trim();
  if (s === "google_drive" || s === "drive") return "google_drive";
  return null;
}

/** Registry se valid sync interval — unknown values par 30 sec default. */
function parseCloudSyncIntervalSec(raw: unknown): CloudSyncIntervalSec {
  const n = Number(raw);
  if (CLOUD_SYNC_INTERVAL_SEC_OPTIONS.includes(n as CloudSyncIntervalSec)) {
    return n as CloudSyncIntervalSec;
  }
  return DEFAULT_CLOUD_SYNC_INTERVAL_SEC;
}

/** Last sync summary — registry se 6 counts (missing par 0). */
function parseCloudSyncLastSyncSummary(raw: unknown): CloudSyncLastSyncSummary {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const n = (k: string) => {
    const v = Number(o[k]);
    return Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
  };
  const addedFiles = n("addedFiles");
  const addedVouchers = n("addedVouchers");
  return {
    addedFiles,
    addedVouchers,
    uploadedFiles: n("uploadedFiles"),
    uploadedVouchers: n("uploadedVouchers"),
    // Purane registry rows me sirf added* tha — UI downloaded row ke liye fallback.
    downloadedFiles: n("downloadedFiles") || addedFiles,
    downloadedVouchers: n("downloadedVouchers") || addedVouchers,
  };
}

export function readCloudSyncConfigFromCompany(
  company: LocalCompanyDoc | Record<string, unknown> | null | undefined
): CloudSyncCompanyConfig {
  const c = (company ?? {}) as Record<string, unknown>;
  const legacyProvider = parseProvider(c.cloudSyncProvider);
  const dataProvider = parseProvider(c.cloudSyncDataProvider) ?? legacyProvider;
  const filesProvider = parseProvider(c.cloudSyncFilesProvider) ?? legacyProvider;
  return {
    cloudSyncEnabled: c.cloudSyncEnabled === true,
    cloudSyncProvider: legacyProvider ?? dataProvider ?? filesProvider,
    cloudSyncDataProvider: dataProvider,
    cloudSyncFilesProvider: filesProvider,
    cloudSyncLastSyncAt:
      typeof c.cloudSyncLastSyncAt === "number" && Number.isFinite(c.cloudSyncLastSyncAt)
        ? c.cloudSyncLastSyncAt
        : null,
    cloudSyncStatus: (String(c.cloudSyncStatus || "idle") as CloudSyncRunStatus) || "idle",
    cloudSyncLastError: typeof c.cloudSyncLastError === "string" ? c.cloudSyncLastError : null,
    cloudSyncSharedEmails: shareUsersToEmailList(readCloudSyncDriveShareUsers(c)),
    cloudSyncDriveShareUsers: readCloudSyncDriveShareUsers(c),
    // Attachment folder mode: country-fixed (NP=both, else ad) — UI/manifest manual choice nahi.
    cloudSyncDriveDateFolderMode: resolveCountryDriveAttachmentDateFolderMode(c),
    cloudSyncEncryptDrive: (() => {
      const legacy = c.cloudSyncEncryptDrive === true;
      const data =
        typeof c.cloudSyncEncryptDriveData === "boolean"
          ? c.cloudSyncEncryptDriveData === true
          : legacy;
      const files =
        typeof c.cloudSyncEncryptDriveFiles === "boolean"
          ? c.cloudSyncEncryptDriveFiles === true
          : legacy;
      return data || files;
    })(),
    cloudSyncEncryptDriveData:
      typeof c.cloudSyncEncryptDriveData === "boolean"
        ? c.cloudSyncEncryptDriveData === true
        : c.cloudSyncEncryptDrive === true,
    cloudSyncEncryptDriveFiles:
      typeof c.cloudSyncEncryptDriveFiles === "boolean"
        ? c.cloudSyncEncryptDriveFiles === true
        : c.cloudSyncEncryptDrive === true,
    cloudSyncDriveEncryptionSalt:
      typeof c.cloudSyncDriveEncryptionSalt === "string" && c.cloudSyncDriveEncryptionSalt.trim()
        ? c.cloudSyncDriveEncryptionSalt.trim()
        : null,
    cloudSyncIntervalSec: parseCloudSyncIntervalSec(c.cloudSyncIntervalSec),
    cloudSyncLastSyncSummary: parseCloudSyncLastSyncSummary(c.cloudSyncLastSyncSummary),
  };
}

/** Sirf pure local companies — Firestore-backed rows kabhi Google Drive sync na karein. */
export async function isPureLocalCompany(companyId: string): Promise<boolean> {
  const reg = await getLocalCompanyById(companyId, { includeDeleted: true });
  if (!reg) return false;
  return !(await canSyncCompanyToServer(companyId));
}

export async function shouldUseLocalCloudSync(companyId: string): Promise<boolean> {
  if (!(await isPureLocalCompany(companyId))) return false;
  const reg = await getLocalCompanyById(companyId, { includeDeleted: true });
  if (!reg) return false;
  const cfg = readCloudSyncConfigFromCompany(reg);
  return cfg.cloudSyncEnabled && !!(cfg.cloudSyncDataProvider || cfg.cloudSyncFilesProvider || cfg.cloudSyncProvider);
}

/** Ops/manifest transport — data provider pehle, warna legacy single provider. */
export function cloudSyncDataProviderId(
  company: LocalCompanyDoc | Record<string, unknown> | null | undefined
): CloudSyncProviderId | null {
  const cfg = readCloudSyncConfigFromCompany(company);
  return cfg.cloudSyncDataProvider ?? cfg.cloudSyncProvider;
}

/** Attachment upload/download transport. */
export function cloudSyncFilesProviderId(
  company: LocalCompanyDoc | Record<string, unknown> | null | undefined
): CloudSyncProviderId | null {
  const cfg = readCloudSyncConfigFromCompany(company);
  return cfg.cloudSyncFilesProvider ?? cfg.cloudSyncProvider;
}

export async function patchLocalCompanyCloudSyncFields(
  companyId: string,
  patch: Partial<{
    cloudSyncEnabled: boolean;
    cloudSyncProvider: CloudSyncProviderId | null;
    cloudSyncDataProvider: CloudSyncProviderId | null;
    cloudSyncFilesProvider: CloudSyncProviderId | null;
    cloudSyncLastSyncAt: number | null;
    cloudSyncStatus: CloudSyncRunStatus;
    cloudSyncLastError: string | null;
    cloudSyncSharedEmails: string[];
    cloudSyncDriveShareUsers: CloudSyncDriveShareUser[];
    cloudSyncDriveDateFolderMode: "bs" | "ad" | "both" | null;
    cloudSyncEncryptDrive: boolean;
    cloudSyncEncryptDriveData: boolean;
    cloudSyncEncryptDriveFiles: boolean;
    cloudSyncDriveEncryptionSalt: string | null;
    cloudSyncIntervalSec: CloudSyncIntervalSec;
    cloudSyncLastSyncSummary: CloudSyncLastSyncSummary;
  }>
): Promise<void> {
  const reg = await getLocalCompanyById(companyId, { includeDeleted: true });
  if (!reg) return;
  await upsertLocalCompany({ ...reg, ...patch } as LocalCompanyDoc);
}

/** Owner/manager hi Drive manifest par attachment folder mode change kar sakte hain. */
export function canManageCloudSyncDriveAdminSettings(
  company: LocalCompanyDoc | Record<string, unknown>,
  firebaseUid: string | null | undefined,
  firebaseEmail: string | null | undefined
): boolean {
  if (isLocalCompanyDriveFolderOwner(company, firebaseUid)) return true;
  const email = String(firebaseEmail || "").trim().toLowerCase();
  if (!email) return false;
  const shareUsers = readCloudSyncDriveShareUsers(company);
  const hit = shareUsers.find((u) => u.email === email);
  const appRole = hit ? normalizeLocalCompanyAppRole(hit.appRole) : "viewer";
  return appRole === "manager";
}

/** Drive `data/manifest.json` se share list + encryption salt — decrypt se pehle local registry me. */
export async function mergeRemoteCloudSyncManifestIntoLocalCompany(
  companyId: string,
  manifest: CloudSyncManifest
): Promise<LocalCompanyDoc | null> {
  const reg = await getLocalCompanyById(companyId, { includeDeleted: true });
  if (!reg) return null;

  let next: LocalCompanyDoc = reg;
  let changed = false;

  if (Array.isArray(manifest.driveShareUsers) && manifest.driveShareUsers.length > 0) {
    const remoteShareUsers = readCloudSyncDriveShareUsers({
      cloudSyncDriveShareUsers: manifest.driveShareUsers,
    });
    const localShareUsers = readCloudSyncDriveShareUsers(reg as Record<string, unknown>);
    if (JSON.stringify(remoteShareUsers) !== JSON.stringify(localShareUsers)) {
      const prevLocalUsers = parseLocalCompanyUserRows((reg as { localCompanyUsers?: unknown }).localCompanyUsers);
      const localCompanyUsers = mergeDriveShareUsersIntoLocalCompanyUsers(prevLocalUsers, remoteShareUsers);
      next = {
        ...next,
        cloudSyncDriveShareUsers: remoteShareUsers,
        cloudSyncSharedEmails: shareUsersToEmailList(remoteShareUsers),
        localCompanyUsers,
      } as LocalCompanyDoc;
      changed = true;
    }
  }

  const manifestSalt = String(manifest.driveEncryptionSalt ?? "").trim();
  const localSalt = String(reg.cloudSyncDriveEncryptionSalt ?? "").trim();
  if (manifestSalt && manifestSalt !== localSalt) {
    next = { ...next, cloudSyncDriveEncryptionSalt: manifestSalt } as LocalCompanyDoc;
    changed = true;
  }

  if (typeof manifest.cloudSyncEncryptDriveData === "boolean" && reg.cloudSyncEncryptDriveData !== manifest.cloudSyncEncryptDriveData) {
    next = { ...next, cloudSyncEncryptDriveData: manifest.cloudSyncEncryptDriveData } as LocalCompanyDoc;
    changed = true;
  }
  if (typeof manifest.cloudSyncEncryptDriveFiles === "boolean" && reg.cloudSyncEncryptDriveFiles !== manifest.cloudSyncEncryptDriveFiles) {
    next = { ...next, cloudSyncEncryptDriveFiles: manifest.cloudSyncEncryptDriveFiles } as LocalCompanyDoc;
    changed = true;
  }

  const encData =
    typeof manifest.cloudSyncEncryptDriveData === "boolean"
      ? manifest.cloudSyncEncryptDriveData
      : next.cloudSyncEncryptDriveData === true;
  const encFiles =
    typeof manifest.cloudSyncEncryptDriveFiles === "boolean"
      ? manifest.cloudSyncEncryptDriveFiles
      : next.cloudSyncEncryptDriveFiles === true;
  const encAny = encData || encFiles;
  if (next.cloudSyncEncryptDrive !== encAny) {
    next = { ...next, cloudSyncEncryptDrive: encAny } as LocalCompanyDoc;
    changed = true;
  }

  // Purana Drive manifest (ad/bs) local ko overwrite na kare — country rule hi registry + uploads par.
  const countryFolderMode = resolveCountryDriveAttachmentDateFolderMode(reg as Record<string, unknown>);
  if (reg.cloudSyncDriveDateFolderMode !== countryFolderMode) {
    next = { ...next, cloudSyncDriveDateFolderMode: countryFolderMode } as LocalCompanyDoc;
    changed = true;
  }

  // Company recycle-bin: remote `true` → sab devices bin me; remote `false` sirf explicit restore par.
  if (manifest.companyRegistryIsDeleted === true) {
    const wantDeletedAt =
      typeof manifest.companyRegistryDeletedAt === "number" && Number.isFinite(manifest.companyRegistryDeletedAt)
        ? manifest.companyRegistryDeletedAt
        : Date.now();
    if (!localCompanyRowIsDeleted(reg) || (reg.deletedAt ?? null) !== wantDeletedAt) {
      next = {
        ...next,
        isDeleted: true,
        deletedAt: wantDeletedAt,
      } as LocalCompanyDoc;
      changed = true;
    }
  } else if (manifest.companyRegistryIsDeleted === false && localCompanyRowIsDeleted(reg)) {
    // Doosre device ne restore kiya — local bhi active karo.
    next = { ...next, isDeleted: false, deletedAt: null } as LocalCompanyDoc;
    changed = true;
  }
  // `undefined` / missing: local delete ko remote `false` se mat hatao (race se pehle protect).

  if (!changed) return reg;
  const saved = { ...next, updatedAt: Date.now() } as LocalCompanyDoc;
  await upsertLocalCompany(saved);
  // Recycle-bin registry sync: doosre device ka company dropdown turant update ho.
  if (typeof manifest.companyRegistryIsDeleted === "boolean") {
    const { bumpLocalCompanyRegistry } = await import("@/lib/applyStripePlanToLocalCompany");
    bumpLocalCompanyRegistry();
  }
  return saved;
}

/** Owner sync — manifest.json me encryption + share list likhne ke liye. */
export function buildCloudSyncManifestFromCompany(
  company: LocalCompanyDoc | Record<string, unknown>,
  base: Pick<CloudSyncManifest, "latestOp"> & Partial<CloudSyncManifest>
): CloudSyncManifest {
  const cfg = readCloudSyncConfigFromCompany(company);
  const shareUsers = readCloudSyncDriveShareUsers(company as Record<string, unknown>);
  const reg = company as Record<string, unknown>;
  const registryDeleted = localCompanyRowIsDeleted(reg);
  return {
    ...base,
    latestOp: base.latestOp,
    companyId: base.companyId ?? String((company as { id?: string }).id ?? ""),
    driveShareUsers: shareUsers.length > 0 ? shareUsers : base.driveShareUsers,
    driveEncryptionSalt: cfg.cloudSyncDriveEncryptionSalt ?? undefined,
    cloudSyncEncryptDriveData: cfg.cloudSyncEncryptDriveData,
    cloudSyncEncryptDriveFiles: cfg.cloudSyncEncryptDriveFiles,
    cloudSyncDriveDateFolderMode: resolveCountryDriveAttachmentDateFolderMode(company),
    companyRegistryIsDeleted: registryDeleted,
    companyRegistryDeletedAt:
      registryDeleted && typeof reg.deletedAt === "number" && Number.isFinite(reg.deletedAt)
        ? reg.deletedAt
        : registryDeleted
          ? Date.now()
          : undefined,
  };
}

/** Sirf manifest.json — bin/restore turant Drive par (attachment fail se block na ho). */
export async function pushCompanyRegistryManifestToDrive(companyId: string): Promise<boolean> {
  const cid = String(companyId || "").trim();
  if (!cid) return false;
  if (!(await shouldUseLocalCloudSync(cid))) return false;

  const reg = await getLocalCompanyById(cid, { includeDeleted: true });
  if (!reg) return false;

  const { getDataSyncProviderForCompany } = await import("@/lib/localCloudSync/providers");
  const provider = getDataSyncProviderForCompany(reg);
  if (!provider) return false;

  const syncRef = {
    companyId: cid,
    companyName: typeof reg.name === "string" ? reg.name : undefined,
    driveSharedFolderId:
      typeof reg.cloudSyncDriveFolderId === "string" && reg.cloudSyncDriveFolderId.trim()
        ? reg.cloudSyncDriveFolderId.trim()
        : undefined,
  };
  const remote = await provider.getManifest(syncRef);
  const built = buildCloudSyncManifestFromCompany(reg, {
    latestOp: Math.max(remote.latestOp || 0, 0),
    updatedAt: Date.now(),
    companyId: cid,
    driveShareUsers: readCloudSyncDriveShareUsers(reg),
  });
  const localDeleted = localCompanyRowIsDeleted(reg);
  // Push path: local delete/restore turant likho — attachment sync fail se block na ho.
  await provider.updateManifest(syncRef, {
    ...built,
    cloudSyncDriveDateFolderMode: resolveCountryDriveAttachmentDateFolderMode(reg),
    companyRegistryIsDeleted: localDeleted,
    companyRegistryDeletedAt:
      localDeleted && typeof reg.deletedAt === "number" && Number.isFinite(reg.deletedAt)
        ? reg.deletedAt
        : localDeleted
          ? Date.now()
          : undefined,
  });
  return true;
}

/** Doosre device se bin status — manifest pull + SQLite (full sync ki zaroorat nahi). */
export async function pullCompanyRegistryManifestFromDrive(companyId: string): Promise<void> {
  const cid = String(companyId || "").trim();
  if (!cid) return;
  if (!(await shouldUseLocalCloudSync(cid))) return;

  const { getDataSyncProviderForCompany } = await import("@/lib/localCloudSync/providers");
  const reg = await getLocalCompanyById(cid, { includeDeleted: true });
  if (!reg) return;
  const provider = getDataSyncProviderForCompany(reg);
  if (!provider) return;

  const syncRef = {
    companyId: cid,
    companyName: typeof reg.name === "string" ? reg.name : undefined,
    driveSharedFolderId:
      typeof reg.cloudSyncDriveFolderId === "string" && reg.cloudSyncDriveFolderId.trim()
        ? reg.cloudSyncDriveFolderId.trim()
        : undefined,
  };
  const remote = await provider.getManifest(syncRef);
  await mergeRemoteCloudSyncManifestIntoLocalCompany(cid, remote);
}

/** Delete/restore ke baad Drive manifest turant — attachment sync fail se block na ho. */
export async function syncCompanyRegistryStateToDriveManifest(companyId: string): Promise<void> {
  const cid = String(companyId || "").trim();
  if (!cid) return;
  try {
    await pushCompanyRegistryManifestToDrive(cid);
  } catch {
    /* offline / auth */
  }
  if (typeof window !== "undefined") {
    try {
      const { CLOUD_SYNC_POKE_EVENT } = await import("@/lib/localCloudSync/types");
      window.dispatchEvent(new CustomEvent(CLOUD_SYNC_POKE_EVENT, { detail: { companyId: cid } }));
    } catch {
      /* ignore */
    }
  }
}

/** Manifest upload (full sync end) — remote bin delete ko local active se overwrite mat karo. */
export function applyDriveManifestUploadGuard(
  built: CloudSyncManifest,
  remoteManifest: CloudSyncManifest,
  company: LocalCompanyDoc | Record<string, unknown>
): CloudSyncManifest {
  const localDeleted = localCompanyRowIsDeleted(company);
  const remoteDeleted = remoteManifest.companyRegistryIsDeleted === true;
  let registryDeleted: boolean;
  let registryDeletedAt: number | undefined;
  if (localDeleted) {
    registryDeleted = true;
    registryDeletedAt =
      typeof (company as { deletedAt?: unknown }).deletedAt === "number"
        ? Number((company as { deletedAt: number }).deletedAt)
        : Date.now();
  } else if (remoteDeleted) {
    // Remote pehle bin me hai — is device par abhi active dikhe to Drive `false` mat likho.
    registryDeleted = true;
    registryDeletedAt =
      typeof remoteManifest.companyRegistryDeletedAt === "number"
        ? remoteManifest.companyRegistryDeletedAt
        : Date.now();
  } else {
    registryDeleted = false;
    registryDeletedAt = undefined;
  }
  return {
    ...built,
    cloudSyncDriveDateFolderMode: resolveCountryDriveAttachmentDateFolderMode(company),
    companyRegistryIsDeleted: registryDeleted,
    companyRegistryDeletedAt: registryDeletedAt,
  };
}

/** @deprecated — `applyDriveManifestUploadGuard` */
export function applyDriveManifestFolderModeGuard(
  built: CloudSyncManifest,
  company: LocalCompanyDoc | Record<string, unknown>
): CloudSyncManifest {
  return applyDriveManifestUploadGuard(built, { latestOp: 0 }, company);
}
