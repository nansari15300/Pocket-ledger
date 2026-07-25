"use client";

import type { Company } from "@/hooks/useCompany";
import { buildAutoBackupRelativeDir } from "@/lib/autoBackupPath";
import {
  markAutoBackupCompanyRun,
  readAutoBackupPrefs,
  saveAutoBackupPrefs,
  getAutoBackupCompanySettings,
  type AutoBackupPrefs,
} from "@/lib/autoBackupPrefs";
import { isBackupSaveLocationConfigured } from "@/lib/backupSaveLocation";
import type { ExecuteCompanyBackupResult } from "@/lib/companyBackupCore";
import {
  dismissCompanyBackupRunLater,
  isCompanyBackupRunning,
  startCompanyBackupRun,
} from "@/lib/companyBackupRunner";
import { getLocalCompanyById, listLocalCompanies } from "@/lib/localCompanyStore";
import { resolveCompanyIsOwnedForUser } from "@/lib/companyOnlineIntegrity";
import { isEmbeddedOfflinePreloadClient } from "@/lib/isEmbeddedOfflinePreloadClient";

export type AutoBackupCompanyResult = {
  companyId: string;
  companyName: string;
  result: ExecuteCompanyBackupResult;
};

export type RunAutoBackupQueueInput = {
  companyIds: string[];
  allCompanies: Company[];
  ownerUid: string;
  ownerEmail?: string | null;
  resolveAccountPlanId: (company: Company) => string;
  /** Scheduler: mark last run per company on success. */
  markRunsInPrefs?: boolean;
};

function isBackupEligibleCompany(c: Company | undefined): c is Company {
  if (!c) return false;
  return c.isOwned === true;
}

async function resolveBackupCompany(company: Company, companyId: string): Promise<Company> {
  const staticBackupClient = isEmbeddedOfflinePreloadClient();
  if (!staticBackupClient) return company;
  const localRow = await getLocalCompanyById(companyId, { includeDeleted: true });
  if (!localRow) return company;
  return {
    ...company,
    ...(localRow as Record<string, unknown>),
    id: companyId,
    storageOption: company.storageOption ?? (localRow as { storageOption?: string }).storageOption,
    syncPolicy: company.syncPolicy ?? (localRow as { syncPolicy?: string }).syncPolicy,
  } as Company;
}

/** Sequential backup for selected companies — same pipeline as Backup Data. */
export async function runAutoBackupQueue(input: RunAutoBackupQueueInput): Promise<AutoBackupCompanyResult[]> {
  const ids = [...new Set(input.companyIds.map((id) => String(id || "").trim()).filter(Boolean))];
  const results: AutoBackupCompanyResult[] = [];
  if (ids.length === 0) return results;
  if (!isBackupSaveLocationConfigured()) {
    return ids.map((companyId) => ({
      companyId,
      companyName: companyId,
      result: { ok: false, error: "Backup location not set. Choose a folder first." },
    }));
  }
  if (isCompanyBackupRunning()) {
    return ids.map((companyId) => ({
      companyId,
      companyName: companyId,
      result: { ok: false, error: "A backup is already running." },
    }));
  }

  const staticBackupClient = isEmbeddedOfflinePreloadClient();
  let prefs = readAutoBackupPrefs();
  const pickerRows = await loadAutoBackupCompanyPickerRows(
    input.allCompanies,
    input.ownerUid,
    input.ownerEmail
  );
  const companyById = new Map(pickerRows.map((c) => [c.id, c]));

  for (const companyId of ids) {
    const company = companyById.get(companyId);
    const name = String(company?.name || companyId).trim() || companyId;
    if (!isBackupEligibleCompany(company)) {
      results.push({
        companyId,
        companyName: name,
        result: { ok: false, error: "Owner company required." },
      });
      continue;
    }

    const backupCompany = await resolveBackupCompany(company, companyId);
    const planSource = input.allCompanies.find((c) => c.id === companyId) ?? company;
    const backupRelativeDir = buildAutoBackupRelativeDir(company.name, companyId);
    const companySettings = getAutoBackupCompanySettings(prefs, companyId, staticBackupClient);
    const includeAttachments = staticBackupClient && companySettings.includeAttachments;
    const resolvedSourceMode: "local_only" | "online_merge" = staticBackupClient
      ? "local_only"
      : companySettings.backupIntent === "for_offline"
        ? "local_only"
        : companySettings.backupSourceMode;

    const result = await startCompanyBackupRun({
      company: backupCompany,
      companyId,
      ownerUid: input.ownerUid,
      accountPlanId: input.resolveAccountPlanId(planSource),
      includeAttachments,
      backupSourceMode: resolvedSourceMode,
      backupIntent: staticBackupClient ? companySettings.backupIntent : companySettings.backupIntent,
      attachmentMissingPolicy: includeAttachments ? "local_only" : undefined,
      backupRelativeDir,
      backupRestoreGmails: companySettings.restoreAllowedGmails,
    });

    results.push({ companyId, companyName: name, result });

    if (result.ok && input.markRunsInPrefs) {
      prefs = markAutoBackupCompanyRun(prefs, companyId);
      saveAutoBackupPrefs(prefs);
    }
  }

  if (results.some((r) => r.result.ok)) {
    dismissCompanyBackupRunLater(10000);
  }

  return results;
}

