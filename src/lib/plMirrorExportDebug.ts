"use client";

import { gateHttpGet } from "@/lib/gates/gateServerFetch";
import { normalizeServerUrl, getActiveGate } from "@/lib/gates/gateStore";
import { resolveLocalServerGateAccessToken } from "@/lib/gates/gateRuntime";

export type MirrorDocsFingerprint = {
  count: number;
  firstId: string | null;
  lastId: string | null;
  maxUpdatedAt: number;
  /** SHA-1 of sorted id|updatedAt|deleted rows — catches subtle dataset drift. */
  datasetFingerprint: string;
};

function mirrorDocUpdatedAtMs(d: Record<string, unknown>): number {
  const raw = d.updatedAt ?? d.lastEditedAt ?? d.createdAt;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (raw && typeof raw === "object") {
    const o = raw as { seconds?: number; nanoseconds?: number };
    if (typeof o.seconds === "number") {
      return o.seconds * 1000 + Math.floor((o.nanoseconds || 0) / 1e6);
    }
  }
  return 0;
}

/** Canonical payload for dataset fingerprint (shared semantics with electron/main.js). */
export function mirrorDocsFingerprintPayload(docs: Array<Record<string, unknown>>): string {
  return [...docs]
    .sort((a, b) => String(a.id || "").localeCompare(String(b.id || "")))
    .map((d) => {
      const id = String(d.id || "");
      const upd = String(d.updatedAt ?? d.lastEditedAt ?? "");
      const deleted = d.isDeleted === true || d.deleted === true ? 1 : 0;
      return `${id}|${upd}|${deleted}`;
    })
    .join("\n");
}

async function sha1HexPrefix(input: string, prefixLen = 8): Promise<string> {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    let h = 0;
    for (let i = 0; i < input.length; i++) h = (Math.imul(31, h) + input.charCodeAt(i)) | 0;
    return `djb2${Math.abs(h).toString(16).slice(0, 6)}`;
  }
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-1", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, prefixLen);
}

/** Dev/Test 5: voucher export dataset fingerprint — count + ID bounds + max updatedAt + SHA-1 dataset. */
export async function fingerprintMirrorDocs(
  docs: Array<Record<string, unknown>>
): Promise<MirrorDocsFingerprint> {
  const ids = docs
    .map((d) => String(d.id || "").trim())
    .filter(Boolean)
    .sort();
  let maxUpdatedAt = 0;
  for (const d of docs) {
    const ms = mirrorDocUpdatedAtMs(d);
    if (ms > maxUpdatedAt) maxUpdatedAt = ms;
  }
  const datasetFingerprint = await sha1HexPrefix(mirrorDocsFingerprintPayload(docs));
  return {
    count: docs.length,
    firstId: ids[0] ?? null,
    lastId: ids.length ? ids[ids.length - 1]! : null,
    maxUpdatedAt,
    datasetFingerprint,
  };
}

export function mirrorDocFingerprintsEqual(a: MirrorDocsFingerprint, b: MirrorDocsFingerprint): boolean {
  return (
    a.count === b.count &&
    a.firstId === b.firstId &&
    a.lastId === b.lastId &&
    a.maxUpdatedAt === b.maxUpdatedAt &&
    a.datasetFingerprint === b.datasetFingerprint
  );
}

async function fetchMirrorCollectionDocs(
  companyId: string,
  collection: string
): Promise<Array<Record<string, unknown>> | null> {
  const gate = getActiveGate();
  if (gate.type !== "local_server" || !gate.serverUrl) return null;
  const baseUrl = normalizeServerUrl(gate.serverUrl);
  const accessToken = resolveLocalServerGateAccessToken(gate);
  if (!baseUrl || !accessToken) return null;
  const url = `${baseUrl.replace(/\/$/, "")}/__pl_company_mirror/${encodeURIComponent(companyId)}/${encodeURIComponent(collection)}`;
  const { status, body } = await gateHttpGet(url, accessToken);
  if (!status || status >= 400) return null;
  try {
    const parsed = JSON.parse(body) as { docs?: unknown };
    return Array.isArray(parsed?.docs) ? (parsed.docs as Array<Record<string, unknown>>) : null;
  } catch {
    return null;
  }
}

/** Dev Test 5: do consecutive GET exports — fingerprints must match. */
export async function debugCompareMirrorExportConsistency(
  companyId: string,
  collection = "vouchers"
): Promise<{
  ok: boolean;
  first: MirrorDocsFingerprint | null;
  second: MirrorDocsFingerprint | null;
}> {
  const firstDocs = await fetchMirrorCollectionDocs(companyId, collection);
  const secondDocs = await fetchMirrorCollectionDocs(companyId, collection);
  if (!firstDocs || !secondDocs) {
    return { ok: false, first: null, second: null };
  }
  const first = await fingerprintMirrorDocs(firstDocs);
  const second = await fingerprintMirrorDocs(secondDocs);
  const ok = mirrorDocFingerprintsEqual(first, second);
  if (process.env.NODE_ENV === "development") {
    console.log("[MirrorExportConsistency]", { collection, first, second, ok });
  }
  return { ok, first, second };
}

/** Deterministic renderer ranking (mirrors electron/main.js). */
export function mirrorExportScoreFromDocs(
  docs: Array<Record<string, unknown>>,
  rendererPriority: number
): number {
  let maxUpdatedAt = 0;
  for (const d of docs) {
    const ms = mirrorDocUpdatedAtMs(d);
    if (ms > maxUpdatedAt) maxUpdatedAt = ms;
  }
  return 100_000 * docs.length + 1_000 * maxUpdatedAt + rendererPriority;
}
