"use client";

import { COLLECTIONS_TO_BACKUP, type CompanyBackupCollection } from "@/lib/companyBackupCollections";
import { getLocalCompanyById } from "@/lib/localCompanyStore";
import { isServerGateCompany } from "@/lib/companyStorageKind";
import { isLocalServerShareableCompany } from "@/lib/localServerShareableCompanies";
import { isLocalAppServerHost } from "@/lib/localAppServerDevPreview";
import { getElectronLocalServerApi } from "@/lib/electronLocalServer";
import { gateHttpPost } from "@/lib/gates/gateServerFetch";
import { isPlRemoteServerClientMode } from "@/lib/plRemoteServerClient";
import { isCanonicalServerBridgeRenderer } from "@/lib/hostBridgeWrite";
import { PL_MIRROR_PROTOCOL_VERSION } from "@/lib/plMirrorProtocol";
import { outboxJsonParse, outboxJsonStringify } from "@/lib/localVoucherOutbox";
import { plPhase1bVerifyHook } from "@/lib/phase1bVerifyCapture";
import { parseMirrorPushResponseOk } from "@/lib/plServerClientMirrorPush";

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

function serializeMirrorDoc(doc: Record<string, unknown>): Record<string, unknown> {
  return outboxJsonParse(outboxJsonStringify(doc));
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
    if (!status?.sharingActive || !status.sharingPort) return null;
    sharingPort = status.sharingPort;
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
  if (!isCanonicalServerBridgeRenderer()) return null;
  return resolvePlServerHostLoopbackTransport(companyId);
}

async function shouldPublishHostMirrorAfterBridgeWrite(companyId: string): Promise<boolean> {
  const transport = await resolvePlServerHostPublishTransport(companyId);
  return transport != null;
}

function scheduleHostMirrorPublishRetry(companyId: string, collection: string): void {
  const debounceKey = `${String(companyId || "").trim()}::${String(collection || "").trim()}`;
  if (!debounceKey || debounceKey === "::") return;
  if (retryByKey.has(debounceKey)) return;
  retryByKey.set(
    debounceKey,
    setTimeout(() => {
      retryByKey.delete(debounceKey);
      void flushHostMirrorPublishQueue(companyId, collection);
    }, PUBLISH_RETRY_MS)
  );
}

async function flushHostMirrorPublishQueue(companyId: string, collection: string): Promise<void> {
  const cid = String(companyId || "").trim();
  const col = String(collection || "").trim();
  if (!cid || !col || !(COLLECTIONS_TO_BACKUP as readonly string[]).includes(col)) return;
  if (!(await shouldPublishHostMirrorAfterBridgeWrite(cid))) return;

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

  const url = `${transport.baseUrl.replace(/\/$/, "")}/__pl_company_mirror_push`;
  try {
    const { status, body } = await gateHttpPost(url, transport.accessToken, {
      companyId: cid,
      collection: col,
      docs,
      mirrorProtocol: PL_MIRROR_PROTOCOL_VERSION,
      hostSelfPublish: true,
    });
    const parsed = parseMirrorPushResponseOk(status, body, docs.length);
    if (!parsed.ok) {
      console.warn("[plServerHostMirrorPublish] publish failed", {
        status,
        error: parsed.error || body,
        sent: docs.length,
      });
      if (!parsed.protocolReject) {
        scheduleHostMirrorPublishRetry(cid, col);
      }
      return;
    }
    for (const key of keysToFlush) queuedDocs.delete(key);
    plPhase1bVerifyHook("onHostPublishSuccess");
  } catch (e) {
    console.warn("[plServerHostMirrorPublish] publish error", { error: e });
    scheduleHostMirrorPublishRetry(cid, col);
  }
}

function queueHostMirrorPublishDoc(
  companyId: string,
  collection: string,
  docId: string,
  doc: Record<string, unknown>
): void {
  const cid = String(companyId || "").trim();
  const col = String(collection || "").trim();
  const id = String(docId || "").trim();
  if (!cid || !col || !id) return;
  queuedDocs.set(pushKey(cid, col, id), serializeMirrorDoc({ ...doc, id }));
  const debounceKey = `${cid}::${col}`;
  const prev = pendingByKey.get(debounceKey);
  if (prev) clearTimeout(prev);
  pendingByKey.set(
    debounceKey,
    setTimeout(() => {
      pendingByKey.delete(debounceKey);
      void flushHostMirrorPublishQueue(cid, col as CompanyBackupCollection);
    }, PUBLISH_DEBOUNCE_MS)
  );
}

/** After bridge-authoritative commit + flush — Host publishes to PlServer once (no duplicate SQLite apply). */
export async function maybePublishHostMirrorAfterBridgeWrite(
  companyId: string,
  collection: string,
  docId: string,
  doc: Record<string, unknown>
): Promise<void> {
  if (!(await shouldPublishHostMirrorAfterBridgeWrite(companyId))) return;
  plPhase1bVerifyHook("onHostPublishQueue");
  queueHostMirrorPublishDoc(companyId, collection, docId, doc);
}
