"use client";

import {
  canDismissClientHealthEmergencyOverlay,
  hideClientHealthEmergencyOverlay,
  refreshClientHealthEmergencyOverlayLog,
  showClientHealthEmergencyOverlay,
} from "@/lib/clientHealthEmergencyOverlay";

/**
 * Client UI health: recent clicks, JS errors, and main-thread stalls (freeze hints).
 *
 * Default ON only in development builds (`npm run dev`). Production web/EXE/APK: OFF.
 * Opt-out (dev): localStorage pl_ui_health_monitor=0
 * Force ON (prod debug): pl_ui_health_monitor=1 or NEXT_PUBLIC_PL_UI_HEALTH_MONITOR=1
 *
 * Manual diary: Ctrl+Shift+U (when monitor enabled).
 * After freeze: diary auto-opens when the main thread recovers (stall detected) or tab becomes visible again.
 * Snapshot: company, route, online, outbox pending, SQLite voucher/party row counts (on alert + every 45s).
 */

export const PL_CLIENT_HEALTH_LOG_EVENT = "pl_client_health_ring";
export const PL_CLIENT_HEALTH_ALERT_EVENT = "pl_client_health_alert";

export type ClientHealthEntryKind = "click" | "error" | "rejection" | "stall" | "info";

export type ClientHealthEntry = {
  id: string;
  at: number;
  kind: ClientHealthEntryKind;
  summary: string;
  detail?: string;
  route?: string;
};

/** Live app context — React layer updates this for diary / export. */
export type ClientHealthMonitorSnapshot = {
  companyId?: string;
  companyName?: string;
  route?: string;
  online?: boolean;
  outboxPending?: number | null;
  sqliteVoucherRows?: number | null;
  sqlitePartyRows?: number | null;
  updatedAt?: number;
};

export type ClientHealthAlertDetail = {
  reason: string;
  source: "stall" | "error" | "recovery";
  forceOpen?: boolean;
};

export const PL_CLIENT_HEALTH_SNAPSHOT_EVENT = "pl_client_health_snapshot";
export const PL_UI_HEALTH_BRAKE_EVENT = "pl_ui_health_brake";

const RING_MAX = 100;
/** Log long tasks in diary from this duration (ms). */
const LONG_TASK_LOG_MS = 4000;
/** Emergency overlay + brake when main-thread block is at least this long (ms). */
export const PL_UI_HEALTH_STALL_OVERLAY_MIN_MS = 5000;
/** Imperative “UI paused” overlay stays at least this long before Resume (ms). */
export const PL_UI_HEALTH_EMERGENCY_OVERLAY_MIN_VISIBLE_MS = 5000;
const STALL_OVERLAY_MIN_MS = PL_UI_HEALTH_STALL_OVERLAY_MIN_MS;
const SESSION_KEY = "pl_ui_health_ring_v1";
const SNAPSHOT_SESSION_KEY = "pl_ui_health_snapshot_v1";
const PENDING_STALL_KEY = "pl_ui_health_pending_stall_v1";
const STALL_MS = 3500;
/** setTimeout clamp (background tab / sleep) — not a real UI stall. */
const HEARTBEAT_TIMER_DRIFT_MAX_MS = 15_000;
const HEARTBEAT_MS = 500;
const ALERT_COOLDOWN_MS = 45_000;
const STALL_ALERT_COOLDOWN_MS = 8_000;
const STALL_RECOVERY_MAX_AGE_MS = 5 * 60_000;

const ring: ClientHealthEntry[] = [];
let snapshot: ClientHealthMonitorSnapshot = {};
let brakeEngaged = false;
const brakeListeners = new Set<() => void>();
let started = false;
let lastAlertAt = 0;
let lastStallAlertAt = 0;
/** DOM timer handle (`window.setTimeout` → number; avoids Node `Timeout` type clash in tsc). */
let heartbeatTimer: number | null = null;
let heartbeatExpected = 0;
let lastChunkInfoLoggedAt = 0;
let healthDiaryAfterOverlayTimer: number | null = null;

