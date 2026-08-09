"use client";

import { useEffect, useRef } from "react";
import {
  listShareableLocalCompaniesForHost,
} from "@/lib/listShareableLocalCompaniesForHost";
import { isPlRemoteServerClientMode } from "@/lib/plRemoteServerClient";
import { clearBrowserDbCache } from "@/lib/localSqlite";
import { persistShareableCompaniesSnapshot } from "@/lib/plServerShareableSnapshotPersist";
import { useCompany } from "@/hooks/useCompany";

type ShareableCompanyBridgeRow = {
  id: string;
  name: string;
  storageOption: "local";
  ownerEmail?: string | null;
  planId?: string | null;
  planExpiryMs?: number | null;
  offlineLicenseValidUntilMs?: number | null;
  requiresLogin?: boolean;
  usernameHint?: string | null;
  accessEmails?: string[];
  localCompanyUsers?: unknown[];
};

declare global {
  interface Window {
    __plListShareableLocalCompanies?: () => Promise<ShareableCompanyBridgeRow[]>;
    __plValidateLocalCompanyLogin?: (
      companyId: string,
      username: string,
      password: string
    ) => Promise<{ ok: true; token: string; user: { id: string; username: string; displayName?: string; role?: string } } | { ok: false; error: string }>;
    __plGetCompanyLoginMeta?: (
      companyId: string,
      appEmail?: string | null
    ) => Promise<{ requiresLogin: boolean; usernameHint: string | null }>;
    __plExportCompanyDeltaBundle?: (
      companyId: string
    ) => Promise<{ company: Record<string, unknown>; collections: Record<string, unknown[]> } | null>;
    __plExportCompanyDeltaCollection?: (
      companyId: string,
      collection: string
    ) => Promise<Array<Record<string, unknown>> | null>;
    __plProbeDeltaExportCompany?: (
      companyId: string
    ) => Promise<{ ok: boolean; companyId?: string; reason?: string }>;
    __plWarmServerDataBridge?: () => Promise<{
      ok: boolean;
      ms?: number;
      shareableCount?: number;
      warmedIds?: string[];
      error?: string;
    }>;
    __plReadAttachmentBlob?: (
      companyId: string,
      localId: string
    ) => Promise<
      | { contentType: string; base64: string; size: number; relativePath?: undefined }
      | { contentType: string; relativePath: string; size: number; base64?: undefined }
      | null
    >;
    __plPutPendingAttachmentFromRemote?: (
      companyId: string,
      body: {
        id: string;
        action?: string;
        base64?: string;
        sha256Hex?: string;
        sha256?: string;
        contentType?: string;
        fileName?: string;
        storagePathPrefix?: string;
        docPath?: string;
        field?: string;
      }
    ) => Promise<{ ok: boolean; deduped?: boolean; deleted?: boolean; error?: string }>;
    __plUpsertCompanyDeltaDocs?: (
      companyId: string,
      collection: string,
      docs: Array<Record<string, unknown>>
    ) => Promise<{ ok: boolean; applied?: number; skipped?: number; received?: number; collection?: string; count?: number; error?: string }>;
    __plInvalidateBrowserDbCache?: () => void;
    __plDeltaHealthDbOpenMs?: () => Promise<number>;
    __plDebugCompareDeltaExportConsistency?: (
      companyId: string,
      collection?: string
    ) => Promise<{ ok: boolean; first: unknown; second: unknown }>;
    __plHostBridgeCompanyDocUpsert?: (payload: {
      companyId: string;
      collectionName: string;
      docId: string;
      data: unknown;
      notify?: boolean;
      skipCloudSyncEnqueue?: boolean;
      skipPlanMutationGate?: boolean;
      force?: boolean;
    }) => Promise<{ ok: boolean; written?: boolean; error?: string }>;
    __plIsCanonicalServerBridge?: boolean;
  }
}

