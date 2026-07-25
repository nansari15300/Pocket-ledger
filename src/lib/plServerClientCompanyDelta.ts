"use client";

import { COLLECTIONS_TO_BACKUP, type CompanyBackupCollection } from "@/lib/companyBackupCollections";
import {
  mirrorCollectionDocsToBrowserDbSilent,
  notifyBrowserDbCollectionUpdated,
} from "@/lib/localCompanyDocMirror";
import { upsertLocalCompany, type LocalCompanyDoc, getLocalCompanyById } from "@/lib/localCompanyStore";
import type { PlServerSharedCompanySummary } from "@/lib/localServerShareableCompanies";
import { matchPlServerSharedCompanyForLocalId } from "@/lib/plServerHostCompanyId";
import { normalizeServerUrl, getActiveGate } from "@/lib/gates/gateStore";
import type { GateRecord } from "@/lib/gates/gateTypes";
import { fetchGateServerAccessContext, gateHttpGet } from "@/lib/gates/gateServerFetch";
import {
  applyPlServerAccessContextPayload,
  getPlServerSharedCompanies,
  refreshPlServerAccessContext,
  shouldFetchPlServerAccessContext,
} from "@/lib/plServerAccessContext";
import { isPlRemoteServerClientMode } from "@/lib/plRemoteServerClient";
import { plServerCompanyLedgerNeedsFullPull } from "@/lib/plServerLedgerDeltaGate";
import { isPlServerPullGenerationStale, resolvePlServerDeltaTransport } from "@/lib/plServerClientDeltaSync";
import { livePullBugCatch, livePullDevLog } from "@/lib/plServerLivePullDevLog";
import { isPlServerThinStaffCompany } from "@/lib/plServerThinStaffClient";
import { plGateTrace } from "@/lib/plGateTrace";
import {
  markPlServerOfflineMirrorReady,
  PL_SERVER_OFFLINE_MASTER_COLLECTIONS,
} from "@/lib/plServerOfflineMirrorReady";

export const PL_SERVER_CLIENT_DELTA_EVENT = "pl-server-client-delta-done";

export type PlServerClientDeltaEventDetail = { fullPull: number; companyIds: string[] };

type DeltaBundle = {
  company?: Record<string, unknown> | null;
  collections?: Record<string, Array<Record<string, unknown>>> | null;
};

type LocalServerCompanyRowOptions = {
  gate?: GateRecord | null;
  hostCompanyId?: string | null;
};