function parseStallDurationMs(summary: string): number | null {
  const m = String(summary || "").match(/~(\d+)\s*ms/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function readPersistedSnapshot(): ClientHealthMonitorSnapshot {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(SNAPSHOT_SESSION_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as ClientHealthMonitorSnapshot;
  } catch {
    return {};
  }
}

function persistSnapshotToSession(s: ClientHealthMonitorSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SNAPSHOT_SESSION_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

function mergeSnapshots(
  a: ClientHealthMonitorSnapshot,
  b: Partial<ClientHealthMonitorSnapshot>
): ClientHealthMonitorSnapshot {
  const pickStr = (bv: string | undefined, av: string | undefined) => {
    const t = String(bv ?? "").trim();
    if (t) return t;
    return String(av ?? "").trim() || undefined;
  };
  const pick = <K extends keyof ClientHealthMonitorSnapshot>(key: K) => {
    const bv = b[key];
    const av = a[key];
    if (key === "companyId" || key === "companyName" || key === "route") {
      return pickStr(bv as string | undefined, av as string | undefined) as ClientHealthMonitorSnapshot[K];
    }
    if (bv !== undefined && bv !== null) return bv as ClientHealthMonitorSnapshot[K];
    return av;
  };
  return {
    companyId: pick("companyId"),
    companyName: pick("companyName"),
    route: pick("route"),
    online: b.online !== undefined ? b.online : a.online,
    outboxPending: b.outboxPending !== undefined && b.outboxPending !== null ? b.outboxPending : a.outboxPending,
    sqliteVoucherRows:
      b.sqliteVoucherRows !== undefined && b.sqliteVoucherRows !== null
        ? b.sqliteVoucherRows
        : a.sqliteVoucherRows,
    sqlitePartyRows:
      b.sqlitePartyRows !== undefined && b.sqlitePartyRows !== null ? b.sqlitePartyRows : a.sqlitePartyRows,
    updatedAt: b.updatedAt ?? a.updatedAt ?? Date.now(),
  };
}

export function updateClientHealthMonitorSnapshot(
  patch: Partial<ClientHealthMonitorSnapshot>
): void {
  const persisted = readPersistedSnapshot();
  snapshot = mergeSnapshots(mergeSnapshots(persisted, snapshot), {
    ...patch,
    updatedAt: Date.now(),
  });
  persistSnapshotToSession(snapshot);
  if (brakeEngaged) refreshClientHealthEmergencyOverlayLog();
  try {
    window.dispatchEvent(new CustomEvent(PL_CLIENT_HEALTH_SNAPSHOT_EVENT));
  } catch {
    /* ignore */
  }
}

export function getClientHealthMonitorSnapshot(): Readonly<ClientHealthMonitorSnapshot> {
  return snapshot;
}

export function formatClientHealthSnapshotBlock(s?: Readonly<ClientHealthMonitorSnapshot>): string {
  const merged = mergeSnapshots(readPersistedSnapshot(), s ?? snapshot);
  const route = merged.route || currentRoute();
  return [
    "--- App snapshot ---",
    `Company: ${merged.companyName?.trim() || "—"} (${merged.companyId?.trim() || "none"})`,
    `Route: ${route}`,
    `Online: ${merged.online === undefined ? "?" : merged.online ? "yes" : "no"}`,
    `Outbox pending: ${merged.outboxPending ?? "?"}`,
    `SQLite voucher rows: ${merged.sqliteVoucherRows ?? "?"}`,
    `SQLite party rows: ${merged.sqlitePartyRows ?? "?"}`,
    `Snapshot at: ${merged.updatedAt ? new Date(merged.updatedAt).toLocaleString() : "—"}`,
    "--------------------",
  ].join("\n");
}

function envMonitorFlag(): boolean {
  try {
    return typeof process !== "undefined" && process.env?.NEXT_PUBLIC_PL_UI_HEALTH_MONITOR === "1";
  } catch {
    return false;
  }
}

/** Baked at build time — true for `next dev`, false for production static/EXE/APK. */
function isDevBuildHealthMonitorDefault(): boolean {
  try {
    return typeof process !== "undefined" && process.env.NODE_ENV === "development";
  } catch {
    return false;
  }
}

export function isClientHealthMonitorEnabled(): boolean {
  if (typeof window === "undefined") {
    return envMonitorFlag() || isDevBuildHealthMonitorDefault();
  }
  try {
    if (window.localStorage.getItem("pl_ui_health_monitor") === "0") return false;
  } catch {
    /* ignore */
  }
  if (envMonitorFlag()) return true;
  try {
    if (window.localStorage.getItem("pl_ui_health_monitor") === "1") return true;
    if (window.sessionStorage.getItem("pl_ui_health_monitor") === "1") return true;
  } catch {
    /* ignore */
  }
  return isDevBuildHealthMonitorDefault();
}

export function isPlUiHealthBrakeEngaged(): boolean {
  return brakeEngaged;
}

export function subscribePlUiHealthBrake(listener: () => void): () => void {
  brakeListeners.add(listener);
  return () => brakeListeners.delete(listener);
}

function notifyBrakeListeners(): void {
  brakeListeners.forEach((l) => {
    try {
      l();
    } catch {
      /* ignore */
    }
  });
  try {
    window.dispatchEvent(new CustomEvent(PL_UI_HEALTH_BRAKE_EVENT));
  } catch {
    /* ignore */
  }
}

export type ClientHealthEmergencyBrakeOptions = {
  /** Measured main-thread block (ms) — opens React health diary after min overlay time when ≥ 5s. */
  detectedStallMs?: number;
};

function scheduleHealthDiaryAfterMinOverlay(reason: string, detectedStallMs?: number): void {
  if (healthDiaryAfterOverlayTimer != null) return;
  healthDiaryAfterOverlayTimer = window.setTimeout(() => {
    healthDiaryAfterOverlayTimer = null;
    const stallLong =
      detectedStallMs != null &&
      detectedStallMs >= PL_UI_HEALTH_EMERGENCY_OVERLAY_MIN_VISIBLE_MS;
    if (!brakeEngaged && !stallLong) return;
    dispatchHealthAlert({
      reason,
      source: "stall",
      forceOpen: true,
    });
  }, PL_UI_HEALTH_EMERGENCY_OVERLAY_MIN_VISIBLE_MS);
}

function clearHealthDiaryAfterMinOverlayTimer(): void {
  if (healthDiaryAfterOverlayTimer == null) return;
  window.clearTimeout(healthDiaryAfterOverlayTimer);
  healthDiaryAfterOverlayTimer = null;
}

/** Unmount heavy React tree + show imperative overlay (stall / long-task recovery). */
export function engageClientHealthEmergencyBrake(
  reason: string,
  opts?: ClientHealthEmergencyBrakeOptions
): void {
  if (!isClientHealthMonitorEnabled()) return;
  if (isBenignResizeObserverMessage(reason)) return;
  const stallMs = opts?.detectedStallMs;
  if (stallMs == null || stallMs < PL_UI_HEALTH_STALL_OVERLAY_MIN_MS) {
    return;
  }
  if (brakeEngaged) {
    refreshClientHealthEmergencyOverlayLog();
    return;
  }
  brakeEngaged = true;
  persistRing();
  showClientHealthEmergencyOverlay(
    reason,
    () => {
      if (!canDismissClientHealthEmergencyOverlay()) return;
      releaseClientHealthEmergencyBrake();
    },
    { minVisibleMs: PL_UI_HEALTH_EMERGENCY_OVERLAY_MIN_VISIBLE_MS }
  );
  refreshClientHealthEmergencyOverlayLog();
  notifyBrakeListeners();
  scheduleHealthDiaryAfterMinOverlay(reason, opts?.detectedStallMs);
}

export function releaseClientHealthEmergencyBrake(): void {
  if (!brakeEngaged) return;
  brakeEngaged = false;
  clearHealthDiaryAfterMinOverlayTimer();
  hideClientHealthEmergencyOverlay();
  notifyBrakeListeners();
}

function currentRoute(): string {
  try {
    return `${window.location.pathname}${window.location.search || ""}`;
  } catch {
    return "";
  }
}

function persistRing(): void {
  if (typeof window === "undefined") return;
  try {
    const payload = JSON.stringify(ring.slice(-RING_MAX));
    window.sessionStorage.setItem(SESSION_KEY, payload);
  } catch {
    /* quota / private mode */
  }
}

function hydrateRingFromSession(): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as ClientHealthEntry[];
    if (!Array.isArray(parsed)) return;
    const cleaned = parsed.filter((e) => {
      if (e.kind !== "stall") return true;
      if (e.detail === "early boot heartbeat") return false;
      const s = String(e.summary || "");
      return !/blocked ~59\d{3} ms/i.test(s);
    });
    ring.splice(0, ring.length, ...cleaned.slice(-RING_MAX));
    persistRing();
  } catch {
    /* ignore */
  }
}

function dispatchRing(): void {
  try {
    window.dispatchEvent(new CustomEvent(PL_CLIENT_HEALTH_LOG_EVENT));
  } catch {
    /* ignore */
  }
}

function dispatchHealthAlert(detail: ClientHealthAlertDetail): void {
  const now = Date.now();
  if (detail.source === "stall" || detail.source === "recovery") {
    if (now - lastStallAlertAt < STALL_ALERT_COOLDOWN_MS && !detail.forceOpen) return;
    lastStallAlertAt = now;
  } else {
    if (now - lastAlertAt < ALERT_COOLDOWN_MS) return;
    lastAlertAt = now;
  }
  try {
    window.dispatchEvent(new CustomEvent(PL_CLIENT_HEALTH_ALERT_EVENT, { detail }));
  } catch {
    /* ignore */
  }
}

function markPendingStall(driftMs: number): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      PENDING_STALL_KEY,
      JSON.stringify({ at: Date.now(), driftMs: Math.round(driftMs) })
    );
  } catch {
    /* ignore */
  }
}

