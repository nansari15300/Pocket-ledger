"use client";

import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";
import { isElectronDesktopApp } from "@/lib/isElectronDesktop";
import { isPlHubServerClientMode } from "@/lib/plRemoteServerClient";

const PL_SERVER_HTTP_RELAY = "/api/pl-server-http-relay";

function isLoopbackHostname(hostname: string): boolean {
  const host = String(hostname || "").trim().toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
}

/** Browser blocks HTTPS pages from calling HTTP PL servers — relay via same-origin API. */
export function needsPlServerHttpRelay(targetUrl: string): boolean {
  if (typeof window === "undefined") return false;
  if (isCapacitorNativeApp() || isElectronDesktopApp()) return false;
  try {
    const target = new URL(targetUrl);
    if (isLoopbackHostname(target.hostname)) return false;
    if (window.isSecureContext && target.protocol === "http:") return true;
  } catch {
    /* ignore */
  }
  return false;
}

/** Hub (`localhost:3000`) → remote PL server (`110.x:3001`): same-origin relay (OAuth hub path). */
export function shouldRelayPlServerHttpUrl(targetUrl: string): boolean {
  if (needsPlServerHttpRelay(targetUrl)) return true;
  if (typeof window === "undefined") return false;
  if (isCapacitorNativeApp() || isElectronDesktopApp()) return false;
  if (!isPlHubServerClientMode()) return false;
  try {
    const target = new URL(targetUrl);
    return target.origin !== window.location.origin;
  } catch {
    return false;
  }
}

export type PlServerRelayTextResult = { status: number; body: string };

export async function relayPlServerHttpText(
  url: string,
  method: "GET" | "POST",
  headers: Record<string, string>,
  body?: string,
  signal?: AbortSignal
): Promise<PlServerRelayTextResult> {
  const res = await fetch(PL_SERVER_HTTP_RELAY, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ url, method, headers, body: body ?? null }),
    cache: "no-store",
    signal,
  });
  if (!res.ok) {
    let detail = "";
    try {
      const j = (await res.json()) as { error?: string };
      detail = String(j.error || "").trim();
    } catch {
      /* ignore */
    }
    throw new Error(detail || `Server relay failed (${res.status})`);
  }
  const payload = (await res.json()) as { status?: number; body?: string };
  return { status: typeof payload.status === "number" ? payload.status : 0, body: payload.body ?? "" };
}

export async function relayPlServerHttpBlob(
  url: string,
  headers: Record<string, string>,
  signal?: AbortSignal
): Promise<{ status: number; blob: Blob | null; contentType: string | null }> {
  const res = await fetch(PL_SERVER_HTTP_RELAY, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ url, method: "GET", headers, responseMode: "binary" }),
    cache: "no-store",
    signal,
  });
  if (!res.ok) {
    return { status: res.status, blob: null, contentType: null };
  }
  const payload = (await res.json()) as {
    status?: number;
    bodyBase64?: string;
    contentType?: string | null;
  };
  const status = typeof payload.status === "number" ? payload.status : 0;
  const b64 = String(payload.bodyBase64 || "").trim();
  if (!status || status >= 400 || !b64) {
    return { status, blob: null, contentType: null };
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const contentType = payload.contentType ? String(payload.contentType) : "application/octet-stream";
  return { status, blob: new Blob([bytes], { type: contentType }), contentType };
}
