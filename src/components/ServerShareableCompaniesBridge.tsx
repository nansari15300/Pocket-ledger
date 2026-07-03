"use client";

import { useEffect } from "react";
import { listLocalCompanies } from "@/lib/localCompanyStore";
import {
  isLocalServerShareableCompany,
  toPlServerSharedCompanySummary,
} from "@/lib/localServerShareableCompanies";
import { isPlRemoteServerClientMode } from "@/lib/plRemoteServerClient";
import { clearBrowserDbCache } from "@/lib/localSqlite";

declare global {
  interface Window {
    __plListShareableLocalCompanies?: () => Promise<
      Array<{ id: string; name: string; storageOption: "local"; ownerEmail?: string | null }>
    >;
    __plValidateLocalCompanyLogin?: (
      companyId: string,
      username: string,
      password: string
    ) => Promise<{ ok: true; token: string; user: { id: string; username: string; displayName?: string; role?: string } } | { ok: false; error: string }>;
    __plExportCompanyMirrorBundle?: (
      companyId: string
    ) => Promise<{ company: Record<string, unknown>; collections: Record<string, unknown[]> } | null>;
    __plExportCompanyMirrorCollection?: (
      companyId: string,
      collection: string
    ) => Promise<Array<Record<string, unknown>> | null>;
    __plReadAttachmentBlob?: (
      companyId: string,
      localId: string
    ) => Promise<{ contentType: string; base64: string; size: number } | null>;
    __plPutPendingAttachmentFromRemote?: (
      companyId: string,
      body: {
        id: string;
        base64: string;
        sha256Hex?: string;
        contentType?: string;
        fileName?: string;
        storagePathPrefix?: string;
        docPath?: string;
        field?: string;
      }
    ) => Promise<{ ok: boolean; deduped?: boolean; error?: string }>;
    __plUpsertCompanyMirrorDocs?: (
      companyId: string,
      collection: string,
      docs: Array<Record<string, unknown>>
    ) => Promise<{ ok: boolean; applied?: number; skipped?: number; received?: number; collection?: string; count?: number; error?: string }>;
    __plInvalidateBrowserDbCache?: () => void;
    __plMirrorHealthDbOpenMs?: () => Promise<number>;
    __plDebugCompareMirrorExportConsistency?: (
      companyId: string,
      collection?: string
    ) => Promise<{ ok: boolean; first: unknown; second: unknown }>;
  }
}

