"use client";

import type { UpsertCompanyBrowserOptions } from "@/lib/localCompanyDocMirror";
import { serializeCompanyDocForLocalDb } from "@/lib/localCompanyDocMirror";
import { getLocalCompanyById } from "@/lib/localCompanyStore";
import { isServerGateCompany } from "@/lib/companyStorageKind";
import { isLocalServerShareableCompany } from "@/lib/localServerShareableCompanies";
import { gateHttpPost } from "@/lib/gates/gateServerFetch";
import { isPlRemoteServerClientMode } from "@/lib/plRemoteServerClient";
import { isCanonicalServerBridgeRenderer } from "@/lib/hostBridgeWrite";
import { isLocalAppServerHost } from "@/lib/localAppServerDevPreview";
import {
  shouldFetchPlServerAccessContext,
  isPlServerSharedCompanyRow,
} from "@/lib/plServerAccessContext";
import {
  resolvePlServerMirrorTransport,
  syncPlServerSharedCompanyLive,
} from "@/lib/plServerClientMirrorPush";

export class PlServerAuthoritativeWriteError extends Error {
  readonly plAuthoritativeWriteFailed = true;

  constructor(message: string) {
    super(message);
    this.name = "PlServerAuthoritativeWriteError";
  }
}

export type PlServerAuthoritativeRouteOptions = {
  /** Runtime verify: simulate LAN client routing on authoritative Host. */
  simulateLanClient?: boolean;
};

async function isLocalAuthoritativeHostForCompany(companyId: string): Promise<boolean> {
  if (!isLocalAppServerHost()) return false;
  if (typeof window === "undefined") return false;
  const bridge = (window as unknown as { plElectronBridge?: { authoritativeCompanyDocUpsert?: unknown } })
    .plElectronBridge;
  if (!bridge?.authoritativeCompanyDocUpsert) return false;
  try {
    const row = await getLocalCompanyById(companyId, { includeDeleted: true });
    return Boolean(row && isLocalServerShareableCompany(row) && !isServerGateCompany(row));
  } catch {
    return false;
  }
}

export async function shouldRoutePlServerAuthoritativeWrite(
  companyId: string,
  options?: UpsertCompanyBrowserOptions,
  routeOptions?: PlServerAuthoritativeRouteOptions
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (options?.notify === false) return false;
  if (isPlRemoteServerClientMode()) return false;
  if (isCanonicalServerBridgeRenderer()) return false;
  if (!routeOptions?.simulateLanClient && (await isLocalAuthoritativeHostForCompany(companyId))) return false;
  if (!shouldFetchPlServerAccessContext()) return false;
  if (typeof navigator !== "undefined" && !navigator.onLine) return false;

  const transport = resolvePlServerMirrorTransport(companyId);
  if (!transport) return false;
  if (!transport.gateAllowed && !transport.unlockedLocally) return false;

  const id = String(companyId || "").trim();
  try {
    const row = await getLocalCompanyById(id, { includeDeleted: true });
    if (row && isLocalServerShareableCompany(row)) return true;
  } catch {
    /* fall through to shared-company check */
  }

  if (isPlServerSharedCompanyRow({ id }, transport.gate.id)) return true;

  return false;
}

function parseAuthoritativeUpsertResponse(
  status: number,
  body: string
): { ok: boolean; written?: boolean; error?: string } {
  if (!status || status >= 400) {
    return { ok: false, error: body || `HTTP ${status || 0}` };
  }
  const trimmed = String(body || "").trim();
  if (!trimmed) return { ok: true };
  try {
    const payload = JSON.parse(trimmed) as { ok?: boolean; written?: boolean; error?: string };
    if (payload?.ok === false) {
      return { ok: false, error: String(payload.error || "authoritative_upsert_rejected") };
    }
    return { ok: true, written: payload.written };
  } catch {
    return { ok: false, error: "authoritative_response_not_json" };
  }
}

/** Online LAN client: POST to Milestone 1 authoritative endpoint; no local SQLite commit. */
export async function invokePlServerAuthoritativeDocUpsert(
  companyId: string,
  collectionName: string,
  docId: string,
  data: Record<string, unknown>,
  options?: UpsertCompanyBrowserOptions
): Promise<void> {
  const transport = resolvePlServerMirrorTransport(companyId);
  if (!transport) {
    throw new PlServerAuthoritativeWriteError("authoritative_transport_unavailable");
  }

  const payload = {
    companyId,
    collectionName,
    docId,
    data: serializeCompanyDocForLocalDb({ ...data, id: docId }),
    notify: options?.notify !== false,
    skipCloudSyncEnqueue: options?.skipCloudSyncEnqueue,
    skipPlanMutationGate: options?.skipPlanMutationGate,
    force: options?.force,
  };

  const url = `${transport.baseUrl.replace(/\/$/, "")}/__pl_authoritative_company_doc_upsert`;
  const { status, body } = await gateHttpPost(url, transport.accessToken, payload);
  const parsed = parseAuthoritativeUpsertResponse(status, body);
  if (!parsed.ok) {
    throw new PlServerAuthoritativeWriteError(parsed.error || "authoritative_upsert_failed");
  }

  const skipPullForVerify =
    typeof window !== "undefined" &&
    Boolean((window as unknown as { __plPhase1bVerifyCapture?: unknown }).__plPhase1bVerifyCapture);
  if (!skipPullForVerify) {
    await syncPlServerSharedCompanyLive(companyId);
  }
}