export function companyHasAutoBackupPassword(c: Company | undefined): boolean {
  return Boolean(String(c?.password || "").trim());
}

function mergeAutoBackupCompanyRow(
  base: Company,
  local: Record<string, unknown> | undefined,
  user: { uid: string; email: string | null }
): Company | null {
  const id = String(base.id || local?.id || "").trim();
  if (!id) return null;
  const password = String(base.password || local?.password || "").trim();
  const ownerId = String(base.ownerId || local?.ownerId || "").trim();
  const merged = {
    ...base,
    ...(local ?? {}),
    id,
    name: String(base.name || local?.name || id).trim() || id,
    ownerId,
    password: password || undefined,
  } as Company;
  const owned =
    base.isOwned === true ||
    merged.isOwned === true ||
    resolveCompanyIsOwnedForUser(merged, user);
  if (!owned) return null;
  return { ...merged, isOwned: true };
}

/** UI picker — owned companies; password SQLite/Firestore merge se (list me password aksar missing hota hai). */
export async function loadAutoBackupCompanyPickerRows(
  allCompanies: Company[],
  ownerUid?: string | null,
  ownerEmail?: string | null
): Promise<Company[]> {
  const uid = String(ownerUid || "").trim();
  const user = { uid, email: ownerEmail ?? null };
  let localRows: Awaited<ReturnType<typeof listLocalCompanies>> = [];
  try {
    localRows = await listLocalCompanies({ includeDeleted: false });
  } catch {
    /* browser sqlite unavailable */
  }
  const localById = new Map(localRows.map((r) => [r.id, r]));
  const out: Company[] = [];
  const seen = new Set<string>();

  for (const c of allCompanies) {
    const id = String(c.id || "").trim();
    if (!id || seen.has(id)) continue;
    const merged = mergeAutoBackupCompanyRow(c, localById.get(id), user);
    if (!merged) continue;
    seen.add(id);
    out.push(merged);
  }

  for (const local of localRows) {
    const id = String(local.id || "").trim();
    if (!id || seen.has(id)) continue;
    const merged = mergeAutoBackupCompanyRow(
      {
        id,
        name: String(local.name || id),
        ownerId: String(local.ownerId || ""),
        isOwned: true,
      } as Company,
      local as Record<string, unknown>,
      user
    );
    if (!merged) continue;
    seen.add(id);
    out.push(merged);
  }

  return out.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
}

export function listAutoBackupEligibleCompanies(companies: Company[]): Company[] {
  return companies.filter(isBackupEligibleCompany);
}

export function syncAutoBackupCompanyIdsWithEligible(
  prefs: AutoBackupPrefs,
  eligible: Company[]
): AutoBackupPrefs {
  const eligibleIds = new Set(eligible.map((c) => c.id));
  const companyIds = prefs.companyIds.filter((id) => eligibleIds.has(id));
  return companyIds.length === prefs.companyIds.length ? prefs : { ...prefs, companyIds };
}
