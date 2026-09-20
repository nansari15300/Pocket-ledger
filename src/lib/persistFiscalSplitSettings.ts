"use client";

import {
  persistCompanyRootSettingsPatch,
  type PersistCompanyRootSettingsResult,
} from "@/lib/persistCompanyRootSettings";
import {
  readLocalFiscalSplit,
  writeLocalFiscalSplit,
  type LocalFiscalSplitPayload,
} from "@/lib/localFiscalSplitStore";

type CompanyLike = {
  id?: string;
  fiscalSplitMode?: string;
  fiscalMergePartitionAtIsos?: string[] | null;
  fiscalMergeTickedFyKeys?: string[] | null;
  fiscalPartitionLabel?: string | null;
  storageOption?: string | null;
  syncedFromCloud?: boolean;
  syncPolicy?: string | null;
  plServerShared?: boolean;
  authoritativeCompanyId?: string;
} | null | undefined;

function normalizeIsoList(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out = raw
    .filter((v): v is string => typeof v === "string" && Boolean(v.trim()))
    .map((v) => v.trim());
  return out.length ? out : null;
}

function normalizeFyKeys(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out = raw
    .filter((v): v is string => typeof v === "string" && Boolean(v.trim()))
    .map((v) => v.trim());
  return out.length ? out : null;
}

export function companyDocHasFiscalMergeSettings(company: CompanyLike): boolean {
  if (!company || company.fiscalSplitMode !== "merge") return false;
  return Boolean(normalizeIsoList(company.fiscalMergePartitionAtIsos)?.length);
}

export function fiscalSplitPayloadToCompanyPatch(
  payload: LocalFiscalSplitPayload
): Record<string, unknown> {
  if (payload.fiscalSplitMode !== "merge") {
    return {
      fiscalSplitMode: "off",
      fiscalMergePartitionAtIsos: null,
      fiscalMergeTickedFyKeys: null,
      fiscalPartitionLabel: null,
    };
  }
  const isos =
    normalizeIsoList(payload.fiscalMergePartitionAtIsos) ??
    (payload.fiscalMergePartitionAtIso ? [payload.fiscalMergePartitionAtIso] : null);
  return {
    fiscalSplitMode: "merge",
    fiscalMergePartitionAtIsos: isos,
    fiscalMergeTickedFyKeys: normalizeFyKeys(payload.fiscalMergeTickedFyKeys),
    fiscalPartitionLabel: payload.fiscalPartitionLabel?.trim() || null,
  };
}

function fiscalMergeSettingsEqual(
  company: CompanyLike,
  payload: LocalFiscalSplitPayload
): boolean {
  const patch = fiscalSplitPayloadToCompanyPatch(payload);
  const cloudIsos = normalizeIsoList(company?.fiscalMergePartitionAtIsos);
  const patchIsos = normalizeIsoList(patch.fiscalMergePartitionAtIsos);
  if (String(company?.fiscalSplitMode || "off") !== String(patch.fiscalSplitMode || "off")) {
    return false;
  }
  if (JSON.stringify(cloudIsos ?? []) !== JSON.stringify(patchIsos ?? [])) return false;
  const cloudKeys = normalizeFyKeys(company?.fiscalMergeTickedFyKeys);
  const patchKeys = normalizeFyKeys(patch.fiscalMergeTickedFyKeys);
  if (JSON.stringify(cloudKeys ?? []) !== JSON.stringify(patchKeys ?? [])) return false;
  const cloudLabel = String(company?.fiscalPartitionLabel || "").trim();
  const patchLabel = String(patch.fiscalPartitionLabel || "").trim();
  return cloudLabel === patchLabel;
}

/** Persist fiscal split to company root (SQLite + Firestore for online companies). */
export async function persistFiscalSplitSettingsToCompany(opts: {
  companyId: string;
  company: CompanyLike;
  payload: LocalFiscalSplitPayload;
  reloadLocalCompanyRegistry?: () => void;
  triggerSync?: () => void;
}): Promise<PersistCompanyRootSettingsResult | null> {
  const companyId = String(opts.companyId || "").trim();
  if (!companyId) return null;
  if (fiscalMergeSettingsEqual(opts.company, opts.payload)) return null;
  return persistCompanyRootSettingsPatch({
    companyId,
    company: opts.company,
    patch: fiscalSplitPayloadToCompanyPatch(opts.payload),
    reloadLocalCompanyRegistry: opts.reloadLocalCompanyRegistry,
    triggerSync: opts.triggerSync,
  });
}

/**
 * Device-local fiscal merge configured but company doc missing fields — push once so production/other browsers match.
 */
export function scheduleBackfillCloudFiscalSplitFromLocal(opts: {
  companyId: string;
  company: CompanyLike;
  payload: LocalFiscalSplitPayload;
  reloadLocalCompanyRegistry?: () => void;
  triggerSync?: () => void;
}): void {
  const companyId = String(opts.companyId || "").trim();
  if (!companyId) return;
  if (opts.payload.fiscalSplitMode !== "merge") return;
  const isos =
    normalizeIsoList(opts.payload.fiscalMergePartitionAtIsos) ??
    (opts.payload.fiscalMergePartitionAtIso ? [opts.payload.fiscalMergePartitionAtIso] : null);
  if (!isos?.length) return;
  if (companyDocHasFiscalMergeSettings(opts.company)) return;
  if (fiscalMergeSettingsEqual(opts.company, opts.payload)) return;

  void persistFiscalSplitSettingsToCompany(opts).catch((err) => {
    console.warn("[persistFiscalSplitSettings] backfill cloud fiscal split", err);
  });
}

/** Cloud company doc has merge settings but this browser has no local entry — seed localStorage once. */
export function seedLocalFiscalSplitFromCompanyDocIfNeeded(
  companyId: string | null | undefined,
  company: CompanyLike
): boolean {
  const cid = String(companyId || company?.id || "").trim();
  if (!cid || !companyDocHasFiscalMergeSettings(company)) return false;
  const existing = readLocalFiscalSplit(cid);
  if (existing?.fiscalSplitConfiguredByUser) return false;
  if (existing?.fiscalSplitMode === "merge" && normalizeIsoList(existing.fiscalMergePartitionAtIsos)?.length) {
    return false;
  }

  const isos = normalizeIsoList(company?.fiscalMergePartitionAtIsos);
  if (!isos?.length) return false;

  writeLocalFiscalSplit(cid, {
    fiscalSplitMode: "merge",
    fiscalMergePartitionAtIso: isos[0] ?? null,
    fiscalMergePartitionAtIsos: isos,
    fiscalMergeTickedFyKeys: normalizeFyKeys(company?.fiscalMergeTickedFyKeys),
    fiscalPartitionLabel:
      typeof company?.fiscalPartitionLabel === "string" ? company.fiscalPartitionLabel : null,
    fiscalAutoSplitEnabled: true,
    fiscalSplitConfiguredByUser: true,
    fiscalAutoSplitLastCheckDay: existing?.fiscalAutoSplitLastCheckDay ?? null,
  });
  return true;
}