/** Server PC (EXE): HTTP `/__pl_access_context` ke liye local company list expose — main process IPC. */
export function ServerShareableCompaniesBridge() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isPlRemoteServerClientMode()) return;

    window.__plListShareableLocalCompanies = async () => {
      const rows = await listLocalCompanies();
      return rows.filter(isLocalServerShareableCompany).map(toPlServerSharedCompanySummary);
    };

    window.__plValidateLocalCompanyLogin = async (companyId, username, password) => {
      const { localAuthLoginClientOnly } = await import("@/lib/localCompanyUsers");
      try {
        const { token, user } = await localAuthLoginClientOnly(companyId, username, password);
        return { ok: true as const, token, user };
      } catch (e) {
        return {
          ok: false as const,
          error: e instanceof Error ? e.message : "Invalid username or password",
        };
      }
    };

    window.__plExportCompanyMirrorBundle = async (companyId) => {
      clearBrowserDbCache();
      const { getBrowserDb } = await import("@/lib/localSqlite");
      await getBrowserDb();
      const { getLocalCompanyById } = await import("@/lib/localCompanyStore");
      const { listCompanyDocsFromBrowserDb } = await import("@/lib/localCompanyDocMirror");
      const { COLLECTIONS_TO_BACKUP } = await import("@/lib/companyBackupCollections");
      const company = await getLocalCompanyById(companyId);
      if (!company) return null;
      const collections: Record<string, unknown[]> = {};
      for (const col of COLLECTIONS_TO_BACKUP) {
        const rows = await listCompanyDocsFromBrowserDb(companyId, col, { forBackupMerge: true });
        if (rows.length > 0) collections[col] = rows as unknown[];
      }
      return { company: company as unknown as Record<string, unknown>, collections };
    };

    window.__plExportCompanyMirrorCollection = async (companyId, collection) => {
      clearBrowserDbCache();
      const { getBrowserDb } = await import("@/lib/localSqlite");
      await getBrowserDb();
      const { getLocalCompanyById } = await import("@/lib/localCompanyStore");
      const { listCompanyDocsFromBrowserDb } = await import("@/lib/localCompanyDocMirror");
      const { COLLECTIONS_TO_BACKUP } = await import("@/lib/companyBackupCollections");
      const col = String(collection || "").trim();
      if (!col || !(COLLECTIONS_TO_BACKUP as readonly string[]).includes(col)) return null;
      const company = await getLocalCompanyById(companyId);
      if (!company) return null;
      const rows = await listCompanyDocsFromBrowserDb(companyId, col, { forBackupMerge: true });
      if (col === "parties") {
        const { serverTimestampTraceLog } = await import("@/lib/plServerLivePullDevLog");
        const { mirrorDocTimestampFields } = await import("@/lib/localCompanyDocMirror");
        for (const row of rows) {
          const id = String((row as { id?: string }).id || "").trim();
          if (!id) continue;
          serverTimestampTraceLog("before_export_collection", {
            companyId,
            collection: col,
            id,
            ...mirrorDocTimestampFields(row as Record<string, unknown>),
          });
        }
      }
      return rows as Array<Record<string, unknown>>;
    };

    window.__plReadAttachmentBlob = async (companyId, localId) => {
      const id = String(localId || "").trim();
      const cid = String(companyId || "").trim();
      if (!id || !cid) return null;
      const { getBlobFromLocalFileRef, LOCAL_FILE_PREFIX } = await import("@/lib/localPendingFiles");
      const blob = await getBlobFromLocalFileRef(`${LOCAL_FILE_PREFIX}${id}`, { companyId: cid });
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
      const cid = String(companyId || "").trim();
      const id = String(body?.id || "").trim();
      const base64 = String(body?.base64 || "").trim();
      if (!cid || !id || !base64) return { ok: false, error: "missing_fields" };
      const { getAttachmentFileRef } = await import("@/lib/attachmentFileRefStore");
      const { attachmentFileExistsInDataDir } = await import("@/lib/capacitorAttachmentFs");
      const existing = await getAttachmentFileRef("pending_file", id);
      if (existing?.filePath && (await attachmentFileExistsInDataDir(existing.filePath))) {
        return { ok: true, deduped: true };
      }
      let bytes: Uint8Array;
      try {
        const binary = atob(base64);
        bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      } catch {
        return { ok: false, error: "invalid_base64" };
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

    window.__plUpsertCompanyMirrorDocs = async (companyId, collection, docs) => {
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
      const { flushPendingBrowserDbSave } = await import("@/lib/localSqlite");
      const stats = await mirrorCollectionDocsToBrowserDbSilent(cid, col, rows, {
        force: true,
        mergePreferNewer: true,
        mergePreferNewerTieBreak: "incoming",
      });
      await flushPendingBrowserDbSave();
      notifyBrowserDbCollectionUpdated(cid, col);
      const received = rows.length;
      const applied = stats.upserted;
      const skipped = stats.skipped;
      return { ok: true, applied, skipped, received, collection: col, count: applied };
    };

    window.__plMirrorHealthDbOpenMs = async () => {
      clearBrowserDbCache();
      const t0 = Date.now();
      const { getBrowserDb } = await import("@/lib/localSqlite");
      await getBrowserDb();
      return Date.now() - t0;
    };

    window.__plInvalidateBrowserDbCache = () => {
      clearBrowserDbCache();
    };

    if (process.env.NODE_ENV === "development") {
      window.__plDebugCompareMirrorExportConsistency = async (companyId, collection) => {
        const { debugCompareMirrorExportConsistency } = await import("@/lib/plMirrorExportDebug");
        return debugCompareMirrorExportConsistency(companyId, collection);
      };
    }

    return () => {
      delete window.__plListShareableLocalCompanies;
      delete window.__plValidateLocalCompanyLogin;
      delete window.__plExportCompanyMirrorBundle;
      delete window.__plExportCompanyMirrorCollection;
      delete window.__plReadAttachmentBlob;
      delete window.__plPutPendingAttachmentFromRemote;
      delete window.__plUpsertCompanyMirrorDocs;
      delete window.__plInvalidateBrowserDbCache;
      delete window.__plMirrorHealthDbOpenMs;
      delete window.__plDebugCompareMirrorExportConsistency;
    };
  }, []);

  return null;
}