function clearPendingStall(): void {
  try {
    window.sessionStorage.removeItem(PENDING_STALL_KEY);
  } catch {
    /* ignore */
  }
}

/** After browser "Wait" / thread unblocks — open diary if we recorded a pending stall. */
export function consumePendingStallRecoveryAlert(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.sessionStorage.getItem(PENDING_STALL_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { at?: number; driftMs?: number };
    const at = Number(parsed?.at ?? 0);
    if (!at || Date.now() - at > STALL_RECOVERY_MAX_AGE_MS) {
      clearPendingStall();
      return false;
    }
    clearPendingStall();
    pushClientHealthEntry({
      kind: "info",
      summary: "Recovered after main-thread stall (browser may have shown Page Unresponsive)",
      detail:
        parsed.driftMs != null ? `Blocked for ~${parsed.driftMs} ms before recovery.` : undefined,
    });
    engageClientHealthEmergencyBrake("App recovered after a freeze — review clicks/errors below.", {
      detectedStallMs: parsed.driftMs,
    });
    dispatchHealthAlert({
      reason: "App recovered after a freeze — review clicks/errors below.",
      source: "recovery",
      forceOpen: false,
    });
    return true;
  } catch {
    clearPendingStall();
    return false;
  }
}

export function getLatestStallEntryMaxAgeMs(maxAgeMs: number): ClientHealthEntry | null {
  const cutoff = Date.now() - maxAgeMs;
  for (let i = ring.length - 1; i >= 0; i--) {
    const e = ring[i];
    if (e.kind === "stall" && e.at >= cutoff) return e;
  }
  return null;
}