async function applyDeltaCollectionDocsToStaffStore(
  companyId: string,
  collection: string,
  docs: Array<Record<string, unknown>>,
  options?: { incomingWins?: boolean; /** Full ledger pull only — focus/incremental must stay false. */ authoritativeSnapshot?: boolean }
): Promise<{ upserted: number; skipped: number }> {
  let voucherBefore: Array<{ id?: unknown }> | null = null;
  if (collection === "vouchers") {
    try {
      const { listVoucherSummaryProjectionFromBrowserDb } = await import("@/lib/localCompanyDocMirror");
      voucherBefore = await listVoucherSummaryProjectionFromBrowserDb(companyId, { forBackupMerge: true });
    } catch {
      voucherBefore = null;
    }
  }
  // Staff + legacy: SQLite is the user-side delta cache (EXE/APK/iOS same). Display cache optional warm.
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
  const result = await mirrorCollectionDocsToBrowserDbSilent(companyId, collection, docs, {
    force: true,
    mergePreferNewer: true,
    authoritativeSnapshot: options?.authoritativeSnapshot === true,
    mergePreferNewerTieBreak: "incoming",
    ...(collection === "vouchers"
      ? {
          onLocalNewer: async (
            docId: string,
            localDoc: Record<string, unknown>
          ) => {
            const { queuePlServerDeltaDocPush } = await import("@/lib/plServerClientDeltaSync");
            queuePlServerDeltaDocPush(companyId, "vouchers", docId, localDoc, {
              skipLocalWriteMark: true,
            });
            plGateTrace("staff_voucher_divergence_repair_queued", {
              companyId,
              voucherId: docId,
              reason: "client_timestamp_newer",
            });
          },
        }
      : {}),
  });
  if (result.upserted > 0) {
    // Masters bhi vouchers jitne durable hain: server band/restart ke baad forms ko complete SQLite chahiye.
    const { flushPendingBrowserDbSave } = await import("@/lib/localSqlite");
    await flushPendingBrowserDbSave();
  }
  if (collection === "vouchers") {
    try {
      // PL client ledger must survive an immediate app close/reload. Do not leave
      // the full server pull only in sql.js memory behind the normal debounce.
      const { listVoucherSummaryProjectionFromBrowserDb } = await import("@/lib/localCompanyDocMirror");
      const { plServerVoucherForensicTrace, voucherIdFingerprint } = await import(
        "@/lib/plServerLiveChangeTrace"
      );
      const after = await listVoucherSummaryProjectionFromBrowserDb(companyId, { forBackupMerge: true });
      if (result.upserted > 0 || voucherBefore == null || docs.length !== voucherBefore.length || after.length !== voucherBefore.length) {
        const ids = (rows: Array<{ id?: unknown }>) =>
          rows.map((row) => String(row.id || "").trim()).filter(Boolean).sort();
        const embeddedCompanyRefs = [
          ...new Set(
            docs
              .flatMap((row) => [row.companyId, row.company_id, row.hostCompanyId])
              .map((value) => String(value || "").trim())
              .filter(Boolean)
          ),
        ].sort();
        plServerVoucherForensicTrace("client_sqlite_delta_apply", {
          companyId,
          incomingCount: docs.length,
          incomingFingerprint: voucherIdFingerprint(docs),
          incomingIds: ids(docs),
          incomingCompanyRefs: embeddedCompanyRefs,
          beforeCount: voucherBefore?.length ?? null,
          beforeFingerprint: voucherBefore ? voucherIdFingerprint(voucherBefore) : null,
          beforeIds: voucherBefore ? ids(voucherBefore) : null,
          afterCount: after.length,
          afterFingerprint: voucherIdFingerprint(after),
          afterIds: ids(after),
          upserted: result.upserted,
          skipped: result.skipped,
          authoritativeSnapshot: options?.authoritativeSnapshot === true,
          durableFlush: result.upserted > 0,
        });
      }
    } catch {
      /* diagnostics must never affect sync */
    }
  }
  return result;
}

/** Host SSE fast lane: commit the exact changed docs to client SQLite immediately. */
export async function applyPlServerLiveDeltaDocs(
  companyId: string,
  collection: CompanyBackupCollection,
  docs: Array<Record<string, unknown>>
): Promise<{ upserted: number; skipped: number }> {
  const id = String(companyId || "").trim();
  if (!id || !(COLLECTIONS_TO_BACKUP as readonly string[]).includes(collection) || !docs.length) {
    return { upserted: 0, skipped: 0 };
  }
  return applyDeltaCollectionDocsToStaffStore(id, collection, docs, { incomingWins: true });
}

/** Server company row se cloud mirror fields hatao — client par Firestore pull na chale. */
export function plServerClientLocalCompanyRow(
  id: string,
  name: string,
  ownerEmail: string | null | undefined,
  fromBundle?: Record<string, unknown> | null,
  options?: LocalServerCompanyRowOptions
): LocalCompanyDoc {
  const raw = { ...(fromBundle || {}) } as Record<string, unknown>;
  const activeGate = options?.gate ?? getActiveGate();
  const activeGateIsServer = activeGate.type === "local_server";
  const activeGateServerUrl = activeGateIsServer ? normalizeServerUrl(activeGate.serverUrl || "") : "";
  const hostCompanyId = String(options?.hostCompanyId || raw.plServerHostCompanyId || "").trim();
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
    ...(activeGateIsServer ? { plServerGateId: activeGate.id } : {}),
    ...(activeGateServerUrl ? { plServerGateServerUrl: activeGateServerUrl } : {}),
    ...(hostCompanyId ? { plServerHostCompanyId: hostCompanyId } : {}),
  } as LocalCompanyDoc;
}

