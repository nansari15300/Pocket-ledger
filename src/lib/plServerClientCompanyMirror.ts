"use client";

import { COLLECTIONS_TO_BACKUP, type CompanyBackupCollection } from "@/lib/companyBackupCollections";
import {
  mirrorCollectionDocsToBrowserDbSilent,
  notifyBrowserDbCollectionUpdated,
} from "@/lib/localCompanyDocMirror";
import { upsertLocalCompany, type LocalCompanyDoc } from "@/lib/localCompanyStore";
import { normalizeServerUrl, getActiveGate } from "@/lib/gates/gateStore";
import type { GateRecord } from "@/lib/gates/gateTypes";
import { fetchGateServerAccessContext, gateHttpGet } from "@/lib/gates/gateServerFetch";
import { resolveLocalServerGateAccessToken } from "@/lib/gates/gateRuntime";
import {
  applyPlServerAccessContextPayload,
  getPlServerSharedCompanies,
  readDevClientAccessToken,
  refreshPlServerAccessContext,
  shouldFetchPlServerAccessContext,
} from "@/lib/plServerAccessContext";
import type { PlServerSharedCompanySummary } from "@/lib/localServerShareableCompanies";
import { isPlRemoteServerClientMode } from "@/lib/plRemoteServerClient";
import { plServerCompanyLedgerNeedsFullPull } from "@/lib/plServerLedgerMirrorGate";
import { isPlServerPullGenerationStale } from "@/lib/plServerClientMirrorPush";
import { livePullBugCatch, livePullDevLog } from "@/lib/plServerLivePullDevLog";
import { isPlServerThinStaffCompany } from "@/lib/plServerThinStaffClient";

export const PL_SERVER_CLIENT_MIRROR_EVENT = "pl-server-client-mirror-done";

export type PlServerClientMirrorEventDetail = { fullPull: number; companyIds: string[] };

type MirrorBundle = {
  company?: Record<string, unknown> | null;
  collections?: Record<string, Array<Record<string, unknown>>> | null;
};

async function applyMirroredCollectionDocsToStaffStore(
  companyId: string,
  collection: string,
  docs: Array<Record<string, unknown>>,
  options?: { incomingWins?: boolean }
): Promise<{ upserted: number; skipped: number }> {
  // Staff + legacy: SQLite is the user-side mirror (EXE/APK/iOS same). Display cache optional warm.
  if (await isPlServerThinStaffCompany(companyId)) {
    try {
      const { mergePlServerDisplayCacheCollection } = await import("@/lib/plServerDisplayCache");
      mergePlServerDisplayCacheCollection(companyId, collection, docs, {
        incomingWins: options?.incomingWins !== false,
      });
    } catch {
      /* display cache optional */
    }
  }
  return mirrorCollectionDocsToBrowserDbSilent(companyId, collection, docs, {
    force: true,
    mergePreferNewer: true,
    authoritativeSnapshot: true,
    mergePreferNewerTieBreak: "incoming",
  });
}

/** Server company row se cloud mirror fields hatao — client par Firestore pull na chale. */
export function plServerClientLocalCompanyRow(
  id: string,
  name: string,
  ownerEmail: string | null | undefined,
  fromBundle?: Record<string, unknown> | null
): LocalCompanyDoc {
  const raw = { ...(fromBundle || {}) } as Record<string, unknown>;
  delete raw.authoritativeCompanyId;
  delete raw.cloudSyncLastSyncAt;
  delete raw.cloudSyncStatus;
  delete raw.cloudSyncLastError;
  delete raw.cloudSyncLastSyncSummary;
  return {
    ...(raw as LocalCompanyDoc),
    id,
    name,
    ownerId: "",
    ownerEmail: ownerEmail ?? null,
    storageOption: "local",
    syncedFromCloud: false,
    syncPolicy: "offline",
    isOwned: false,
    plServerShared: true,
  } as LocalCompanyDoc;
}

function resolvePlServerMirrorBaseUrl(): string {
  if (typeof window === "undefined") return "";
  if (isPlRemoteServerClientMode()) {
    return window.location.origin;
  }
  const gate = getActiveGate();
  if (gate.type === "local_server" && gate.serverUrl) {
    return normalizeServerUrl(gate.serverUrl);
  }
  return "";
}

function resolvePlServerMirrorAccessToken(gate?: GateRecord): string {
  const active = gate ?? getActiveGate();
  if (active.type === "local_server") {
    return resolveLocalServerGateAccessToken(active);
  }
  return readDevClientAccessToken();
}

