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
  if (s === "dropbox") return "dropbox";
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
  return {
    cloudSyncEnabled: c.cloudSyncEnabled === true,
    cloudSyncProvider: parseProvider(c.cloudSyncProvider),
    cloudSyncLastSyncAt:
      typeof c.cloudSyncLastSyncAt === "number" && Number.isFinite(c.cloudSyncLastSyncAt)
        ? c.cloudSyncLastSyncAt
        : null,
    cloudSyncStatus: (String(c.cloudSyncStatus || "idle") as CloudSyncRunStatus) || "idle",
    cloudSyncLastError: typeof c.cloudSyncLastError === "string" ? c.cloudSyncLastError : null,
    cloudSyncSharedEmails: shareUsersToEmailList(readCloudSyncDriveShareUsers(c)),
    cloudSyncDriveShareUsers: readCloudSyncDriveShareUsers(c),
    cloudSyncDriveDateFolderMode:
      c.cloudSyncDriveDateFolderMode === "bs" ||
      c.cloudSyncDriveDateFolderMode === "ad" ||
      c.cloudSyncDriveDateFolderMode === "both"
        ? c.cloudSyncDriveDateFolderMode
        : null,
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

/** Sirf pure local companies — Firestore-backed rows kabhi Drive/Dropbox sync na karein. */
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
  return cfg.cloudSyncEnabled && !!cfg.cloudSyncProvider;
}

export async function patchLocalCompanyCloudSyncFields(
  companyId: string,
  patch: Partial<{
    cloudSyncEnabled: boolean;
    cloudSyncProvider: CloudSyncProviderId | null;
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

  if (
    manifest.cloudSyncDriveDateFolderMode === "ad" ||
    manifest.cloudSyncDriveDateFolderMode === "bs" ||
    manifest.cloudSyncDriveDateFolderMode === "both"
  ) {
    if (reg.cloudSyncDriveDateFolderMode !== manifest.cloudSyncDriveDateFolderMode) {
      next = { ...next, cloudSyncDriveDateFolderMode: manifest.cloudSyncDriveDateFolderMode } as LocalCompanyDoc;
      changed = true;
    }
  }

  if (!changed) return reg;
  const saved = { ...next, updatedAt: Date.now() } as LocalCompanyDoc;
  await upsertLocalCompany(saved);
  return saved;
}

/** Owner sync — manifest.json me encryption + share list likhne ke liye. */
export function buildCloudSyncManifestFromCompany(
  company: LocalCompanyDoc | Record<string, unknown>,
  base: Pick<CloudSyncManifest, "latestOp"> & Partial<CloudSyncManifest>
): CloudSyncManifest {
  const cfg = readCloudSyncConfigFromCompany(company);
  const shareUsers = readCloudSyncDriveShareUsers(company as Record<string, unknown>);
  return {
    ...base,
    latestOp: base.latestOp,
    companyId: base.companyId ?? String((company as { id?: string }).id ?? ""),
    driveShareUsers: shareUsers.length > 0 ? shareUsers : base.driveShareUsers,
    driveEncryptionSalt: cfg.cloudSyncDriveEncryptionSalt ?? undefined,
    cloudSyncEncryptDriveData: cfg.cloudSyncEncryptDriveData,
    cloudSyncEncryptDriveFiles: cfg.cloudSyncEncryptDriveFiles,
    cloudSyncDriveDateFolderMode: cfg.cloudSyncDriveDateFolderMode ?? undefined,
  };
}