export function pushClientHealthEntry(
  entry: Omit<ClientHealthEntry, "id" | "at"> & { at?: number }
): void {
  if (isBenignResizeObserverMessage(entry.summary)) {
    entry = {
      ...entry,
      kind: "info",
      summary: "ResizeObserver layout loop (browser notice — safe to ignore)",
    };
  }
  const at = entry.at ?? Date.now();
  if (
    entry.kind === "info" &&
    String(entry.summary || "").includes("Chunk load") &&
    at - lastChunkInfoLoggedAt < 20_000
  ) {
    return;
  }
  if (entry.kind === "info" && String(entry.summary || "").includes("Chunk load")) {
    lastChunkInfoLoggedAt = at;
  }
  if (entry.kind === "stall") {
    for (let i = ring.length - 1; i >= 0; i--) {
      const prev = ring[i];
      if (at - prev.at > 5000) break;
      if (prev.kind === "stall") return;
    }
  }
  const row: ClientHealthEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at,
    kind: entry.kind,
    summary: entry.summary,
    detail: entry.detail,
    route: entry.route ?? currentRoute(),
  };
  ring.push(row);
  if (ring.length > RING_MAX) ring.splice(0, ring.length - RING_MAX);
  persistRing();
  dispatchRing();
  if (entry.kind === "error" || entry.kind === "rejection") {
    if (!isBenignChunkLoadMessage(entry.summary) && !isBenignResizeObserverMessage(entry.summary)) {
      dispatchHealthAlert({ reason: entry.summary, source: "error", forceOpen: false });
    }
  }
  if (entry.kind === "stall") {
    const blockedMs = parseStallDurationMs(entry.summary);
    if (blockedMs != null && blockedMs >= STALL_OVERLAY_MIN_MS) {
      engageClientHealthEmergencyBrake(entry.summary, { detectedStallMs: blockedMs });
      dispatchHealthAlert({
        reason: entry.summary,
        source: "stall",
        forceOpen: false,
      });
      clearPendingStall();
    }
  }
}

