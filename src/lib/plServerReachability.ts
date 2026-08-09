/**
 * Shared PL server reachability — one ping per serverUrl, shared by menu / lists / header chips.
 */

import { gateHttpGet } from "@/lib/gates/gateServerFetch";

export type PlServerReachability = "online" | "offline" | "unknown";

export const PL_SERVER_REACHABILITY_CHANGED_EVENT = "pl-server-reachability-changed";

type CacheEntry = {
  status: PlServerReachability;
  pingMs: number | null;
  checkedAt: number;
};

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<CacheEntry>>();
const watchers = new Map<string, number>();
const timers = new Map<string, number>();

const PING_INTERVAL_MS = 5_000;
const STALE_MS = 8_000;

function normalizeServerUrl(raw: string): string {
  return String(raw || "")
    .trim()
    .replace(/\/$/, "");
}

function emit(serverUrl: string, entry: CacheEntry): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(PL_SERVER_REACHABILITY_CHANGED_EVENT, {
      detail: { serverUrl, ...entry },
    })
  );
}

export function getCachedPlServerReachability(serverUrl: string): CacheEntry | null {
  const key = normalizeServerUrl(serverUrl);
  if (!key) return null;
  return cache.get(key) ?? null;
}

export async function pingPlServerReachability(serverUrl: string, companyId?: string | null): Promise<CacheEntry> {
  const key = normalizeServerUrl(serverUrl);
  if (!key) return { status: "unknown", pingMs: null, checkedAt: Date.now() };

  const existing = inFlight.get(key);
  if (existing) return existing;

  const work = (async () => {
    try {
      const pingUrl = new URL(`${key}/__pl_server_ping`);
      if (companyId) pingUrl.searchParams.set("companyId", String(companyId));
      const prev = cache.get(key)?.pingMs;
      if (prev != null) pingUrl.searchParams.set("clientPingMs", String(prev));
      const started = performance.now();
      const { status } = await gateHttpGet(pingUrl.toString(), "", { timeoutMs: 12_000 });
      const measuredMs = status === 200 ? Math.max(1, Math.round(performance.now() - started)) : null;
      const entry: CacheEntry = {
        status: measuredMs != null ? "online" : "offline",
        pingMs: measuredMs,
        checkedAt: Date.now(),
      };
      cache.set(key, entry);
      emit(key, entry);
      return entry;
    } catch {
      const entry: CacheEntry = { status: "offline", pingMs: null, checkedAt: Date.now() };
      cache.set(key, entry);
      emit(key, entry);
      return entry;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, work);
  return work;
}

/** Keep a serverUrl polled while any UI watches it. */
export function watchPlServerReachability(
  serverUrl: string,
  companyId?: string | null
): () => void {
  const key = normalizeServerUrl(serverUrl);
  if (!key || typeof window === "undefined") return () => {};

  const prev = watchers.get(key) ?? 0;
  watchers.set(key, prev + 1);

  const cached = cache.get(key);
  if (!cached || Date.now() - cached.checkedAt > STALE_MS) {
    void pingPlServerReachability(key, companyId);
  }

  if (prev === 0 && !timers.has(key)) {
    const timer = window.setInterval(() => {
      void pingPlServerReachability(key, companyId);
    }, PING_INTERVAL_MS);
    timers.set(key, timer);
  }

  return () => {
    const n = (watchers.get(key) ?? 1) - 1;
    if (n <= 0) {
      watchers.delete(key);
      const timer = timers.get(key);
      if (timer != null) {
        window.clearInterval(timer);
        timers.delete(key);
      }
    } else {
      watchers.set(key, n);
    }
  };
}

export function plServerUrlFromCompany(company: unknown): string {
  if (!company || typeof company !== "object") return "";
  return normalizeServerUrl(
    String((company as { plServerGateServerUrl?: string }).plServerGateServerUrl || "")
  );
}
