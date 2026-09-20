/**
 * Fiscal split (merge / off) — device localStorage + company root doc sync.
 * `useCompany` merges local + cloud/SQLite company fields for ledgers.
 */

export const LOCAL_FISCAL_SPLIT_CHANGED_EVENT = "pl_local_fiscal_split_changed";

const STORAGE_PREFIX = "pl_fiscal_split_v1_";

export type FiscalSplitMode = "off" | "merge";

export type LocalFiscalSplitPayload = {
  fiscalSplitMode: FiscalSplitMode;
  /** Merge mode: legacy single partition (first of `fiscalMergePartitionAtIsos`). */
  fiscalMergePartitionAtIso: string | null;
  /** Merge mode: multiple partition starts (AD start-of-day ISO), oldest → newest. */
  fiscalMergePartitionAtIsos: string[] | null;
  /** Merge mode: ticked FY keys — UI round-trip (`2081-2082` Nepal BS style). */
  fiscalMergeTickedFyKeys: string[] | null;
  fiscalPartitionLabel: string | null;
  /** Splite Fiscal Year → auto splite (default on; UI always shows ticked). */
  fiscalAutoSplitEnabled: boolean;
  /** User saved Fiscal year & split settings manually — auto splite must not override. */
  fiscalSplitConfiguredByUser: boolean;
  /** Local calendar day (YYYY-MM-DD) when daily auto splite check last ran for this company. */
  fiscalAutoSplitLastCheckDay: string | null;
};

function storageKey(companyId: string): string {
  return `${STORAGE_PREFIX}${companyId}`;
}

function defaultPayload(): LocalFiscalSplitPayload {
  return {
    fiscalSplitMode: "off",
    fiscalMergePartitionAtIso: null,
    fiscalMergePartitionAtIsos: null,
    fiscalMergeTickedFyKeys: null,
    fiscalPartitionLabel: null,
    fiscalAutoSplitEnabled: true,
    fiscalSplitConfiguredByUser: false,
    fiscalAutoSplitLastCheckDay: null,
  };
}

function normalizePartitionIsoList(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out = raw
    .filter((v): v is string => typeof v === "string" && Boolean(v.trim()))
    .map((v) => v.trim());
  return out.length ? out : null;
}

function normalizeFyKeyList(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out = raw
    .filter((v): v is string => typeof v === "string" && Boolean(v.trim()))
    .map((v) => v.trim());
  return out.length ? out : null;
}

function normalizePayload(raw: unknown): LocalFiscalSplitPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const m = o.fiscalSplitMode;
  const mode: FiscalSplitMode = m === "merge" ? "merge" : "off";
  const iso =
    typeof o.fiscalMergePartitionAtIso === "string" && o.fiscalMergePartitionAtIso
      ? o.fiscalMergePartitionAtIso
      : null;
  const isos = normalizePartitionIsoList(o.fiscalMergePartitionAtIsos) ?? (iso ? [iso] : null);
  const tickedFyKeys = normalizeFyKeyList(o.fiscalMergeTickedFyKeys);
  const label = typeof o.fiscalPartitionLabel === "string" ? o.fiscalPartitionLabel : null;
  const autoSplitEnabled = o.fiscalAutoSplitEnabled === false ? false : true;
  const configuredByUser = o.fiscalSplitConfiguredByUser === true;
  const lastCheckDay =
    typeof o.fiscalAutoSplitLastCheckDay === "string" && o.fiscalAutoSplitLastCheckDay.trim()
      ? o.fiscalAutoSplitLastCheckDay.trim()
      : null;
  return {
    fiscalSplitMode: mode,
    fiscalMergePartitionAtIso: isos?.[0] ?? iso,
    fiscalMergePartitionAtIsos: isos,
    fiscalMergeTickedFyKeys: tickedFyKeys,
    fiscalPartitionLabel: label,
    fiscalAutoSplitEnabled: autoSplitEnabled,
    fiscalSplitConfiguredByUser: configuredByUser,
    fiscalAutoSplitLastCheckDay: lastCheckDay,
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
    const mergeIsos =
      next.fiscalSplitMode === "merge"
        ? normalizePartitionIsoList(next.fiscalMergePartitionAtIsos) ??
          (next.fiscalMergePartitionAtIso ? [next.fiscalMergePartitionAtIso] : null)
        : null;
    const normalized: LocalFiscalSplitPayload = {
      fiscalSplitMode: next.fiscalSplitMode,
      fiscalMergePartitionAtIso: mergeIsos?.[0] ?? null,
      fiscalMergePartitionAtIsos: mergeIsos,
      fiscalMergeTickedFyKeys:
        next.fiscalSplitMode === "merge"
          ? normalizeFyKeyList(next.fiscalMergeTickedFyKeys)
          : null,
      fiscalPartitionLabel:
        next.fiscalSplitMode === "merge" && next.fiscalPartitionLabel?.trim()
          ? next.fiscalPartitionLabel.trim()
          : null,
      fiscalAutoSplitEnabled: next.fiscalAutoSplitEnabled !== false,
      fiscalSplitConfiguredByUser: next.fiscalSplitConfiguredByUser === true,
      fiscalAutoSplitLastCheckDay:
        typeof next.fiscalAutoSplitLastCheckDay === "string" && next.fiscalAutoSplitLastCheckDay.trim()
          ? next.fiscalAutoSplitLastCheckDay.trim()
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