export function getClientHealthRing(): readonly ClientHealthEntry[] {
  return ring;
}

/** Turbopack/HMR or stale deploy — overlay/brake makes reload loops worse. */
function isBenignChunkLoadMessage(msg: string): boolean {
  const s = String(msg || "");
  return (
    /ChunkLoadError/i.test(s) ||
    /Failed to load chunk/i.test(s) ||
    /Loading chunk [\d]+ failed/i.test(s) ||
    /hmr-client/i.test(s)
  );
}

/** Browser noise when RO callback mutates layout — not an app bug; no emergency overlay. */
export function isBenignResizeObserverMessage(msg: string): boolean {
  return /resizeobserver/i.test(String(msg || ""));
}

function describeClickTarget(target: EventTarget | null): string {
  if (!(target instanceof Element)) return String(target ?? "unknown");
  const el =
    target.closest(
      "button,a,[role='button'],input,select,textarea,label,[data-pl-voucher-edit-convert-banner]"
    ) ?? target;
  const tag = el.tagName.toLowerCase();
  const idPart = el.id ? `#${el.id}` : "";
  const role = el.getAttribute("role");
  const rolePart = role ? `[role=${role}]` : "";
  const testId = el.getAttribute("data-testid");
  const testPart = testId ? `[data-testid=${testId}]` : "";
  const text = (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 48);
  const href =
    el instanceof HTMLAnchorElement && el.href
      ? ` → ${el.getAttribute("href") || el.pathname || el.href}`
      : "";
  return `${tag}${idPart}${rolePart}${testPart}${text ? ` "${text}"` : ""}${href}`;
}

function onDocumentClick(ev: MouseEvent): void {
  if (!isClientHealthMonitorEnabled()) return;
  pushClientHealthEntry({
    kind: "click",
    summary: describeClickTarget(ev.target),
  });
}

