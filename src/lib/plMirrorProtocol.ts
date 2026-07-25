/**
 * P2P delta protocol — keep in sync with electron/plMirrorProtocol.cjs
 *
 * | Client vs Server | Action                          |
 * |------------------|---------------------------------|
 * | Same version     | Normal                          |
 * | Off by 1         | Warn (upgrade one side)         |
 * | Off by 2+        | Reject sync (major mismatch)    |
 */

/** Bump when push/pull/health semantics change incompatibly. */
export const PL_MIRROR_PROTOCOL_VERSION = 3;

/** abs(client - server) >= this → reject (major breaking change). */
export const PL_MIRROR_PROTOCOL_MAJOR_REJECT_DELTA = 2;

export type MirrorProtocolAction = "ok" | "warn" | "reject";

export type MirrorProtocolEvaluation = {
  action: MirrorProtocolAction;
  code: string;
  message?: string;
  clientProtocol: number | null;
  serverProtocol: number | null;
};

export type PlDeltaHealthPayload = {
  ok: boolean;
  mirrorProtocol?: number;
  serverBuild?: string;
  companyId?: string;
  renderer?: string;
  fingerprint?: string;
  voucherCount?: number;
  cacheReload?: boolean;
  dbOpenMs?: number | null;
  exportMs?: number;
  score?: number;
  mirror_bundle_fallback_count?: number;
  lastSuccessfulMirrorPushMsAgo?: number | null;
  lastSuccessfulMirrorPullMsAgo?: number | null;
  error?: string;
};

export function evaluateMirrorProtocol(
  clientProtocol: unknown,
  serverProtocol: unknown
): MirrorProtocolEvaluation {
  const client = Number(clientProtocol);
  const server = Number(serverProtocol);
  const base = {
    clientProtocol: Number.isFinite(client) ? client : null,
    serverProtocol: Number.isFinite(server) ? server : null,
  };
  if (!Number.isFinite(client) || client <= 0 || !Number.isFinite(server) || server <= 0) {
    return { action: "ok", code: "mirror_protocol_unknown", ...base };
  }
  const diff = client - server;
  const abs = Math.abs(diff);
  if (abs === 0) {
    return { action: "ok", code: "mirror_protocol_match", ...base };
  }
  if (abs >= PL_MIRROR_PROTOCOL_MAJOR_REJECT_DELTA) {
    return {
      action: "reject",
      code: "mirror_protocol_major_mismatch",
      message: `Delta protocol major mismatch (client ${client}, server ${server}). Update Pocket Ledger on both PCs to the same version.`,
      ...base,
    };
  }
  if (diff < 0) {
    return {
      action: "warn",
      code: "mirror_protocol_older_client",
      message: `Client delta protocol ${client} is older than server ${server}. Update the client app when possible.`,
      ...base,
    };
  }
  return {
    action: "warn",
    code: "mirror_protocol_newer_client",
    message: `Client delta protocol ${client} is newer than server ${server}. Update the server PC app when possible.`,
    ...base,
  };
}

/** @deprecated Prefer evaluateMirrorProtocol */
export function isMirrorProtocolCompatible(serverProtocol: unknown): boolean {
  return evaluateMirrorProtocol(PL_MIRROR_PROTOCOL_VERSION, serverProtocol).action !== "reject";
}

export function logMirrorProtocolEvaluation(
  evaluation: MirrorProtocolEvaluation,
  context: string
): void {
  if (evaluation.action === "ok") return;
  const payload = {
    context,
    code: evaluation.code,
    clientProtocol: evaluation.clientProtocol,
    serverProtocol: evaluation.serverProtocol,
  };
  if (evaluation.action === "reject") {
    console.error("[DeltaProtocol]", evaluation.message || evaluation.code, payload);
    return;
  }
  console.warn("[DeltaProtocol]", evaluation.message || evaluation.code, payload);
}

/** Remote diagnostics: GET /__pl_delta_health */
export async function fetchPlDeltaHealth(
  baseUrl: string,
  accessToken: string,
  companyId: string
): Promise<PlDeltaHealthPayload | null> {
  const cid = String(companyId || "").trim();
  if (!cid || !baseUrl) return null;
  const url = `${baseUrl.replace(/\/$/, "")}/__pl_delta_health?companyId=${encodeURIComponent(cid)}`;
  const { gateHttpGet } = await import("@/lib/gates/gateServerFetch");
  const { status, body } = await gateHttpGet(url, accessToken);
  if (!status || status >= 400) return null;
  try {
    const health = JSON.parse(body) as PlDeltaHealthPayload;
    const evaluation = evaluateMirrorProtocol(PL_MIRROR_PROTOCOL_VERSION, health.mirrorProtocol);
    logMirrorProtocolEvaluation(evaluation, "health");
    return health;
  } catch {
    return null;
  }
}
