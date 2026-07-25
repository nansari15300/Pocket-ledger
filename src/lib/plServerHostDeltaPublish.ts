"use client";

import { COLLECTIONS_TO_BACKUP, type CompanyBackupCollection } from "@/lib/companyBackupCollections";
import { getLocalCompanyById } from "@/lib/localCompanyStore";
import { isServerGateCompany } from "@/lib/companyStorageKind";
import { isLocalServerShareableCompany } from "@/lib/localServerShareableCompanies";
import { isLocalAppServerHost } from "@/lib/localAppServerDevPreview";
import {
  getElectronLocalServerApi,
  isLocalAppServerSharingActive,
  resolveLocalAppServerSharingPort,
} from "@/lib/electronLocalServer";
import { gateHttpPost } from "@/lib/gates/gateServerFetch";
import { isPlRemoteServerClientMode } from "@/lib/plRemoteServerClient";
import { isCanonicalServerBridgeRenderer } from "@/lib/hostBridgeWrite";
import { PL_MIRROR_PROTOCOL_VERSION } from "@/lib/plMirrorProtocol";
import { outboxJsonParse, outboxJsonStringify } from "@/lib/localVoucherOutbox";
import { plPhase1bVerifyHook } from "@/lib/phase1bVerifyCapture";
import { parseDeltaPushResponseOk } from "@/lib/plServerClientDeltaSync";
import { plServerVoucherFlowLog } from "@/lib/plServerLivePullDevLog";

const PUBLISH_DEBOUNCE_MS = 400;
const PUBLISH_RETRY_MS = 4_000;

type HostPublishTransport = {
  baseUrl: string;
  accessToken: string;
};

const pendingByKey = new Map<string, ReturnType<typeof setTimeout>>();
const retryByKey = new Map<string, ReturnType<typeof setTimeout>>();
const queuedDocs = new Map<string, Record<string, unknown>>();

function pushKey(companyId: string, collection: string, docId: string): string {
  return `${companyId}::${collection}::${docId}`;
}

function serializeDeltaDoc(doc: Record<string, unknown>): Record<string, unknown> {
  return outboxJsonParse(outboxJsonStringify(doc));
}

/** Host PC par shareable local company — staff client / remote gate nahi. */
export async function isPlServerShareableHostWriter(companyId: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (isPlRemoteServerClientMode()) return false;
  if (isCanonicalServerBridgeRenderer()) return false;
  if (!isLocalAppServerHost()) return false;
  const { isPlServerThinStaffClient } = await import("@/lib/plServerThinStaffClient");
  if (isPlServerThinStaffClient()) return false;
  const id = String(companyId || "").trim();
  if (!id) return false;
  try {
    const row = await getLocalCompanyById(id, { includeDeleted: true });
    return Boolean(row && isLocalServerShareableCompany(row) && !isServerGateCompany(row));
  } catch {
    return false;
  }
}

/** Host PC loopback HTTP — main window + bridge dono se (attachment mirror / mirror publish). */
export async function resolvePlServerHostLoopbackTransport(
  companyId: string
): Promise<HostPublishTransport | null> {
  if (typeof window === "undefined") return null;
  if (isPlRemoteServerClientMode()) return null;
  if (!isLocalAppServerHost()) return null;

  const id = String(companyId || "").trim();
  if (!id) return null;

  try {
    const reg = await getLocalCompanyById(id, { includeDeleted: true });
    if (!reg || !isLocalServerShareableCompany(reg) || isServerGateCompany(reg)) return null;
  } catch {
    return null;
  }

  const api = getElectronLocalServerApi();
  if (!api) return null;

  let sharingPort: number | null = null;
  try {
    const status = await api.getStatus();
    if (!isLocalAppServerSharingActive(status)) return null;
    sharingPort = resolveLocalAppServerSharingPort(status);
    if (!sharingPort) return null;
  } catch {
    return null;
  }

  // Host loopback requests hit 127.0.0.1; the local server explicitly trusts localhost.
  // Do not require a user-created share token just to preview this PC's own attachment bytes.
  return {
    baseUrl: `http://127.0.0.1:${sharingPort}`,
    accessToken: "",
  };
}

/** Host bridge renderer: loopback PlServer transport for post-commit publish. */
export async function resolvePlServerHostPublishTransport(
  companyId: string
): Promise<HostPublishTransport | null> {
  if (!isCanonicalServerBridgeRenderer() && !isLocalAppServerHost()) return null;
  return resolvePlServerHostLoopbackTransport(companyId);
}

async function shouldPublishHostDeltaAfterBridgeWrite(companyId: string): Promise<boolean> {
  const transport = await resolvePlServerHostPublishTransport(companyId);
  return transport != null;
}

