"use client";

type PlElectronTraceBridge = {
  log?: (tag: string, event: string, detail?: unknown) => void;
  getRecentLogs?: (limit?: number) => Promise<Array<{ ts: string; tag: string; event: string; detail: string }>>;
  getLogFilePath?: () => Promise<string | null>;
};

const TRACE_ENABLED_KEY = "pl_trace";
const DEFAULT_TAG = "PL-GATE-TRACE";

/** Console flood off. Re-enable only via explicit call + `pl_trace=1` later if needed. */
const PL_GATE_TRACE_CONSOLE = false;

function getTraceBridge(): PlElectronTraceBridge | null {
  if (typeof window === "undefined") return null;
  return (window as Window & { plElectronTrace?: PlElectronTraceBridge }).plElectronTrace ?? null;
}

/** Gate / live-change traces — console silenced (flood). */
export function plGateTrace(event: string, detail?: unknown, tag = DEFAULT_TAG): void {
  if (!PL_GATE_TRACE_CONSOLE) return;
  void event;
  void detail;
  void tag;
  void TRACE_ENABLED_KEY;
  void getTraceBridge;
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
