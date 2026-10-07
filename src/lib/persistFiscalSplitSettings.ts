"use client";

import {
  persistCompanyRootSettingsPatch,
  companyRootSettingsUseLocalStore,
  type PersistCompanyRootSettingsResult,
} from "@/lib/persistCompanyRootSettings";
import { getLocalCompanyById, upsertLocalCompany } from "@/lib/localCompanyStore";
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
  fiscalSplitUpdatedAtMs?: number | null;
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
  payload: LocalFiscalSplitPayload,
  updatedAtMs = payload.fiscalSplitUpdatedAtMs ?? Date.now()
): Record<string, unknown> {
  if (payload.fiscalSplitMode !== "merge") {
    return {
      fiscalSplitMode: "off",
      fiscalMergePartitionAtIsos: null,
      fiscalMergeTickedFyKeys: null,
      fiscalPartitionLabel: null,
      fiscalSplitUpdatedAtMs: updatedAtMs,
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
    fiscalSplitUpdatedAtMs: updatedAtMs,
  };
}

function fiscalMergeSettingsEqual(
  company: CompanyLike,
  payload: LocalFiscalSplitPayload
): boolean {
  const patch = fiscalSplitPayloadToCompanyPatch(payload, 0);
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

  const hasVersionedCompanySettings = Number(opts.company?.fiscalSplitUpdatedAtMs) > 0;
  if (fiscalMergeSettingsEqual(opts.company, opts.payload) && hasVersionedCompanySettings) return null;

  const updatedAtMs = Math.max(
    Date.now(),
    (Number(opts.company?.fiscalSplitUpdatedAtMs) || 0) + 1,
    (Number(opts.payload.fiscalSplitUpdatedAtMs) || 0) + 1
  );
  const payload = { ...opts.payload, fiscalSplitUpdatedAtMs: updatedAtMs };
  writeLocalFiscalSplit(companyId, payload);

  const localOnly = companyRootSettingsUseLocalStore(opts.company);
  const authoritativeId = String(opts.company?.authoritativeCompanyId || "").trim();
  const rootCompanyId = !localOnly && authoritativeId ? authoritativeId : companyId;
  const patch = fiscalSplitPayloadToCompanyPatch(payload, updatedAtMs);
  const result = await persistCompanyRootSettingsPatch({
    companyId: rootCompanyId,
    company: opts.company,
    patch,
    reloadLocalCompanyRegistry: opts.reloadLocalCompanyRegistry,
    triggerSync: opts.triggerSync,
  });

  if (!localOnly && rootCompanyId !== companyId) {
    const localRow = await getLocalCompanyById(companyId, { includeDeleted: true }).catch(() => null);
    if (localRow) {
      await upsertLocalCompany({
        ...localRow,
        ...patch,
        id: companyId,
        updatedAt: updatedAtMs,
      });
    }
  }

  console.info("[FY-SPLIT-SYNC] company settings persisted", {
    localCompanyId: companyId,
    rootCompanyId,
    storage: result,
    mode: payload.fiscalSplitMode,
    partitionCount: payload.fiscalMergePartitionAtIsos?.length ?? 0,
    updatedAtMs,
  });
  return result;
}

/**
 * Older local-only fiscal split settings have no root version yet — push once so
 * the company root becomes the cross-device source of truth.
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
  // `useCompany()` exposes merged cloud + local values. Mode/ISO alone therefore
  // cannot prove that the cloud root contains them; only this root version can.
  if (Number(opts.company?.fiscalSplitUpdatedAtMs) > 0) return;

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
  if (!cid || !company) return false;
  const existing = readLocalFiscalSplit(cid);
  const isos = normalizeIsoList(company?.fiscalMergePartitionAtIsos);
  const cloudHasMerge = companyDocHasFiscalMergeSettings(company) && Boolean(isos?.length);
  const cloudVersion = Number(company.fiscalSplitUpdatedAtMs) || 0;
  const localVersion = Number(existing?.fiscalSplitUpdatedAtMs) || 0;

  if (cloudVersion > localVersion) {
    writeLocalFiscalSplit(cid, {
      fiscalSplitMode: cloudHasMerge ? "merge" : "off",
      fiscalMergePartitionAtIso: cloudHasMerge ? isos?.[0] ?? null : null,
      fiscalMergePartitionAtIsos: cloudHasMerge ? isos : null,
      fiscalMergeTickedFyKeys: cloudHasMerge ? normalizeFyKeys(company.fiscalMergeTickedFyKeys) : null,
      fiscalPartitionLabel:
        cloudHasMerge && typeof company.fiscalPartitionLabel === "string"
          ? company.fiscalPartitionLabel
          : null,
      fiscalAutoSplitEnabled: existing?.fiscalAutoSplitEnabled !== false,
      fiscalSplitConfiguredByUser: true,
      fiscalAutoSplitLastCheckDay: existing?.fiscalAutoSplitLastCheckDay ?? null,
      fiscalSplitUpdatedAtMs: cloudVersion,
    });
    console.info("[FY-SPLIT-SYNC] applied newer company settings locally", {
      companyId: cid,
      mode: cloudHasMerge ? "merge" : "off",
      updatedAtMs: cloudVersion,
      partitionCount: isos?.length ?? 0,
    });
    return true;
  }

  if (existing?.fiscalSplitConfiguredByUser || cloudVersion > 0) return false;
  if (!cloudHasMerge || !isos?.length) return false;

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
    fiscalSplitUpdatedAtMs: cloudVersion || null,
  });
  return true;
}