/** Server PC (EXE): HTTP `/__pl_access_context` ke liye local company list expose — main process IPC. */
export function ServerShareableCompaniesBridge() {
  const { allCompaniesRegistry, localCompanyRegistryEpoch } = useCompany();
  const registryRef = useRef(allCompaniesRegistry);

  useEffect(() => {
    registryRef.current = allCompaniesRegistry;
  }, [allCompaniesRegistry, localCompanyRegistryEpoch]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isCanonicalServerBridge =
      new URLSearchParams(window.location.search).get("pl_server_data_bridge") === "1";
    if (isPlRemoteServerClientMode() && !isCanonicalServerBridge) return;
    let cancelled = false;
    // Registry identity changes often with cloud sync — debounce disk writes.
    const timer = window.setTimeout(() => {
      void (async () => {
        const { toPlServerSharedCompanySummaryAsync } = await import(
          "@/lib/localServerShareableCompanies"
        );
        const shareable = await listShareableLocalCompaniesForHost(allCompaniesRegistry);
        if (cancelled || shareable.length === 0) return;
        const companies: ShareableCompanyBridgeRow[] = [];
        for (const row of shareable) {
          companies.push(await toPlServerSharedCompanySummaryAsync(row));
        }
        if (cancelled || companies.length === 0) return;
        await persistShareableCompaniesSnapshot(companies);
      })();
    }, 2500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [allCompaniesRegistry, localCompanyRegistryEpoch]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isCanonicalServerBridge =
      new URLSearchParams(window.location.search).get("pl_server_data_bridge") === "1";
    if (isPlRemoteServerClientMode() && !isCanonicalServerBridge) return;

    try {
      if (isCanonicalServerBridge) {
        window.__plIsCanonicalServerBridge = true;
      }
    } catch {
      /* ignore */
    }

    window.__plHostBridgeCompanyDocUpsert = async (payload) => {
      const companyId = String(payload?.companyId || "").trim();
      const collectionName = String(payload?.collectionName || "").trim();
      const docId = String(payload?.docId || "").trim();
      if (!companyId || !collectionName || !docId) {
        return { ok: false, error: "missing_fields" };
      }
      const { hostBridgeCommitCompanyDoc, deserializeLocalDbValue } = await import("@/lib/localCompanyDocMirror");
      const raw = payload?.data;
      const data =
        raw && typeof raw === "object" && !Array.isArray(raw)
          ? (deserializeLocalDbValue(raw) as Record<string, unknown>)
          : {};
      return hostBridgeCommitCompanyDoc(companyId, collectionName, docId, data, {
        notify: payload?.notify !== false,
        skipCloudSyncEnqueue: payload?.skipCloudSyncEnqueue,
        skipPlanMutationGate: payload?.skipPlanMutationGate,
        force: payload?.force,
      });
    };

    const resolveDeltaExportCompanyId = async (requestedCompanyId: string): Promise<string> => {
      const requested = String(requestedCompanyId || "").trim();
      if (!requested) return "";
      const { getLocalCompanyById, listLocalCompanies } = await import("@/lib/localCompanyStore");
      const direct = await getLocalCompanyById(requested, { includeDeleted: true });
      if (direct) return requested;

      const rows = await listLocalCompanies({ includeDeleted: true });
      const slug = requested.includes("_") ? requested.slice(0, requested.lastIndexOf("_")) : requested;
      const hit = rows.find((row) => {
        const id = String((row as { id?: unknown }).id || "").trim();
        const hostId = String((row as { plServerHostCompanyId?: unknown }).plServerHostCompanyId || "").trim();
        const name = String((row as { name?: unknown }).name || "").trim();
        return (
          id === requested ||
          hostId === requested ||
          (slug && (id === slug || id.startsWith(`${slug}_`) || name === slug || name === requested))
        );
      });
      return String((hit as { id?: unknown } | undefined)?.id || requested).trim();
    };

    window.__plProbeDeltaExportCompany = async (requestedCompanyId) => {
      const resolvedCompanyId = await resolveDeltaExportCompanyId(requestedCompanyId);
      if (!resolvedCompanyId) return { ok: false, reason: "empty_id" };
      const { getLocalCompanyById } = await import("@/lib/localCompanyStore");
      const company = await getLocalCompanyById(resolvedCompanyId, { includeDeleted: true });
      if (!company) return { ok: false, reason: "company_not_in_store", companyId: resolvedCompanyId };
      try {
        const { getBrowserDb } = await import("@/lib/localSqlite");
        const db = await getBrowserDb();
        if (!db) return { ok: false, reason: "db_unavailable", companyId: resolvedCompanyId };
        return { ok: true, companyId: resolvedCompanyId };
      } catch (e) {
        return {
          ok: false,
          reason: e instanceof Error ? e.message : "db_open_failed",
          companyId: resolvedCompanyId,
        };
      }
    };

    window.__plWarmServerDataBridge = async () => {
      const startedMs = Date.now();
      const { listShareableLocalCompaniesForHost } = await import("@/lib/listShareableLocalCompaniesForHost");
      const shareable = await listShareableLocalCompaniesForHost(registryRef.current);
      const { getBrowserDb } = await import("@/lib/localSqlite");
      await getBrowserDb();
      const warmedIds: string[] = [];
      const { getLocalCompanyById } = await import("@/lib/localCompanyStore");
      for (const row of shareable) {
        const id = String(row?.id || "").trim();
        if (!id) continue;
        const doc = await getLocalCompanyById(id, { includeDeleted: true });
        if (doc) warmedIds.push(id);
      }
      return {
        ok: true,
        ms: Date.now() - startedMs,
        shareableCount: shareable.length,
        warmedIds,
      };
    };

    window.__plListShareableLocalCompanies = async () => {
      const { toPlServerSharedCompanySummaryAsync } = await import(
        "@/lib/localServerShareableCompanies"
      );
      const shareable = await listShareableLocalCompaniesForHost(registryRef.current);
      const out: ShareableCompanyBridgeRow[] = [];
      for (const row of shareable) {
        out.push(await toPlServerSharedCompanySummaryAsync(row));
      }
      // Do not persist on every host-bridge eligibility poll — that rewrites `.data/`
      // and makes Turbopack recompile until menu/nav stalls. Registry effect below persists.
      return out;
    };

    window.__plGetCompanyLoginMeta = async (companyId, appEmail) => {
      const { getLocalCompanyById } = await import("@/lib/localCompanyStore");
      const { computePlServerCompanyLoginMeta } = await import("@/lib/plServerCompanyLoginMeta");
      const doc = await getLocalCompanyById(String(companyId || "").trim(), { includeDeleted: true });
      if (!doc) return { requiresLogin: true, usernameHint: null };
      return computePlServerCompanyLoginMeta(doc, appEmail || null, null);
    };

    window.__plValidateLocalCompanyLogin = async (companyId, username, password) => {
      const { localAuthLoginClientOnly } = await import("@/lib/localCompanyUsers");
      try {
        const { token, user } = await localAuthLoginClientOnly(companyId, username, password, undefined, {
          remoteGate: true,
        });
        return { ok: true as const, token, user };
      } catch (e) {
        return {
          ok: false as const,
          error: e instanceof Error ? e.message : "Invalid username or password",
        };
      }
    };

    window.__plExportCompanyDeltaBundle = async (companyId) => {
      const { getLocalCompanyById } = await import("@/lib/localCompanyStore");
      const { listCompanyDocsFromBrowserDb } = await import("@/lib/localCompanyDocMirror");
      const { COLLECTIONS_TO_BACKUP } = await import("@/lib/companyBackupCollections");
      const resolvedCompanyId = await resolveDeltaExportCompanyId(companyId);
      // Flush pehle — role Save/change ke turant baad staff pull stale Manager users na paaye.
      const { flushPendingBrowserDbSave, getBrowserDb } = await import("@/lib/localSqlite");
      await flushPendingBrowserDbSave();
      await getBrowserDb();
      const company = await getLocalCompanyById(resolvedCompanyId);
      if (!company) return null;
      const { withHostPlanFieldsOnCompanyExport } = await import("@/lib/plServerHostPlanSync");
      const companyWithPlan = await withHostPlanFieldsOnCompanyExport(
        company as unknown as Record<string, unknown>
      );
      try {
        const { logPlPerm, summarizePermissionDateLimits } = await import("@/lib/permissionConfigSource");
        const pc = (companyWithPlan as { permissionConfig?: unknown }).permissionConfig;
        logPlPerm("host-export", {
          companyId: resolvedCompanyId,
          hasPermissionConfig: Boolean(pc),
          dateLimits: summarizePermissionDateLimits(
            pc as { dateLimits?: Record<string, { entryDays?: number; editDays?: number; deleteDays?: number }> } | undefined
          ),
        });
      } catch {
        /* ignore */
      }
      const collections: Record<string, unknown[]> = {};
      for (const col of COLLECTIONS_TO_BACKUP) {
        const rows = await listCompanyDocsFromBrowserDb(resolvedCompanyId, col, { forBackupMerge: true });
        collections[col] = rows as unknown[];
      }
      return { company: companyWithPlan, collections };
    };

    window.__plExportCompanyDeltaCollection = async (companyId, collection) => {
      const { getLocalCompanyById } = await import("@/lib/localCompanyStore");
      const { listCompanyDocsFromBrowserDb } = await import("@/lib/localCompanyDocMirror");
      const { COLLECTIONS_TO_BACKUP } = await import("@/lib/companyBackupCollections");
      const col = String(collection || "").trim();
      if (!col || !(COLLECTIONS_TO_BACKUP as readonly string[]).includes(col)) return null;
      const resolvedCompanyId = await resolveDeltaExportCompanyId(companyId);
      const company = await getLocalCompanyById(resolvedCompanyId);
      if (!company) return null;
      const { getBrowserDb } = await import("@/lib/localSqlite");
      await getBrowserDb();
      const rows = await listCompanyDocsFromBrowserDb(resolvedCompanyId, col, { forBackupMerge: true });
      if (col === "parties") {
        const { serverTimestampTraceLog } = await import("@/lib/plServerLivePullDevLog");
        const { mirrorDocTimestampFields } = await import("@/lib/localCompanyDocMirror");
        for (const row of rows) {
          const id = String((row as { id?: string }).id || "").trim();
          if (!id) continue;
          serverTimestampTraceLog("before_export_collection", {
            companyId: resolvedCompanyId,
            collection: col,
            id,
            ...mirrorDocTimestampFields(row as Record<string, unknown>),
          });
        }
      }
      return rows as Array<Record<string, unknown>>;
    };

    window.__plReadAttachmentBlob = async (companyId, localId) => {
      const {
        getBlobFromLocalFileRef,
        getLocalFileRefMeta,
        getLocalFileRefMetaSync,
        LOCAL_FILE_PREFIX,
      } = await import("@/lib/localPendingFiles");
      const rawId = String(localId || "").trim();
      const id = rawId.startsWith(LOCAL_FILE_PREFIX) ? rawId.slice(LOCAL_FILE_PREFIX.length).trim() : rawId;
      const cid = String(companyId || "").trim();
      if (!id || !cid) return null;
      const localRef = `${LOCAL_FILE_PREFIX}${id}`;
      // Fast path for `/__pl_attachment`: return disk relativePath so Electron main reads binary
      // (no base64 through executeJavaScript — that made LAN gallery feel like dial-up).
      const meta = getLocalFileRefMetaSync(localRef) ?? (await getLocalFileRefMeta(localRef));
      const relativePath = String(meta?.filePath || "").trim();
      if (relativePath) {
        let onDisk = true;
        try {
          const { electronAttachmentBlobExists } = await import("@/lib/electronAttachmentFs");
          onDisk = await electronAttachmentBlobExists(relativePath);
        } catch {
          onDisk = true; // assume path ok; main will 404 if missing
        }
        if (onDisk) {
          return {
            contentType: meta?.contentType || "application/octet-stream",
            relativePath,
            size: 0,
          };
        }
      }
      const blob = await getBlobFromLocalFileRef(localRef, { companyId: cid });
      if (!blob?.size) return null;
      const ab = await blob.arrayBuffer();
      const bytes = new Uint8Array(ab);
      let binary = "";
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      }
      return {
        contentType: blob.type || "application/octet-stream",
        base64: btoa(binary),
        size: blob.size,
      };
    };

    window.__plPutPendingAttachmentFromRemote = async (companyId, body) => {
      const { LOCAL_FILE_PREFIX } = await import("@/lib/localPendingFiles");
      const cid = String(companyId || "").trim();
      const rawId = String(body?.id || "").trim();
      const id = rawId.startsWith(LOCAL_FILE_PREFIX) ? rawId.slice(LOCAL_FILE_PREFIX.length).trim() : rawId;
      if (String(body?.action || "").trim().toLowerCase() === "delete") {
        if (!cid || !id) return { ok: false, error: "missing_fields" };
        try {
          const { removePendingFile } = await import("@/lib/localPendingFiles");
          await removePendingFile(id);
          return { ok: true, deleted: true };
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : "delete_pending_failed" };
        }
      }
      const base64 = String(body?.base64 || "").trim();
      if (!cid || !id || !base64) return { ok: false, error: "missing_fields" };
      let bytes: Uint8Array;
      try {
        const binary = atob(base64);
        bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      } catch {
        return { ok: false, error: "invalid_base64" };
      }
      const { computeSha256HexFromBytes } = await import("@/lib/security/sha256Hex");
      const incomingShaHint = String(body?.sha256Hex || body?.sha256 || "")
        .trim()
        .toLowerCase();
      const bytesSha = (
        await computeSha256HexFromBytes(
          bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
        )
      ).toLowerCase();
      if (incomingShaHint && incomingShaHint !== bytesSha) {
        return { ok: false, error: "sha256_mismatch" };
      }
      const { getAttachmentFileRef } = await import("@/lib/attachmentFileRefStore");
      const { attachmentFileExistsInDataDir } = await import("@/lib/capacitorAttachmentFs");
      const existing = await getAttachmentFileRef("pending_file", id);
      if (existing?.filePath && (await attachmentFileExistsInDataDir(existing.filePath))) {
        const existingSha = String(existing.sha256Hex || "")
          .trim()
          .toLowerCase();
        // Skip only when content hash matches — id-only skip blocked replacement bytes.
        if (existingSha && existingSha === bytesSha) {
          return { ok: true, deduped: true };
        }
      }
      const contentType = String(body.contentType || "application/octet-stream");
      const blob = new Blob([new Uint8Array(bytes)], { type: contentType });
      if (!blob.size) return { ok: false, error: "empty_blob" };
      const { putPendingFile } = await import("@/lib/localPendingFiles");
      try {
        await putPendingFile(
          {
            id,
            blob,
            contentType,
            fileName: String(body.fileName || id),
            docPath: body.docPath,
            field: body.field,
            storagePathPrefix: body.storagePathPrefix,
            requireSqliteIndex: true,
          },
          { skipPlServerAttachmentUploadEnqueue: true }
        );
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "put_pending_failed" };
      }
    };

    window.__plUpsertCompanyDeltaDocs = async (companyId, collection, docs) => {
      const cid = String(companyId || "").trim();
      const col = String(collection || "").trim();
      const rows = Array.isArray(docs) ? docs : [];
      if (!cid || !col || !rows.length) return { ok: false, error: "missing_fields" };
      const { COLLECTIONS_TO_BACKUP } = await import("@/lib/companyBackupCollections");
      if (!(COLLECTIONS_TO_BACKUP as readonly string[]).includes(col)) {
        return { ok: false, error: "collection_not_allowed" };
      }
      const { mirrorCollectionDocsToBrowserDbSilent, notifyBrowserDbCollectionUpdated } = await import(
        "@/lib/localCompanyDocMirror"
      );
      const { resolvePlServerIncomingVoucherNumberConflicts } = await import(
        "@/lib/plServerVoucherConflictResolver"
      );
      const { flushPendingBrowserDbSave } = await import("@/lib/localSqlite");
      const resolvedBatch = await resolvePlServerIncomingVoucherNumberConflicts(cid, col, rows);
      const rowsToApply = resolvedBatch.docs;
      const stats = await mirrorCollectionDocsToBrowserDbSilent(cid, col, rowsToApply, {
        force: true,
        mergePreferNewer: true,
        mergePreferNewerTieBreak: "incoming",
      });
      await flushPendingBrowserDbSave();
      notifyBrowserDbCollectionUpdated(cid, col, { immediate: true, source: "pl_host_remote_write" });
      const received = rows.length;
      const applied = stats.upserted;
      const skipped = stats.skipped;
      return {
        ok: true,
        applied,
        skipped,
        received,
        collection: col,
        count: applied,
        conflictResolved: resolvedBatch.resolved,
      };
    };

    window.__plDeltaHealthDbOpenMs = async () => {
      clearBrowserDbCache();
      const t0 = Date.now();
      const { getBrowserDb } = await import("@/lib/localSqlite");
      await getBrowserDb();
      return Date.now() - t0;
    };

    window.__plInvalidateBrowserDbCache = () => {
      // Drop memory only — stale bridge flush se pehle IDB clobber na ho.
      clearBrowserDbCache();
      try {
        void import("@/lib/plRoleChangeLog").then(({ plRoleLog }) =>
          plRoleLog("bridge_cache_invalidate", { source: "__plInvalidateBrowserDbCache" })
        );
      } catch {
        /* ignore */
      }
    };

    if (process.env.NODE_ENV === "development") {
      window.__plDebugCompareDeltaExportConsistency = async (companyId, collection) => {
        const { debugCompareDeltaExportConsistency } = await import("@/lib/plDeltaExportDebug");
        return debugCompareDeltaExportConsistency(companyId, collection);
      };
    }

    return () => {
      delete window.__plHostBridgeCompanyDocUpsert;
      delete window.__plIsCanonicalServerBridge;
      delete window.__plListShareableLocalCompanies;
      delete window.__plGetCompanyLoginMeta;
      delete window.__plValidateLocalCompanyLogin;
      delete window.__plExportCompanyDeltaBundle;
      delete window.__plExportCompanyDeltaCollection;
      delete window.__plProbeDeltaExportCompany;
      delete window.__plWarmServerDataBridge;
      delete window.__plReadAttachmentBlob;
      delete window.__plPutPendingAttachmentFromRemote;
      delete window.__plUpsertCompanyDeltaDocs;
      delete window.__plInvalidateBrowserDbCache;
      delete window.__plDeltaHealthDbOpenMs;
      delete window.__plDebugCompareDeltaExportConsistency;
    };
  }, []);

  return null;
}