async function fetchCompanyMirrorBundle(
  baseUrl: string,
  companyId: string,
  accessToken: string
): Promise<MirrorBundle | null> {
  const url = `${baseUrl.replace(/\/$/, "")}/__pl_company_mirror/${encodeURIComponent(companyId)}`;
  try {
    const { status, body } = await gateHttpGet(url, accessToken);
    if (status === 403) {
      console.warn("[plServerClientCompanyMirror] mirror forbidden — check gate token");
      return null;
    }
    if (status === 503) {
      console.warn("[plServerClientCompanyMirror] mirror export unavailable on server PC");
      return null;
    }
    if (!status || status >= 400) {
      console.warn("[plServerClientCompanyMirror] mirror HTTP", status);
      return null;
    }
    return JSON.parse(body) as MirrorBundle;
  } catch (e) {
    console.warn("[plServerClientCompanyMirror] mirror fetch failed", e);
    return null;
  }
}

/** Vouchers bade JSON — alag request se bridge/HTTP limit avoid. */
async function fetchCompanyMirrorCollection(
  baseUrl: string,
  companyId: string,
  collection: CompanyBackupCollection,
  accessToken: string
): Promise<Array<Record<string, unknown>> | null> {
  const url = `${baseUrl.replace(/\/$/, "")}/__pl_company_mirror/${encodeURIComponent(companyId)}/${encodeURIComponent(collection)}`;
  try {
    const { status, body } = await gateHttpGet(url, accessToken);
    if (!status || status >= 400) {
      console.warn("[plServerClientCompanyMirror] collection mirror HTTP", collection, status);
      return null;
    }
    const parsed = JSON.parse(body) as { docs?: unknown };
    return Array.isArray(parsed?.docs) ? (parsed.docs as Array<Record<string, unknown>>) : null;
  } catch (e) {
    console.warn("[plServerClientCompanyMirror] collection mirror failed", collection, e);
    return null;
  }
}

type LedgerMirrorResult = {
  wrote: boolean;
  voucherCount: number;
  /** Vouchers endpoint ne valid array return kiya (empty bhi — server authoritative). */
  vouchersFetchedOk: boolean;
  /** Local write / push ne pull generation badha di — ledger incomplete reh gaya. */
  staleAbort: boolean;
};

/** Full pull: vouchers hamesha alag endpoint se — fail par bundle fallback. */
async function mirrorLedgerCollectionsFromServer(
  companyId: string,
  baseUrl: string,
  accessToken: string,
  bundleFallback?: MirrorBundle | null,
  pullGeneration?: number
): Promise<LedgerMirrorResult> {
  let wrote = false;
  let voucherCount = 0;
  let vouchersFetchedOk = false;
  let staleAbort = false;
  for (const col of P2P_LEDGER_COLLECTIONS) {
    if (pullGeneration != null && isPlServerPullGenerationStale(companyId, pullGeneration)) {
      staleAbort = true;
      return { wrote, voucherCount, vouchersFetchedOk, staleAbort };
    }
    let docs = await fetchCompanyMirrorCollection(baseUrl, companyId, col, accessToken);
    if (docs == null) {
      const fromBundle = bundleFallback?.collections?.[col];
      docs = Array.isArray(fromBundle) ? (fromBundle as Array<Record<string, unknown>>) : null;
    }
    if (docs == null) continue;
    if (col === "vouchers") {
      vouchersFetchedOk = true;
      voucherCount = docs.length;
      livePullDevLog("vouchers_received", { companyId, count: voucherCount });
    }
    const mirrorStats = await applyMirroredCollectionDocsToStaffStore(companyId, col, docs, {
      incomingWins: true,
    });
    if (mirrorStats.upserted > 0) notifyBrowserDbCollectionUpdated(companyId, col);
    livePullDevLog("browser_db_updated", {
      companyId,
      collection: col,
      docCount: docs.length,
      upserted: mirrorStats.upserted,
      skipped: mirrorStats.skipped,
    });
    if (docs.length > 0) wrote = true;
  }
  return { wrote, voucherCount, vouchersFetchedOk, staleAbort };
}

async function mirrorFocusCollectionsFromServer(
  companyId: string,
  baseUrl: string,
  accessToken: string,
  collections: CompanyBackupCollection[],
  pullGeneration?: number
): Promise<{ fetched: number; changedCollections: CompanyBackupCollection[]; staleAbort: boolean }> {
  let fetched = 0;
  let staleAbort = false;
  const changedCollections: CompanyBackupCollection[] = [];
  const unique = [...new Set(collections)];
  for (const col of unique) {
    if (pullGeneration != null && isPlServerPullGenerationStale(companyId, pullGeneration)) {
      staleAbort = true;
      break;
    }
    const docs = await fetchCompanyMirrorCollection(baseUrl, companyId, col, accessToken);
    if (docs == null) continue;
    fetched += 1;
    const mirrorStats = await applyMirroredCollectionDocsToStaffStore(companyId, col, docs, {
      incomingWins: true,
    });
    if (mirrorStats.upserted > 0) {
      notifyBrowserDbCollectionUpdated(companyId, col, { immediate: true });
      changedCollections.push(col);
    }
    livePullDevLog("focus_collection_updated", {
      companyId,
      collection: col,
      docCount: docs.length,
      upserted: mirrorStats.upserted,
      skipped: mirrorStats.skipped,
    });
  }
  return { fetched, changedCollections, staleAbort };
}

