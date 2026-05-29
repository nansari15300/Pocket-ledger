"use client";

import { CapacitorHttp } from "@capacitor/core";
import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";
import { resolveHostedApiAbsoluteUrl } from "@/lib/billingApiOrigin";

type HeaderMap = Record<string, string>;

function normalizeHeaders(init?: RequestInit): HeaderMap {
  const headers: HeaderMap = {};
  if (!init?.headers) return headers;
  if (init.headers instanceof Headers) {
    init.headers.forEach((v, k) => {
      headers[k] = v;
    });
    return headers;
  }
  if (Array.isArray(init.headers)) {
    for (const [k, v] of init.headers) headers[k] = v;
    return headers;
  }
  return { ...init.headers };
}

async function readBodyData(init?: RequestInit): Promise<string | Record<string, unknown> | undefined> {
  if (init?.body == null) return undefined;
  const raw =
    typeof init.body === "string"
      ? init.body
      : init.body instanceof URLSearchParams
        ? init.body.toString()
        : await new Response(init.body as BodyInit).text();
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return raw;
  }
}

function nativeHttpErrorMessage(url: string, err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/cleartext HTTP traffic to localhost/i.test(raw)) {
    return "Network blocked (localhost). Update the app — sync should use pocket-ledger.com, not http://localhost.";
  }
  if (/failed to fetch|network error|network request failed|unable to resolve host/i.test(raw)) {
    return `Cannot reach server (check internet). If this continues, update the app and try again.`;
  }
  return raw || `Native HTTP failed for ${url}`;
}

/**
 * Static/APK: relative `/api` → `http://localhost` cleartext error; absolute `https://pocket-ledger.com` use karo.
 * CapacitorHttp = OS network stack (CORS bypass).
 */
export async function hostedApiFetch(url: string, init?: RequestInit): Promise<Response> {
  const absoluteUrl = resolveHostedApiAbsoluteUrl(url);
  if (typeof window !== "undefined" && isCapacitorNativeApp()) {
    const method = String(init?.method || "GET").toUpperCase();
    const headers = normalizeHeaders(init);
    const data = method === "GET" || method === "HEAD" ? undefined : await readBodyData(init);
    try {
      const nativeRes = await CapacitorHttp.request({
        url: absoluteUrl,
        method,
        headers,
        ...(data !== undefined ? { data } : {}),
        responseType: "text",
      });
      const status = typeof nativeRes.status === "number" ? nativeRes.status : 0;
      const body =
        nativeRes.data == null
          ? ""
          : typeof nativeRes.data === "string"
            ? nativeRes.data
            : JSON.stringify(nativeRes.data);
      const contentType =
        (nativeRes.headers &&
          (nativeRes.headers["Content-Type"] || nativeRes.headers["content-type"])) ||
        "application/json";
      return new Response(body, {
        status,
        headers: { "Content-Type": String(contentType) },
      });
    } catch (e) {
      throw new Error(nativeHttpErrorMessage(absoluteUrl, e));
    }
  }
  return fetch(absoluteUrl, init);
}

/** Static/HTML 404 par clear message — galat server (static export) vs JSON API. */
export async function parseHostedApiResponseJson<T extends Record<string, unknown>>(
  res: Response
): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    if (/^\s*</.test(text) || /<!DOCTYPE/i.test(text)) {
      throw new Error(
        "Drive API unavailable — npm run dev chalao, http://127.0.0.1:3000 kholo, aur port 3000 par purana static/Electron server band karo."
      );
    }
    throw new Error(res.statusText || "Request failed");
  }
}
