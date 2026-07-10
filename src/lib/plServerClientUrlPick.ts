"use client";

import { normalizeServerUrl } from "@/lib/gates/gateStore";

export type PlServerUrlKind = "loopback" | "lan" | "public" | "unknown";

export function plServerUrlKind(url: string): PlServerUrlKind {
  try {
    const h = new URL(url).hostname.toLowerCase();
    if (h === "127.0.0.1" || h === "localhost") return "loopback";
    if (/^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\./.test(h)) return "lan";
    return "public";
  } catch {
    return "unknown";
  }
}

/** HTTPS web → public first (relay). HTTP dev/LAN → loopback/LAN before public (hairpin NAT). */
export function preferPlServerUrlsForClient(urls: string[]): string[] {
  const seen = new Set<string>();
  const norm: string[] = [];
  for (const raw of urls) {
    const u = normalizeServerUrl(String(raw || ""));
    if (!u || seen.has(u)) continue;
    seen.add(u);
    norm.push(u);
  }
  const httpsClient = typeof window !== "undefined" && window.isSecureContext;
  const score = (url: string) => {
    const kind = plServerUrlKind(url);
    if (httpsClient) {
      if (kind === "public") return 1;
      if (kind === "lan") return 2;
      if (kind === "loopback") return 3;
      return 4;
    }
    if (kind === "loopback") return 1;
    if (kind === "lan") return 2;
    if (kind === "public") return 3;
    return 4;
  };
  return [...norm].sort((a, b) => score(a) - score(b));
}

export function pickDefaultPlServerShareUrlForClient(urls: string[]): string {
  return preferPlServerUrlsForClient(urls)[0] || "";
}

/** User pick first, then fall back through remaining addresses. */
export function orderPlServerUrlsWithPreferred(preferred: string, urls: string[]): string[] {
  const ordered = preferPlServerUrlsForClient(urls);
  const pref = normalizeServerUrl(preferred);
  if (!pref) return ordered;
  return [pref, ...ordered.filter((u) => u !== pref)];
}
