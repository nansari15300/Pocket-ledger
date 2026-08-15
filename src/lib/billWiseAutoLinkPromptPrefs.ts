/**
 * Local-only preferences for the bill-wise “paid but not linked” auto-link prompt.
 * Scoped by company + user; optional per-ledger never list.
 */
export type BillWiseAutoLinkSnoozeChoice =
  | "later"
  | "next_visit"
  | "next_day"
  | "next_week"
  | "never_ledger"
  | "never_company";

export type BillWiseAutoLinkPromptPrefs = {
  version: 1;
  neverCompany?: boolean;
  neverLedgerIds?: string[];
  /** Epoch ms — hide until this time (next day / next week). */
  snoozeUntilMs?: number;
  /** Last fingerprint we prompted for (so same set is not re-spammed after Later). */
  lastFingerprint?: string;
};

const STORAGE_VER = "v1";
const SESSION_SKIP_PREFIX = "pl_bw_autolink_session_skip_";

function storageKey(companyId: string, userId: string): string {
  return `pl_bw_autolink_${STORAGE_VER}_${encodeURIComponent(companyId)}_${encodeURIComponent(userId)}`;
}

function sessionSkipKey(companyId: string, userId: string, ledgerId: string): string {
  return `${SESSION_SKIP_PREFIX}${companyId}_${userId}_${ledgerId}`;
}

export function loadBillWiseAutoLinkPromptPrefs(
  companyId: string,
  userId: string
): BillWiseAutoLinkPromptPrefs {
  if (typeof window === "undefined") return { version: 1 };
  try {
    const raw = localStorage.getItem(storageKey(companyId, userId));
    if (!raw) return { version: 1 };
    const parsed = JSON.parse(raw) as BillWiseAutoLinkPromptPrefs;
    if (!parsed || parsed.version !== 1) return { version: 1 };
    return {
      version: 1,
      neverCompany: !!parsed.neverCompany,
      neverLedgerIds: Array.isArray(parsed.neverLedgerIds)
        ? parsed.neverLedgerIds.filter((x) => typeof x === "string")
        : [],
      snoozeUntilMs: typeof parsed.snoozeUntilMs === "number" ? parsed.snoozeUntilMs : undefined,
      lastFingerprint: typeof parsed.lastFingerprint === "string" ? parsed.lastFingerprint : undefined,
    };
  } catch {
    return { version: 1 };
  }
}

export function saveBillWiseAutoLinkPromptPrefs(
  companyId: string,
  userId: string,
  prefs: BillWiseAutoLinkPromptPrefs
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      storageKey(companyId, userId),
      JSON.stringify({ ...prefs, version: 1 } satisfies BillWiseAutoLinkPromptPrefs)
    );
  } catch {
    /* private mode */
  }
}

export function isBillWiseAutoLinkPromptSuppressed(opts: {
  companyId: string;
  userId: string;
  ledgerId: string;
  fingerprint: string;
}): boolean {
  const { companyId, userId, ledgerId, fingerprint } = opts;
  if (typeof window === "undefined") return true;
  try {
    if (sessionStorage.getItem(sessionSkipKey(companyId, userId, ledgerId)) === "1") return true;
  } catch {
    /* ignore */
  }
  const prefs = loadBillWiseAutoLinkPromptPrefs(companyId, userId);
  if (prefs.neverCompany) return true;
  if ((prefs.neverLedgerIds || []).includes(ledgerId)) return true;
  if (prefs.snoozeUntilMs && Date.now() < prefs.snoozeUntilMs) return true;
  // Same unmatched set after "Later" — don't re-open until data changes.
  if (prefs.lastFingerprint && prefs.lastFingerprint === fingerprint) return true;
  return false;
}

export function applyBillWiseAutoLinkPromptChoice(opts: {
  companyId: string;
  userId: string;
  ledgerId: string;
  fingerprint: string;
  choice: BillWiseAutoLinkSnoozeChoice;
}): void {
  const { companyId, userId, ledgerId, fingerprint, choice } = opts;
  if (typeof window === "undefined") return;

  if (choice === "later") {
    const prefs = loadBillWiseAutoLinkPromptPrefs(companyId, userId);
    saveBillWiseAutoLinkPromptPrefs(companyId, userId, {
      ...prefs,
      lastFingerprint: fingerprint,
    });
    return;
  }

  if (choice === "next_visit") {
    try {
      sessionStorage.setItem(sessionSkipKey(companyId, userId, ledgerId), "1");
    } catch {
      /* ignore */
    }
    return;
  }

  const prefs = loadBillWiseAutoLinkPromptPrefs(companyId, userId);
  const next: BillWiseAutoLinkPromptPrefs = { ...prefs, lastFingerprint: fingerprint };

  if (choice === "next_day") {
    next.snoozeUntilMs = Date.now() + 24 * 60 * 60 * 1000;
  } else if (choice === "next_week") {
    next.snoozeUntilMs = Date.now() + 7 * 24 * 60 * 60 * 1000;
  } else if (choice === "never_ledger") {
    const set = new Set(prefs.neverLedgerIds || []);
    set.add(ledgerId);
    next.neverLedgerIds = Array.from(set);
  } else if (choice === "never_company") {
    next.neverCompany = true;
  }

  saveBillWiseAutoLinkPromptPrefs(companyId, userId, next);
}
