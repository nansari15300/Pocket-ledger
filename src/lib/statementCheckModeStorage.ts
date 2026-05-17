/** Check mode — reconciliation shortcuts; per-user localStorage. */

export const STATEMENT_CHECK_MODE_ENABLED_KEY = "statementCheckModeEnabled";

export type StatementCheckLedgerScope = {
  userId: string;
  companyId: string;
  context: string;
  contextId: string;
};

function scopeKey(scope: StatementCheckLedgerScope, suffix: string): string {
  return `statementCheckMode:${suffix}:${scope.userId}:${scope.companyId}:${scope.context}:${scope.contextId}`;
}

export function loadStatementCheckModeEnabled(userId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(`${STATEMENT_CHECK_MODE_ENABLED_KEY}:${userId}`) === "true";
  } catch {
    return false;
  }
}

export function saveStatementCheckModeEnabled(userId: string, enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`${STATEMENT_CHECK_MODE_ENABLED_KEY}:${userId}`, enabled ? "true" : "false");
  } catch {
    /* ignore */
  }
}

export function loadStatementCheckModeHiddenIds(scope: StatementCheckLedgerScope): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(scopeKey(scope, "hidden"));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function saveStatementCheckModeHiddenIds(scope: StatementCheckLedgerScope, ids: string[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(scopeKey(scope, "hidden"), JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

export function loadStatementCheckModeMarkedIds(scope: StatementCheckLedgerScope): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(scopeKey(scope, "marked"));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function saveStatementCheckModeMarkedIds(scope: StatementCheckLedgerScope, ids: string[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(scopeKey(scope, "marked"), JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

export function loadStatementCheckModeFocusId(scope: StatementCheckLedgerScope): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(scopeKey(scope, "focus")) || null;
  } catch {
    return null;
  }
}

export function saveStatementCheckModeFocusId(scope: StatementCheckLedgerScope, focusId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    const key = scopeKey(scope, "focus");
    if (focusId) localStorage.setItem(key, focusId);
    else localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function clearStatementCheckModeLedgerState(scope: StatementCheckLedgerScope): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(scopeKey(scope, "hidden"));
    localStorage.removeItem(scopeKey(scope, "marked"));
    localStorage.removeItem(scopeKey(scope, "focus"));
  } catch {
    /* ignore */
  }
}

/** Row id — fiscal partition / synthetic rows bhi stable key. */
export function statementCheckTxnId(t: { id?: string; _rowKey?: string }): string {
  const k = (t as { _rowKey?: string })._rowKey ?? t.id;
  return k != null ? String(k) : "";
}
