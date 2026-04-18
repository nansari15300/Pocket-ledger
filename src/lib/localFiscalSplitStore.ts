/**
 * Fiscal split (merge / separate / off) — sirf device par localStorage.
 * Firestore company doc me ye fields nahi bhejte; `useCompany` inhe merge karke UI ko deta hai.
 */

export const LOCAL_FISCAL_SPLIT_CHANGED_EVENT = "pl_local_fiscal_split_changed";

const STORAGE_PREFIX = "pl_fiscal_split_v1_";

export type FiscalSplitMode = "off" | "merge" | "separate";

export type LocalFiscalSplitPayload = {
  fiscalSplitMode: FiscalSplitMode;
  /** Merge mode: partition din AD start-of-day (ISO string). */
  fiscalMergePartitionAtIso: string | null;
  fiscalPartitionLabel: string | null;
};

function storageKey(companyId: string): string {
  return `${STORAGE_PREFIX}${companyId}`;
}

function defaultPayload(): LocalFiscalSplitPayload {
  return {
    fiscalSplitMode: "off",
    fiscalMergePartitionAtIso: null,
    fiscalPartitionLabel: null,
  };
}

function normalizePayload(raw: unknown): LocalFiscalSplitPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const m = o.fiscalSplitMode;
  const mode: FiscalSplitMode =
    m === "merge" || m === "separate" ? m : "off";
  const iso =
    typeof o.fiscalMergePartitionAtIso === "string" && o.fiscalMergePartitionAtIso
      ? o.fiscalMergePartitionAtIso
      : null;
  const label = typeof o.fiscalPartitionLabel === "string" ? o.fiscalPartitionLabel : null;
  return {
    fiscalSplitMode: mode,
    fiscalMergePartitionAtIso: iso,
    fiscalPartitionLabel: label,
  };
}

/** Current tab + cross-tab: save ke baad `useCompany` epoch bump karega. */
export function readLocalFiscalSplit(companyId: string | null | undefined): LocalFiscalSplitPayload | null {
  if (!companyId || typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey(companyId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return normalizePayload(parsed);
  } catch {
    return null;
  }
}

/** Poora replace — Settings save; invalid companyId par no-op. */
export function writeLocalFiscalSplit(companyId: string | null | undefined, next: LocalFiscalSplitPayload): void {
  if (!companyId || typeof window === "undefined") return;
  try {
    const normalized: LocalFiscalSplitPayload = {
      fiscalSplitMode: next.fiscalSplitMode,
      fiscalMergePartitionAtIso:
        next.fiscalSplitMode === "merge" && next.fiscalMergePartitionAtIso
          ? next.fiscalMergePartitionAtIso
          : null,
      fiscalPartitionLabel:
        next.fiscalSplitMode === "merge" && next.fiscalPartitionLabel?.trim()
          ? next.fiscalPartitionLabel.trim()
          : null,
    };
    localStorage.setItem(storageKey(companyId), JSON.stringify(normalized));
    window.dispatchEvent(
      new CustomEvent(LOCAL_FISCAL_SPLIT_CHANGED_EVENT, { detail: { companyId } })
    );
  } catch {
    /* ignore quota / private mode */
  }
}

/** Provider seed: kuch na ho to defaults (Firestore jaisa “off”). */
export function getLocalFiscalSplitOrDefaults(companyId: string | null | undefined): LocalFiscalSplitPayload {
  return readLocalFiscalSplit(companyId) ?? defaultPayload();
}
