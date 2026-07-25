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
  resolvePlServerDeltaTransport,
  syncPlServerSharedCompanyLive,
} from "@/lib/plServerClientDeltaSync";
import { livePullDevLog } from "@/lib/plServerLivePullDevLog";

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

export async function isLocalAuthoritativeHostForCompany(companyId: string): Promise<boolean> {
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
  if (isCanonicalServerBridgeRenderer()) return false;
  if (!routeOptions?.simulateLanClient && (await isLocalAuthoritativeHostForCompany(companyId))) return false;
  if (!shouldFetchPlServerAccessContext()) return false;
  if (typeof navigator !== "undefined" && !navigator.onLine) return false;

  const transport = resolvePlServerDeltaTransport(companyId);
  if (!transport) return false;

  const id = String(companyId || "").trim();
  let gateOk = transport.gateAllowed || transport.unlockedLocally;
  if (!gateOk) {
    // Staff local id allow-list miss (host id alag) — server_gate company phir bhi Host pe likhe.
    try {
      const row = await getLocalCompanyById(id, { includeDeleted: true });
      if (row && isServerGateCompany(row)) gateOk = true;
    } catch {
      /* keep gateOk */
    }
  }
  if (!gateOk) return false;

  try {
    const row = await getLocalCompanyById(id, { includeDeleted: true });
    if (row && isLocalServerShareableCompany(row)) return true;
    // Thin staff / gate-joined company — Host authoritative write (shareable host-only list me nahi hota).
    if (row && isServerGateCompany(row)) return true;
  } catch {
    /* fall through to shared-company check */
  }

  if (isPlServerSharedCompanyRow({ id }, transport.gate.id)) return true;

  try {
    const { matchPlServerSharedCompanyForLocalId } = await import("@/lib/plServerHostCompanyId");
    const { getPlServerSharedCompanies } = await import("@/lib/plServerAccessContext");
    if (matchPlServerSharedCompanyForLocalId(id, getPlServerSharedCompanies())) return true;
  } catch {
    /* ignore */
  }

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

/** Online LAN client: POST to Milestone 1 authoritative endpoint; optimistic local_commit follows in upsert orchestrator. */
export async function invokePlServerAuthoritativeDocUpsert(
  companyId: string,
  collectionName: string,
  docId: string,
  data: Record<string, unknown>,
  options?: UpsertCompanyBrowserOptions
): Promise<void> {
  const transport = resolvePlServerDeltaTransport(companyId);
  if (!transport) {
    throw new PlServerAuthoritativeWriteError("authoritative_transport_unavailable");
  }

  const { resolvePlServerHostCompanyId } = await import("@/lib/plServerHostCompanyId");
  const hostCompanyId = (await resolvePlServerHostCompanyId(companyId)) || companyId;

  const payload = {
    companyId: hostCompanyId,
    collectionName,
    docId,
    data: serializeCompanyDocForLocalDb({ ...data, id: docId }),
    notify: options?.notify !== false,
    skipCloudSyncEnqueue: options?.skipCloudSyncEnqueue,
    skipPlanMutationGate: options?.skipPlanMutationGate,
    force: options?.force,
  };

  const url = `${transport.baseUrl.replace(/\/$/, "")}/__pl_authoritative_company_doc_upsert`;
  const { status, body } = await gateHttpPost(url, transport.accessToken, payload, { timeoutMs: 6_000 });
  const parsed = parseAuthoritativeUpsertResponse(status, body);
  if (!parsed.ok) {
    throw new PlServerAuthoritativeWriteError(parsed.error || "authoritative_upsert_failed");
  }

  const skipPullForVerify =
    typeof window !== "undefined" &&
    Boolean((window as unknown as { __plPhase1bVerifyCapture?: unknown }).__plPhase1bVerifyCapture);
  const { isPlServerThinStaffClient } = await import("@/lib/plServerThinStaffClient");
  if (!skipPullForVerify && !isPlServerThinStaffClient()) {
    // PLServer LAN stability (frozen): save must not block on full ledger pull — UI updates via optimistic local_commit.
    // Thin staff: display cache pehle se `patchPlServerDisplayCacheDoc` se update — har save par full pull slow hai.
    void syncPlServerSharedCompanyLive(companyId).then((pull) => {
      if (!pull.ok) {
        console.warn(
          "[plServerAuthoritativeWrite] Host save succeeded but background ledger pull did not complete",
          { companyId, ok: pull.ok, fullPull: pull.fullPull }
        );
        livePullDevLog("pull_after_authoritative_write_incomplete", {
          companyId,
          ok: pull.ok,
          fullPull: pull.fullPull,
        });
      }
    });
  }
}