function onWindowError(ev: ErrorEvent): void {
  if (!isClientHealthMonitorEnabled()) return;
  const msg = String(ev.message || "Script error");
  const loc = ev.filename ? `${ev.filename}:${ev.lineno ?? 0}` : "";
  if (isBenignChunkLoadMessage(msg)) {
    pushClientHealthEntry({
      kind: "info",
      summary: "Chunk load failed (dev/HMR or stale tab — hard refresh Ctrl+Shift+R)",
      detail: msg.slice(0, 400),
    });
    return;
  }
  if (isBenignResizeObserverMessage(msg)) {
    pushClientHealthEntry({
      kind: "info",
      summary: "ResizeObserver layout loop (browser notice — safe to ignore)",
      detail: msg.slice(0, 400),
    });
    return;
  }
  pushClientHealthEntry({
    kind: "error",
    summary: msg.slice(0, 200),
    detail: [loc, ev.error?.stack ? String(ev.error.stack).slice(0, 1200) : ""].filter(Boolean).join("\n"),
  });
}

function onUnhandledRejection(ev: PromiseRejectionEvent): void {
  if (!isClientHealthMonitorEnabled()) return;
  const r = ev.reason;
  const msg =
    r instanceof Error
      ? r.message
      : typeof r === "string"
        ? r
        : r && typeof r === "object" && "message" in r
          ? String((r as { message: unknown }).message)
          : "Unhandled promise rejection";
  const summary = String(msg).slice(0, 200);
  if (isBenignChunkLoadMessage(summary)) {
    pushClientHealthEntry({
      kind: "info",
      summary: "Chunk load failed (dev/HMR or stale tab — hard refresh Ctrl+Shift+R)",
      detail: summary,
    });
    return;
  }
  if (isBenignResizeObserverMessage(summary)) {
    pushClientHealthEntry({
      kind: "info",
      summary: "ResizeObserver layout loop (browser notice — safe to ignore)",
      detail: summary,
    });
    return;
  }
  pushClientHealthEntry({
    kind: "rejection",
    summary,
    detail: r instanceof Error && r.stack ? String(r.stack).slice(0, 1200) : undefined,
  });
}

function heartbeatTick(): void {
  const now = performance.now();
  if (typeof document !== "undefined" && document.hidden) {
    heartbeatExpected = now + HEARTBEAT_MS;
    heartbeatTimer = window.setTimeout(heartbeatTick, HEARTBEAT_MS);
    return;
  }
  if (heartbeatExpected > 0) {
    const drift = now - heartbeatExpected;
    if (drift >= STALL_MS) {
        if (drift <= HEARTBEAT_TIMER_DRIFT_MAX_MS) {
          if (drift >= STALL_OVERLAY_MIN_MS) markPendingStall(drift);
          pushClientHealthEntry({
            kind: "stall",
            summary: `Main thread blocked ~${Math.round(drift)} ms (browser may show "Page Unresponsive")`,
            detail: "Last clicks/errors above may relate to this stall.",
          });
        }
    }
  }
  heartbeatExpected = now + HEARTBEAT_MS;
  heartbeatTimer = window.setTimeout(heartbeatTick, HEARTBEAT_MS);
}

function startLongTaskObserver(): void {
  if (typeof PerformanceObserver === "undefined") return;
  try {
    const obs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const dur = entry.duration;
        if (dur < LONG_TASK_LOG_MS) continue;
        // Diary only — `kind: stall` yahan overlay/brake chala deta tha (dashboard 20s+ chunk parse).
        pushClientHealthEntry({
          kind: "info",
          summary: `Long task ~${Math.round(dur)} ms`,
          detail: entry.name || "longtask",
        });
      }
    });
    // buffered:false — otherwise Resume/remount replays old 8–14s tasks as if new.
    obs.observe({ type: "longtask", buffered: false } as PerformanceObserverInit);
  } catch {
    /* Safari / older WebView */
  }
}

