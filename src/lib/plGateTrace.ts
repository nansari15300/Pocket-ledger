"use client";

import { isElectronDesktopApp } from "@/lib/isElectronDesktop";

type PlElectronTraceBridge = {
  log?: (tag: string, event: string, detail?: unknown) => void;
  getRecentLogs?: (limit?: number) => Promise<Array<{ ts: string; tag: string; event: string; detail: string }>>;
  getLogFilePath?: () => Promise<string | null>;
};

const TRACE_ENABLED_KEY = "pl_trace";
const DEFAULT_TAG = "PL-GATE-TRACE";

function traceEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (isElectronDesktopApp()) return true;
  try {
    if (localStorage.getItem(TRACE_ENABLED_KEY) === "1") return true;
    if (sessionStorage.getItem(TRACE_ENABLED_KEY) === "1") return true;
  } catch {
    /* ignore */
  }
  return process.env.NODE_ENV === "development";
}

function getTraceBridge(): PlElectronTraceBridge | null {
  if (typeof window === "undefined") return null;
  return (window as Window & { plElectronTrace?: PlElectronTraceBridge }).plElectronTrace ?? null;
}

/** Gate Test / Open gate flow — user DevTools console + EXE file log. */
export function plGateTrace(event: string, detail?: unknown, tag = DEFAULT_TAG): void {
  if (!traceEnabled()) return;
  try {
    console.log(`[${tag}]`, event, detail ?? "");
  } catch {
    /* ignore */
  }
  try {
    getTraceBridge()?.log?.(tag, event, detail);
  } catch {
    /* ignore */
  }
}

export function enablePlGateTrace(persist = true): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(TRACE_ENABLED_KEY, "1");
    if (persist) localStorage.setItem(TRACE_ENABLED_KEY, "1");
  } catch {
    /* ignore */
  }
}

export async function readPlGateTraceLogs(limit = 200) {
  try {
    return (await getTraceBridge()?.getRecentLogs?.(limit)) ?? [];
  } catch {
    return [];
  }
}
