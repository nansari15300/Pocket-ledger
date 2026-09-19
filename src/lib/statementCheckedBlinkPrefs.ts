export const STATEMENT_CHECKED_BLINK_PREFS_KEY = "pocket-ledger:statement-checked-blink:v1";
export const STATEMENT_CHECKED_BLINK_CHANGED_EVENT = "pl-statement-checked-blink-changed";

export const STATEMENT_CHECKED_BLINK_CYCLE_MIN_SEC = 1;
export const STATEMENT_CHECKED_BLINK_CYCLE_MAX_SEC = 10;
export const STATEMENT_CHECKED_BLINK_CYCLE_DEFAULT_SEC = 1;

const STATEMENT_CHECKED_BLINK_KEYFRAMES_STYLE_ID = "pl-statement-checked-blink-keyframes";

function formatBlinkKeyframePct(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return `${rounded}%`;
}

/** 3 blinks always in the first 1s of the cycle (burst window scales with repeat slider). */
export function buildStatementCheckedBlinkKeyframesCss(cycleSeconds: number): string {
  const burstEndPct = cycleSeconds <= 1 ? 100 : 100 / cycleSeconds;
  const dip1 = burstEndPct * 0.1667;
  const recover1 = burstEndPct * 0.3333;
  const dip2 = burstEndPct * 0.5;
  const recover2 = burstEndPct * 0.6667;
  const dip3 = burstEndPct * 0.8333;
  const recover3 = burstEndPct;

  return `@keyframes pl-statement-checked-blink-active {
  0%,
  ${formatBlinkKeyframePct(recover1)},
  ${formatBlinkKeyframePct(recover2)},
  ${formatBlinkKeyframePct(recover3)},
  100% {
    opacity: 1;
  }
  ${formatBlinkKeyframePct(dip1)},
  ${formatBlinkKeyframePct(dip2)},
  ${formatBlinkKeyframePct(dip3)} {
    opacity: 0.18;
  }
}`;
}

function syncStatementCheckedBlinkKeyframesStyle(cycleSeconds: number): void {
  if (typeof document === "undefined") return;
  let el = document.getElementById(
    STATEMENT_CHECKED_BLINK_KEYFRAMES_STYLE_ID
  ) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = STATEMENT_CHECKED_BLINK_KEYFRAMES_STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = buildStatementCheckedBlinkKeyframesCss(cycleSeconds);
}

export type StatementCheckedBlinkPrefs = {
  enabled: boolean;
  cycleSeconds: number;
};

const DEFAULT_PREFS: StatementCheckedBlinkPrefs = {
  enabled: true,
  cycleSeconds: STATEMENT_CHECKED_BLINK_CYCLE_DEFAULT_SEC,
};

export function clampStatementCheckedBlinkCycleSeconds(raw: number): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return STATEMENT_CHECKED_BLINK_CYCLE_DEFAULT_SEC;
  return Math.min(STATEMENT_CHECKED_BLINK_CYCLE_MAX_SEC, Math.max(STATEMENT_CHECKED_BLINK_CYCLE_MIN_SEC, n));
}

export function readStatementCheckedBlinkPrefs(): StatementCheckedBlinkPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(STATEMENT_CHECKED_BLINK_PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<StatementCheckedBlinkPrefs>;
    return {
      enabled: parsed.enabled !== false,
      cycleSeconds: clampStatementCheckedBlinkCycleSeconds(
        parsed.cycleSeconds ?? STATEMENT_CHECKED_BLINK_CYCLE_DEFAULT_SEC
      ),
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function applyStatementCheckedBlinkPrefsToDocument(prefs: StatementCheckedBlinkPrefs): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.plStatementCheckedBlink = prefs.enabled ? "on" : "off";
  const cycleSeconds = clampStatementCheckedBlinkCycleSeconds(prefs.cycleSeconds);
  root.style.setProperty("--pl-statement-checked-blink-cycle", `${cycleSeconds}s`);
  syncStatementCheckedBlinkKeyframesStyle(cycleSeconds);
}

export function writeStatementCheckedBlinkPrefs(prefs: StatementCheckedBlinkPrefs): void {
  if (typeof window === "undefined") return;
  const next: StatementCheckedBlinkPrefs = {
    enabled: prefs.enabled,
    cycleSeconds: clampStatementCheckedBlinkCycleSeconds(prefs.cycleSeconds),
  };
  try {
    window.localStorage.setItem(STATEMENT_CHECKED_BLINK_PREFS_KEY, JSON.stringify(next));
    applyStatementCheckedBlinkPrefsToDocument(next);
    window.dispatchEvent(
      new CustomEvent(STATEMENT_CHECKED_BLINK_CHANGED_EVENT, { detail: next })
    );
  } catch {
    /* quota / private mode */
  }
}