function resolvePlServerDeltaBaseUrl(companyId?: string): string {
  if (typeof window === "undefined") return "";
  if (isPlRemoteServerClientMode()) {
    return window.location.origin;
  }
  const id = String(companyId || "").trim();
  if (id) {
    const transport = resolvePlServerDeltaTransport(id);
    if (transport?.baseUrl) return transport.baseUrl;
  }
  const gate = getActiveGate();
  if (gate.type === "local_server" && gate.serverUrl) {
    return normalizeServerUrl(gate.serverUrl);
  }
  return "";
}

function resolvePlServerDeltaAccessToken(gate?: GateRecord): string {
  void gate;
  return "";
}

async function resolveDeltaFetchCompanyId(companyId: string): Promise<string> {
  const id = String(companyId || "").trim();
  if (!id) return "";
  const { resolvePlServerHostCompanyId } = await import("@/lib/plServerHostCompanyId");
  return (await resolvePlServerHostCompanyId(id)) || id;
}

async function fetchCompanyDeltaBundle(
  baseUrl: string,
  companyId: string,
  accessToken: string
): Promise<DeltaBundle | null> {
  const hostCompanyId = await resolveDeltaFetchCompanyId(companyId);
  const url = `${baseUrl.replace(/\/$/, "")}/__pl_company_delta/${encodeURIComponent(hostCompanyId)}`;
  try {
    const { status, body } = await gateHttpGet(url, accessToken, { timeoutMs: 95_000 });
    if (status === 403) {
      console.warn("[plServerClientCompanyDelta] delta forbidden");
      return null;
    }
    if (status === 503) {
      console.warn("[plServerClientCompanyDelta] delta export unavailable on server PC");
      return null;
    }
    if (!status || status >= 400) {
      console.warn("[plServerClientCompanyDelta] delta HTTP", status);
      return null;
    }
    return JSON.parse(body) as DeltaBundle;
  } catch (e) {
    console.warn("[plServerClientCompanyDelta] delta fetch failed", e);
    return null;
  }
}

/** Vouchers bade JSON — alag request se bridge/HTTP limit avoid. */
async function fetchCompanyDeltaCollection(
  baseUrl: string,
  companyId: string,
  collection: CompanyBackupCollection,
  accessToken: string,
  options?: { timeoutMs?: number }
): Promise<Array<Record<string, unknown>> | null> {
  const hostCompanyId = await resolveDeltaFetchCompanyId(companyId);
  const url = `${baseUrl.replace(/\/$/, "")}/__pl_company_delta/${encodeURIComponent(hostCompanyId)}/${encodeURIComponent(collection)}`;
  try {
    const { status, body } = await gateHttpGet(url, accessToken, {
      timeoutMs: options?.timeoutMs,
    });
    if (!status || status >= 400) {
      console.warn("[plServerClientCompanyDelta] collection delta HTTP", collection, status);
      return null;
    }
    const parsed = JSON.parse(body) as { docs?: unknown };
    return Array.isArray(parsed?.docs) ? (parsed.docs as Array<Record<string, unknown>>) : null;
  } catch (e) {
    console.warn("[plServerClientCompanyDelta] collection delta failed", collection, e);
    return null;
  }
}

type LedgerDeltaResult = {
  wrote: boolean;
  voucherCount: number;
  /** Vouchers endpoint ne valid array return kiya (empty bhi — server authoritative). */
  vouchersFetchedOk: boolean;
  /** Local write / push ne pull generation badha di — ledger incomplete reh gaya. */
  staleAbort: boolean;
};

