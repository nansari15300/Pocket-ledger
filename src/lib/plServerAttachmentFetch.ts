"use client";

import { getActiveGate, normalizeServerUrl } from "@/lib/gates/gateStore";
import { resolveLocalServerGateAccessToken } from "@/lib/gates/gateRuntime";
import { gateHttpFetchBlob } from "@/lib/gates/gateServerFetch";
import { isLocalFileRef, LOCAL_FILE_PREFIX } from "@/lib/localPendingFiles";
import { isPlRemoteServerClientMode } from "@/lib/plRemoteServerClient";
import { readDevClientAccessToken } from "@/lib/plServerAccessContext";
import { normalizeAttachmentUrlForDevicePreview } from "@/lib/attachmentHoldClipboard";

function plServerAttachmentRefFromUrl(rawUrl: string): string | null {
  const normalized = normalizeAttachmentUrlForDevicePreview(String(rawUrl || "").trim());
  if (!normalized || !isLocalFileRef(normalized)) return null;
  const id = normalized.slice(LOCAL_FILE_PREFIX.length).trim();
  return id || null;
}

function resolvePlServerAttachmentEndpoint(): { baseUrl: string; accessToken: string } | null {
  if (typeof window === "undefined") return null;
  if (isPlRemoteServerClientMode()) {
    const token = readDevClientAccessToken();
    if (!token) return null;
    return { baseUrl: normalizeServerUrl(window.location.origin), accessToken: token };
  }
  const gate = getActiveGate();
  if (gate.type !== "local_server" || !gate.serverUrl) return null;
  const accessToken = resolveLocalServerGateAccessToken(gate);
  if (!accessToken) return null;
  return { baseUrl: normalizeServerUrl(gate.serverUrl), accessToken };
}

/** Client / plServerShared mirror: `local:` bytes server PC se `/__pl_attachment` par. */
export async function fetchPlServerAttachmentBlob(
  companyId: string,
  rawUrl: string,
  signal?: AbortSignal
): Promise<Blob | null> {
  const cid = String(companyId || "").trim();
  const ref = plServerAttachmentRefFromUrl(rawUrl);
  if (!cid || !ref) return null;

  const endpoint = resolvePlServerAttachmentEndpoint();
  if (!endpoint?.baseUrl) return null;

  const url = `${endpoint.baseUrl.replace(/\/$/, "")}/__pl_attachment?${new URLSearchParams({
    companyId: cid,
    ref,
  }).toString()}`;

  try {
    const { status, blob } = await gateHttpFetchBlob(url, endpoint.accessToken, signal);
    if (status >= 400 || !blob || blob.size <= 0) return null;
    return blob;
  } catch {
    return null;
  }
}

export function canFetchPlServerAttachmentForCompany(companyId?: string | null): boolean {
  if (!String(companyId || "").trim()) return false;
  return resolvePlServerAttachmentEndpoint() != null;
}
