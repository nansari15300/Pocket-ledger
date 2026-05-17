"use client";

import { canSyncCompanyToServer } from "@/lib/localVoucherOutbox";
import { getLocalCompanyById, upsertLocalCompany, type LocalCompanyDoc } from "@/lib/localCompanyStore";
import type { CloudSyncCompanyConfig, CloudSyncProviderId, CloudSyncRunStatus } from "@/lib/localCloudSync/types";

function parseProvider(raw: unknown): CloudSyncProviderId | null {
  const s = String(raw ?? "").toLowerCase().trim();
  if (s === "google_drive" || s === "drive") return "google_drive";
  if (s === "dropbox") return "dropbox";
  return null;
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
  }>
): Promise<void> {
  const reg = await getLocalCompanyById(companyId, { includeDeleted: true });
  if (!reg) return;
  await upsertLocalCompany({ ...reg, ...patch } as LocalCompanyDoc);
}