/** Full pull: vouchers hamesha alag endpoint se — fail par bundle fallback. */
async function syncLedgerCollectionsFromServer(
  companyId: string,
  baseUrl: string,
  accessToken: string,
  bundleFallback?: DeltaBundle | null,
  pullGeneration?: number
): Promise<LedgerDeltaResult> {
  let wrote = false;
  let voucherCount = 0;
  let vouchersFetchedOk = false;
  let staleAbort = false;
  for (const col of P2P_LEDGER_COLLECTIONS) {
    if (pullGeneration != null && isPlServerPullGenerationStale(companyId, pullGeneration)) {
      staleAbort = true;
      return { wrote, voucherCount, vouchersFetchedOk, staleAbort };
    }
    let docs = await fetchCompanyDeltaCollection(baseUrl, companyId, col, accessToken, {
      timeoutMs: col === "vouchers" ? 125_000 : 50_000,
    });
    plGateTrace("staff_delta_collection_fetch_done", {
      companyId,
      collection: col,
      docs: docs == null ? null : docs.length,
    });
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
    const deltaStats = await applyDeltaCollectionDocsToStaffStore(companyId, col, docs, {
      incomingWins: true,
      // The client SQLite ledger is durable. A periodic server response must never
      // prune local vouchers; remote deletes arrive as tombstone documents.
      authoritativeSnapshot: false,
    });
    if (deltaStats.upserted > 0) {
      notifyBrowserDbCollectionUpdated(companyId, col, { immediate: true, source: "pl_server_delta" });
    }
    livePullDevLog("browser_db_updated", {
      companyId,
      collection: col,
      docCount: docs.length,
      upserted: deltaStats.upserted,
      skipped: deltaStats.skipped,
    });
    if (docs.length > 0) wrote = true;
  }
  return { wrote, voucherCount, vouchersFetchedOk, staleAbort };
}

async function syncFocusCollectionsFromServer(
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
    const docs = await fetchCompanyDeltaCollection(baseUrl, companyId, col, accessToken, {
      timeoutMs: col === "vouchers" ? 125_000 : 35_000,
    });
    if (docs == null) continue;
    fetched += 1;
    const deltaStats = await applyDeltaCollectionDocsToStaffStore(companyId, col, docs, {
      incomingWins: true,
    });
    if (deltaStats.upserted > 0) {
      notifyBrowserDbCollectionUpdated(companyId, col, { immediate: true, source: "pl_server_delta" });
      changedCollections.push(col);
    }
    livePullDevLog("focus_collection_updated", {
      companyId,
      collection: col,
      docCount: docs.length,
      upserted: deltaStats.upserted,
      skipped: deltaStats.skipped,
    });
  }
  return { fetched, changedCollections, staleAbort };
}

const P2P_LEDGER_COLLECTIONS: CompanyBackupCollection[] = ["vouchers", "recurring_voucher_templates"];

async function resolvePullTargetRows(
  shared: PlServerSharedCompanySummary[],
  filterIds: string[]
): Promise<PlServerSharedCompanySummary[]> {
  if (!filterIds.length) return shared;
  const rows: PlServerSharedCompanySummary[] = [];
  const seen = new Set<string>();
  const push = (row: PlServerSharedCompanySummary) => {
    const id = String(row.id || "").trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    rows.push(row);
  };

  for (const id of filterIds) {
    const exact = shared.find((row) => String(row.id || "").trim() === id);
    if (exact) {
      push(exact);
      continue;
    }
    const fuzzy = matchPlServerSharedCompanyForLocalId(id, shared);
    if (fuzzy) {
      push(fuzzy);
      continue;
    }
    try {
      const local = await getLocalCompanyById(id, { includeDeleted: true });
      push({
        id,
        name: String((local as { name?: unknown } | null)?.name || id),
        storageOption: "local",
        ownerEmail: String((local as { ownerEmail?: unknown } | null)?.ownerEmail || "") || null,
      });
    } catch {
      push({ id, name: id, storageOption: "local", ownerEmail: null });
    }
  }
  return rows;
}