/** Idempotent — safe to call from React mount. */
export function startClientHealthMonitor(): () => void {
  if (typeof window === "undefined") return () => {};
  if (!isClientHealthMonitorEnabled()) return () => {};
  if (started) return () => {};
  started = true;

  hydrateRingFromSession();
  snapshot = mergeSnapshots(readPersistedSnapshot(), snapshot);
  consumePendingStallRecoveryAlert();

  const earlyBoot = Boolean(
    (window as unknown as { __PL_UI_HEALTH_EARLY__?: number }).__PL_UI_HEALTH_EARLY__
  );
  if (earlyBoot) {
    try {
      (window as unknown as { __PL_UI_HEALTH_EARLY_TICK_STOP__?: () => void }).__PL_UI_HEALTH_EARLY_TICK_STOP__?.();
    } catch {
      /* ignore */
    }
  }

  let logStarted = false;
  try {
    logStarted = window.sessionStorage.getItem("pl_ui_health_started_v1") === "1";
    if (!logStarted) window.sessionStorage.setItem("pl_ui_health_started_v1", "1");
  } catch {
    /* ignore */
  }
  if (!logStarted) {
    pushClientHealthEntry({
      kind: "info",
      summary: earlyBoot ? "UI health monitor linked (early boot active)" : "UI health monitor started",
    });
  }

  const onVisible = () => {
    if (typeof document === "undefined" || document.visibilityState !== "visible") return;
    consumePendingStallRecoveryAlert();
    const recent = getLatestStallEntryMaxAgeMs(120_000);
    if (!recent) return;
    try {
      const shownFor = window.sessionStorage.getItem("pl_ui_health_stall_popup_for");
      if (shownFor === recent.id) return;
      window.sessionStorage.setItem("pl_ui_health_stall_popup_for", recent.id);
    } catch {
      /* ignore */
    }
    const blockedMs = parseStallDurationMs(recent.summary);
    if (blockedMs != null && blockedMs >= PL_UI_HEALTH_STALL_OVERLAY_MIN_MS) {
      engageClientHealthEmergencyBrake("Recent freeze detected — diary opened with context.", {
        detectedStallMs: blockedMs,
      });
    }
    dispatchHealthAlert({
      reason: "Recent freeze detected — diary opened with context.",
      source: "recovery",
      forceOpen: false,
    });
  };
  document.addEventListener("visibilitychange", onVisible);

  const onBenignResizeObserverErrorCapture = (ev: Event) => {
    const msg = String((ev as ErrorEvent).message || "");
    if (!isBenignResizeObserverMessage(msg)) return;
    ev.stopImmediatePropagation();
    pushClientHealthEntry({
      kind: "info",
      summary: "ResizeObserver layout loop (browser notice — safe to ignore)",
      detail: msg.slice(0, 400),
    });
  };
  window.addEventListener("error", onBenignResizeObserverErrorCapture, true);

  if (!earlyBoot) {
    document.addEventListener("click", onDocumentClick, true);
    window.addEventListener("error", onWindowError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
  }

  heartbeatExpected = performance.now() + HEARTBEAT_MS;
  heartbeatTimer = window.setTimeout(heartbeatTick, HEARTBEAT_MS);

  startLongTaskObserver();

  return () => {
    window.removeEventListener("error", onBenignResizeObserverErrorCapture, true);
    if (!earlyBoot) {
      document.removeEventListener("click", onDocumentClick, true);
      window.removeEventListener("error", onWindowError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    }
    if (heartbeatTimer != null) window.clearTimeout(heartbeatTimer);
    heartbeatTimer = null;
    document.removeEventListener("visibilitychange", onVisible);
    started = false;
  };
}

export function formatClientHealthEntryLine(e: ClientHealthEntry): string {
  const t = new Date(e.at).toLocaleTimeString();
  const route = e.route ? ` @ ${e.route}` : "";
  return `[${t}] ${e.kind.toUpperCase()}${route} — ${e.summary}`;
}

export function getClientHealthExportText(): string {
  const header = formatClientHealthSnapshotBlock();
  const body = getClientHealthRing()
    .map((e) => {
      const head = formatClientHealthEntryLine(e);
      return e.detail ? `${head}\n${e.detail}\n` : head;
    })
    .join("\n");
  return `${header}\n\n${body}`;
}