const P2P_LEDGER_COLLECTIONS: CompanyBackupCollection[] = ["vouchers", "recurring_voucher_templates"];

async function mirrorSharedCompanyRows(
  shared: PlServerSharedCompanySummary[],
  baseUrl: string,
  accessToken: string,
  options?: {
    pullFullLedger?: boolean;
    companyIds?: string[];
    pullGeneration?: number;
    focusCollections?: CompanyBackupCollection[];
  }
): Promise<{ mirrored: number; fullPull: number; changedCollections: CompanyBackupCollection[] }> {
  const filterIds = (options?.companyIds || []).map((x) => String(x || "").trim()).filter(Boolean);
  const rows = filterIds.length
    ? shared.filter((row) => filterIds.includes(String(row.id || "").trim()))
    : shared;
  if (!rows.length) {
    livePullDevLog("mirror_rows_empty", {
      path: "legacy_sqlite_mirror",
      companyIds: filterIds,
      sharedCount: shared.length,
    });
    if (shared.length === 0) {
      livePullBugCatch("ACCESS_CONTEXT_EMPTY_LEGACY_MIRROR", {
        companyIds: filterIds,
        sharedCount: 0,
        hint: "Call refreshPlServerAccessContext or use thin staff display_cache path",
      });
      livePullDevLog("waiting_for_access_context", {
        companyIds: filterIds,
        sharedCount: 0,
      });
    }
    return { mirrored: 0, fullPull: 0, changedCollections: [] };
  }

  let mirrored = 0;
  let fullPull = 0;
  const changedCollections = new Set<CompanyBackupCollection>();
  const pullFull = options?.pullFullLedger !== false;
  const fullPulledIds: string[] = [];
  const pullGeneration = options?.pullGeneration;
  const focusCollections = [...new Set((options?.focusCollections || []).filter(Boolean))];

  for (const row of rows) {
    const id = String(row.id || "").trim();
    if (!id) continue;
    if (pullGeneration != null && isPlServerPullGenerationStale(id, pullGeneration)) break;
    await upsertLocalCompany(
      plServerClientLocalCompanyRow(id, String(row.name || id), row.ownerEmail)
    );
    mirrored += 1;

    if (focusCollections.length > 0 && baseUrl && accessToken) {
      const focus = await mirrorFocusCollectionsFromServer(
        id,
        baseUrl,
        accessToken,
        focusCollections,
        pullGeneration
      );
      for (const col of focus.changedCollections) changedCollections.add(col);
      if (focus.staleAbort) break;
    }

    if (!pullFull || !baseUrl || !accessToken) continue;
    if (pullGeneration != null && isPlServerPullGenerationStale(id, pullGeneration)) break;
    const bundle = await fetchCompanyMirrorBundle(baseUrl, id, accessToken);
    if (pullGeneration != null && isPlServerPullGenerationStale(id, pullGeneration)) break;
    if (!bundle?.company) continue;
    await upsertLocalCompany(
      plServerClientLocalCompanyRow(
        id,
        String((bundle.company as { name?: string }).name || row.name || id),
        row.ownerEmail,
        bundle.company as Record<string, unknown>
      )
    );

    const collections = bundle.collections || {};
    for (const col of COLLECTIONS_TO_BACKUP) {
      if (P2P_LEDGER_COLLECTIONS.includes(col as CompanyBackupCollection)) continue;
      if (pullGeneration != null && isPlServerPullGenerationStale(id, pullGeneration)) break;
      const docs = collections[col];
      if (!Array.isArray(docs) || docs.length === 0) continue;
      const mirrorStats = await applyMirroredCollectionDocsToStaffStore(id, col, docs as Record<string, unknown>[], {
        incomingWins: true,
      });
      if (mirrorStats.upserted > 0) {
        notifyBrowserDbCollectionUpdated(id, col, { immediate: true });
        changedCollections.add(col);
      }
    }
    if (pullFull && baseUrl && accessToken) {
      const ledger = await mirrorLedgerCollectionsFromServer(id, baseUrl, accessToken, bundle, pullGeneration);
      const ledgerComplete = ledger.vouchersFetchedOk && !ledger.staleAbort;
      if (ledgerComplete) {
        fullPull += 1;
        fullPulledIds.push(id);
      }
    }
  }

  if (typeof window !== "undefined" && fullPull > 0) {
    window.dispatchEvent(
      new CustomEvent<PlServerClientMirrorEventDetail>(PL_SERVER_CLIENT_MIRROR_EVENT, {
        detail: { fullPull, companyIds: fullPulledIds },
      })
    );
  }
  return { mirrored, fullPull, changedCollections: [...changedCollections] };
}