async function syncSharedCompanyRows(
  shared: PlServerSharedCompanySummary[],
  baseUrl: string,
  accessToken: string,
  options?: {
    pullFullLedger?: boolean;
    companyIds?: string[];
    pullGeneration?: number;
    focusCollections?: CompanyBackupCollection[];
    serverGate?: GateRecord | null;
  }
): Promise<{ synced: number; fullPull: number; changedCollections: CompanyBackupCollection[] }> {
  const filterIds = (options?.companyIds || []).map((x) => String(x || "").trim()).filter(Boolean);
  const rows = filterIds.length ? await resolvePullTargetRows(shared, filterIds) : shared;
  if (!rows.length) {
    livePullDevLog("delta_rows_empty", {
      path: "legacy_sqlite_delta",
      companyIds: filterIds,
      sharedCount: shared.length,
    });
    if (shared.length === 0) {
      livePullBugCatch("ACCESS_CONTEXT_EMPTY_LEGACY_DELTA", {
        companyIds: filterIds,
        sharedCount: 0,
        hint: "Call refreshPlServerAccessContext or use thin staff display_cache path",
      });
      livePullDevLog("waiting_for_access_context", {
        companyIds: filterIds,
        sharedCount: 0,
      });
    }
    return { synced: 0, fullPull: 0, changedCollections: [] };
  }

  let synced = 0;
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
      plServerClientLocalCompanyRow(id, String(row.name || id), row.ownerEmail, null, {
        gate: options?.serverGate ?? null,
        hostCompanyId: id,
      })
    );
    synced += 1;

    if (focusCollections.length > 0 && baseUrl) {
      const focus = await syncFocusCollectionsFromServer(
        id,
        baseUrl,
        accessToken,
        focusCollections,
        pullGeneration
      );
      for (const col of focus.changedCollections) changedCollections.add(col);
      if (focus.staleAbort) break;
    }

    if (!pullFull || !baseUrl) continue;
    if (pullGeneration != null && isPlServerPullGenerationStale(id, pullGeneration)) break;
    plGateTrace("staff_delta_bundle_fetch_start", { companyId: id, baseUrl });
    const bundle = await fetchCompanyDeltaBundle(baseUrl, id, accessToken);
    plGateTrace("staff_delta_bundle_fetch_done", {
      companyId: id,
      ok: Boolean(bundle?.company),
      collectionKeys: bundle?.collections ? Object.keys(bundle.collections) : [],
    });
    if (pullGeneration != null && isPlServerPullGenerationStale(id, pullGeneration)) break;
    if (!bundle?.company) continue;
    await upsertLocalCompany(
      plServerClientLocalCompanyRow(
        id,
        String((bundle.company as { name?: string }).name || row.name || id),
        row.ownerEmail,
        bundle.company as Record<string, unknown>,
        { gate: options?.serverGate ?? null, hostCompanyId: id }
      )
    );
    try {
      const { applyPlServerStaffSessionFromCompanyMeta } = await import("@/lib/plServerCompanyMetaSync");
      await applyPlServerStaffSessionFromCompanyMeta(id);
      if (typeof window !== "undefined") {
        const { BUMP_LOCAL_COMPANY_REGISTRY_EVENT } = await import("@/lib/applyStripePlanToLocalCompany");
        window.dispatchEvent(new Event(BUMP_LOCAL_COMPANY_REGISTRY_EVENT));
      }
    } catch {
      /* optional */
    }

    const collections = bundle.collections || {};
    const completeMasterSnapshot = PL_SERVER_OFFLINE_MASTER_COLLECTIONS.every((col) =>
      Array.isArray(collections[col])
    );
    for (const col of COLLECTIONS_TO_BACKUP) {
      if (P2P_LEDGER_COLLECTIONS.includes(col as CompanyBackupCollection)) continue;
      if (pullGeneration != null && isPlServerPullGenerationStale(id, pullGeneration)) break;
      const docs = collections[col];
      if (!Array.isArray(docs)) continue;
      const deltaStats = await applyDeltaCollectionDocsToStaffStore(id, col, docs as Record<string, unknown>[], {
        incomingWins: true,
      });
      if (deltaStats.upserted > 0) {
        notifyBrowserDbCollectionUpdated(id, col, { immediate: true, source: "pl_server_delta" });
        changedCollections.add(col);
      }
    }
    if (pullFull && baseUrl) {
      plGateTrace("staff_delta_ledger_pull_start", { companyId: id });
      const ledger = await syncLedgerCollectionsFromServer(id, baseUrl, accessToken, bundle, pullGeneration);
      plGateTrace("staff_delta_ledger_pull_done", {
        companyId: id,
        wrote: ledger.wrote,
        voucherCount: ledger.voucherCount,
        vouchersFetchedOk: ledger.vouchersFetchedOk,
        staleAbort: ledger.staleAbort,
      });
      const ledgerComplete = ledger.vouchersFetchedOk && !ledger.staleAbort;
      if (ledgerComplete) {
        if (completeMasterSnapshot) markPlServerOfflineMirrorReady(id);
        fullPull += 1;
        fullPulledIds.push(id);
      }
    }
  }

  if (typeof window !== "undefined" && fullPull > 0) {
    window.dispatchEvent(
      new CustomEvent<PlServerClientDeltaEventDetail>(PL_SERVER_CLIENT_DELTA_EVENT, {
        detail: { fullPull, companyIds: fullPulledIds },
      })
    );
  }
  return { synced, fullPull, changedCollections: [...changedCollections] };
}