function scheduleHostDeltaPublishRetry(companyId: string, collection: string): void {
  const debounceKey = `${String(companyId || "").trim()}::${String(collection || "").trim()}`;
  if (!debounceKey || debounceKey === "::") return;
  if (retryByKey.has(debounceKey)) return;
  retryByKey.set(
    debounceKey,
    setTimeout(() => {
      retryByKey.delete(debounceKey);
      void flushHostDeltaPublishQueue(companyId, collection);
    }, PUBLISH_RETRY_MS)
  );
}

async function flushHostDeltaPublishQueue(companyId: string, collection: string): Promise<void> {
  const cid = String(companyId || "").trim();
  const col = String(collection || "").trim();
  if (!cid || !col || !(COLLECTIONS_TO_BACKUP as readonly string[]).includes(col)) return;
  if (!(await shouldPublishHostDeltaAfterBridgeWrite(cid))) return;

  const transport = await resolvePlServerHostPublishTransport(cid);
  if (!transport) return;

  const docs: Record<string, unknown>[] = [];
  const keysToFlush: string[] = [];
  for (const [key, doc] of queuedDocs.entries()) {
    if (!key.startsWith(`${cid}::${col}::`)) continue;
    docs.push(doc);
    keysToFlush.push(key);
  }
  if (!docs.length) return;

  const url = `${transport.baseUrl.replace(/\/$/, "")}/__pl_company_delta_push`;
  try {
    await import("@/lib/localSqlite")
      .then(({ flushPendingBrowserDbSave }) => flushPendingBrowserDbSave())
      .catch(() => undefined);
    if (col === "vouchers") {
      plServerVoucherFlowLog("host_publish_start", {
        companyId: cid,
        count: docs.length,
        ids: docs.map((doc) => String(doc.id || "")).filter(Boolean).slice(0, 10),
      });
    }
    const { status, body } = await gateHttpPost(url, transport.accessToken, {
      companyId: cid,
      collection: col,
      docs,
      mirrorProtocol: PL_MIRROR_PROTOCOL_VERSION,
      hostSelfPublish: true,
    });
    const parsed = parseDeltaPushResponseOk(status, body, docs.length);
    if (!parsed.ok) {
      console.warn("[plServerHostDeltaPublish] publish failed", {
        status,
        error: parsed.error || body,
        sent: docs.length,
      });
      if (!parsed.protocolReject) {
        scheduleHostDeltaPublishRetry(cid, col);
      }
      if (col === "vouchers") {
        plServerVoucherFlowLog("host_publish_failed", {
          companyId: cid,
          status,
          sent: docs.length,
          error: parsed.error || body,
        });
      }
      return;
    }
    for (const key of keysToFlush) queuedDocs.delete(key);
    plPhase1bVerifyHook("onHostPublishSuccess");
    if (col === "vouchers") {
      plServerVoucherFlowLog("host_publish_done", {
        companyId: cid,
        status,
        sent: docs.length,
        applied: parsed.applied,
        hostSelfPublish: true,
      });
    }
  } catch (e) {
    console.warn("[plServerHostDeltaPublish] publish error", { error: e });
    if (col === "vouchers") {
      plServerVoucherFlowLog("host_publish_error", {
        companyId: cid,
        sent: docs.length,
        error: e instanceof Error ? e.message : String(e),
      });
    }
    scheduleHostDeltaPublishRetry(cid, col);
  }
}

function queueHostDeltaPublishDoc(
  companyId: string,
  collection: string,
  docId: string,
  doc: Record<string, unknown>
): void {
  const cid = String(companyId || "").trim();
  const col = String(collection || "").trim();
  const id = String(docId || "").trim();
  if (!cid || !col || !id) return;
  queuedDocs.set(pushKey(cid, col, id), serializeDeltaDoc({ ...doc, id }));
  if (col === "vouchers") {
    plServerVoucherFlowLog("host_publish_queued", {
      companyId: cid,
      voucherId: id,
      type: String(doc.type || ""),
      voucherNumber: String(doc.voucherNumber || ""),
      queueSize: [...queuedDocs.keys()].filter((key) => key.startsWith(`${cid}::${col}::`)).length,
    });
  }
  const debounceKey = `${cid}::${col}`;
  const prev = pendingByKey.get(debounceKey);
  if (prev) clearTimeout(prev);
  pendingByKey.set(
    debounceKey,
    setTimeout(() => {
      pendingByKey.delete(debounceKey);
      void flushHostDeltaPublishQueue(cid, col as CompanyBackupCollection);
    }, PUBLISH_DEBOUNCE_MS)
  );
}

/** After bridge-authoritative commit + flush — Host publishes to PlServer once (no duplicate SQLite apply). */
export async function maybePublishHostDeltaAfterBridgeWrite(
  companyId: string,
  collection: string,
  docId: string,
  doc: Record<string, unknown>
): Promise<void> {
  if (!(await shouldPublishHostDeltaAfterBridgeWrite(companyId))) return;
  plPhase1bVerifyHook("onHostPublishQueue");
  queueHostDeltaPublishDoc(companyId, collection, docId, doc);
}