/** Token gate add/Test — active gate switch kiye bina saari allowed companies SQLite me. */
export async function mirrorPlServerGateToLocalSqlite(
  gate: GateRecord,
  options?: { pullFullLedger?: boolean; companyIds?: string[] }
): Promise<{ mirrored: number; fullPull: number; error?: string }> {
  const baseUrl = normalizeServerUrl(gate.serverUrl || "");
  const accessToken = resolveLocalServerGateAccessToken(gate);
  if (!baseUrl || !accessToken) {
    return { mirrored: 0, fullPull: 0, error: "Missing server address or access token." };
  }

  const ctx = await fetchGateServerAccessContext(baseUrl, accessToken);
  if (ctx.error) {
    return { mirrored: 0, fullPull: 0, error: ctx.error };
  }

  const payload = {
    unrestricted: ctx.unrestricted,
    allowedCompanyIds: ctx.allowedCompanyIds,
    label: ctx.label ?? null,
    companies: ctx.companies ?? null,
  };
  applyPlServerAccessContextPayload(payload, gate.id);
  const result = await mirrorPlServerSharedCompaniesToLocalSqlite(options);
  return { ...result };
}

/** Single server-gate company: connect/open par cache load (thin) ya legacy SQLite mirror. */
export async function mirrorPlServerSharedCompanyById(
  companyId: string,
  options?: { pullFullLedger?: boolean }
): Promise<{ mirrored: boolean; fullPull: boolean }> {
  const { preparePlServerStaffCompanyConnect } = await import("@/lib/plServerStaffCompanyConnect");
  const result = await preparePlServerStaffCompanyConnect(companyId, {
    pullFullLedger: options?.pullFullLedger !== false,
    timeoutMs: 60_000,
  });
  return { mirrored: result.ok, fullPull: result.fullPull };
}

/** @internal SQLite mirror pull for one company (staff + legacy). */
export async function mirrorPlServerSharedCompanyByIdLegacy(
  companyId: string,
  options?: { pullFullLedger?: boolean; pullGeneration?: number }
): Promise<{ mirrored: boolean; fullPull: boolean }> {
  const id = String(companyId || "").trim();
  if (!id) return { mirrored: false, fullPull: false };
  const result = await mirrorPlServerSharedCompaniesToLocalSqliteLegacy({
    ...options,
    companyIds: [id],
  });
  const wantFull = options?.pullFullLedger !== false;
  if (wantFull && (await plServerCompanyLedgerNeedsFullPull(id))) {
    throw new Error(
      "Could not download voucher ledger from server. On the server PC keep Pocket Ledger open with sharing on, then Gate → Test and try again."
    );
  }
  if (wantFull && !result.fullPull) {
    throw new Error(
      "Could not download company data from server. On the server PC keep Pocket Ledger open with sharing on, then Gate → Test and try again."
    );
  }
  return {
    mirrored: result.mirrored > 0,
    fullPull: result.fullPull > 0,
  };
}

/** Server token companies → client SQLite mirror (staff + legacy; display cache dual-write on staff). */
export async function mirrorPlServerSharedCompaniesToLocalSqlite(options?: {
  pullFullLedger?: boolean;
  companyIds?: string[];
  pullGeneration?: number;
  focusCollections?: CompanyBackupCollection[];
}): Promise<{ mirrored: number; fullPull: number; changedCollections?: CompanyBackupCollection[] }> {
  // Staff and legacy share the same SQLite mirror pull (EXE/APK/iOS).
  return mirrorPlServerSharedCompaniesToLocalSqliteLegacy(options);
}

/** @internal Legacy SQLite mirror pull. */
export async function mirrorPlServerSharedCompaniesToLocalSqliteLegacy(options?: {
  pullFullLedger?: boolean;
  companyIds?: string[];
  pullGeneration?: number;
  focusCollections?: CompanyBackupCollection[];
}): Promise<{ mirrored: number; fullPull: number; changedCollections?: CompanyBackupCollection[] }> {
  if (!shouldFetchPlServerAccessContext()) {
    return { mirrored: 0, fullPull: 0, changedCollections: [] };
  }
  if (!options?.companyIds?.length) {
    await refreshPlServerAccessContext();
  }
  const baseUrl = resolvePlServerMirrorBaseUrl();
  const accessToken = resolvePlServerMirrorAccessToken();
  const sharedAll = getPlServerSharedCompanies();
  return mirrorSharedCompanyRows(sharedAll, baseUrl, accessToken, options);
}