/** Server gate add/Test: active gate switch kiye bina saari allowed companies SQLite me. */
export async function syncPlServerGateToLocalSqlite(
  gate: GateRecord,
  options?: { pullFullLedger?: boolean; companyIds?: string[] }
): Promise<{ synced: number; fullPull: number; error?: string }> {
  const baseUrl = normalizeServerUrl(gate.serverUrl || "");
  if (!baseUrl) {
    return { synced: 0, fullPull: 0, error: "Missing server address." };
  }

  const ctx = await fetchGateServerAccessContext(baseUrl, "");
  if (ctx.error) {
    return { synced: 0, fullPull: 0, error: ctx.error };
  }

  const payload = {
    unrestricted: ctx.unrestricted,
    allowedCompanyIds: ctx.allowedCompanyIds,
    label: ctx.label ?? null,
    companies: ctx.companies ?? null,
  };
  applyPlServerAccessContextPayload(payload, gate.id);
  const result = await syncPlServerSharedCompaniesToLocalSqlite({
    ...options,
    serverGate: gate,
  });
  return { ...result };
}

/** Single server-gate company: connect/open par cache load (thin) ya legacy SQLite delta. */
export async function syncPlServerSharedCompanyById(
  companyId: string,
  options?: { pullFullLedger?: boolean }
): Promise<{ synced: boolean; fullPull: boolean }> {
  const { preparePlServerStaffCompanyConnect } = await import("@/lib/plServerStaffCompanyConnect");
  const result = await preparePlServerStaffCompanyConnect(companyId, {
    pullFullLedger: options?.pullFullLedger !== false,
    timeoutMs: 60_000,
  });
  return { synced: result.ok, fullPull: result.fullPull };
}

/** @internal SQLite delta pull for one company (staff + legacy). */
export async function syncPlServerSharedCompanyByIdLegacy(
  companyId: string,
  options?: { pullFullLedger?: boolean; pullGeneration?: number; serverGate?: GateRecord | null }
): Promise<{ synced: boolean; fullPull: boolean }> {
  const id = String(companyId || "").trim();
  if (!id) return { synced: false, fullPull: false };
  const activeGate = getActiveGate();
  const serverGate =
    options?.serverGate ??
    (activeGate.type === "local_server" ? activeGate : null);
  const result = await syncPlServerSharedCompaniesToLocalSqliteLegacy({
    ...options,
    companyIds: [id],
    serverGate,
  });
  const wantFull = options?.pullFullLedger !== false;
  const thinStaffUsableLedger = async (): Promise<boolean> => {
    if (!(await isPlServerThinStaffCompany(id))) return false;
    try {
      const { hydratePlServerDisplayCacheFromIdb, plServerDisplayCacheHasUsableLedger } = await import(
        "@/lib/plServerDisplayCache"
      );
      await hydratePlServerDisplayCacheFromIdb(id).catch(() => undefined);
      if (plServerDisplayCacheHasUsableLedger(id)) return true;
      const { listCompanyDocsFromBrowserDb } = await import("@/lib/localCompanyDocMirror");
      const vouchers = await listCompanyDocsFromBrowserDb(id, "vouchers", { forBackupMerge: true });
      return vouchers.length > 0;
    } catch {
      return false;
    }
  };
  if (wantFull && (await plServerCompanyLedgerNeedsFullPull(id))) {
    if (await thinStaffUsableLedger()) {
      return { synced: true, fullPull: true };
    }
    throw new Error(
      "Could not download voucher ledger from server. On the server PC keep Pocket Ledger open with sharing on, then Gate → Test and try again."
    );
  }
  if (wantFull && !result.fullPull) {
    if (await thinStaffUsableLedger()) {
      return { synced: true, fullPull: true };
    }
    throw new Error(
      "Could not download company data from server. On the server PC keep Pocket Ledger open with sharing on, then Gate → Test and try again."
    );
  }
  return {
    synced: result.synced > 0,
    fullPull: result.fullPull > 0,
  };
}

/** Server token companies → client SQLite delta (staff + legacy; display cache dual-write on staff). */
export async function syncPlServerSharedCompaniesToLocalSqlite(options?: {
  pullFullLedger?: boolean;
  companyIds?: string[];
  pullGeneration?: number;
  focusCollections?: CompanyBackupCollection[];
  serverGate?: GateRecord | null;
}): Promise<{ synced: number; fullPull: number; changedCollections?: CompanyBackupCollection[] }> {
  // Staff and legacy share the same SQLite delta pull (EXE/APK/iOS).
  return syncPlServerSharedCompaniesToLocalSqliteLegacy(options);
}

/** @internal Legacy SQLite delta pull. */
export async function syncPlServerSharedCompaniesToLocalSqliteLegacy(options?: {
  pullFullLedger?: boolean;
  companyIds?: string[];
  pullGeneration?: number;
  focusCollections?: CompanyBackupCollection[];
  serverGate?: GateRecord | null;
}): Promise<{ synced: number; fullPull: number; changedCollections?: CompanyBackupCollection[] }> {
  const primaryCompanyId = String(options?.companyIds?.[0] || "").trim();
  const baseUrl = resolvePlServerDeltaBaseUrl(primaryCompanyId);
  const accessContextReady = shouldFetchPlServerAccessContext();
  if (!accessContextReady && !baseUrl) {
    return { synced: 0, fullPull: 0, changedCollections: [] };
  }
  const filterIds = (options?.companyIds || []).map((x) => String(x || "").trim()).filter(Boolean);
  let sharedAll = getPlServerSharedCompanies();
  const needsRefresh =
    !sharedAll.length ||
    (filterIds.length > 0 &&
      filterIds.some((id) => !matchPlServerSharedCompanyForLocalId(id, sharedAll) && !sharedAll.some((r) => String(r.id || "").trim() === id)));
  if (needsRefresh) {
    const refresh = refreshPlServerAccessContext();
    // Active company + known transport can pull from SQLite immediately. The
    // resolver below builds a target row from the local company when the cached
    // access list is still empty; fresh permissions arrive in the background.
    if (!baseUrl || filterIds.length === 0) {
      await refresh;
      sharedAll = getPlServerSharedCompanies();
    } else {
      void refresh.catch(() => null);
    }
  }
  const accessToken = resolvePlServerDeltaAccessToken();
  const activeGate = getActiveGate();
  const serverGate =
    options?.serverGate ??
    (activeGate.type === "local_server" ? activeGate : null);
  return syncSharedCompanyRows(sharedAll, baseUrl, accessToken, { ...options, serverGate });
}
