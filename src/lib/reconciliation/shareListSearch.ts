import type { ReconciliationEntityType, ReconciliationShare } from "@/lib/reconciliation/types";
import { reconciliationEntityLabel } from "@/lib/reconciliation/sideMeta";

/** Shared / Unlinked list search — ek side ka searchable row. */
export type ReconShareSearchEntry = {
  key: string;
  shareId: string;
  side: "owned" | "other";
  companyId: string;
  companyName: string;
  entityType: ReconciliationEntityType | "";
  entityName: string;
  accountId: string;
  accountName: string;
  /** Company / entity / account id / name — Combobox type-to-search ke liye. */
  searchBlob: string;
};

/** Shared list filter card — All / Linked / Unlinked radio. */
export type ReconShareLinkStatusFilter = "all" | "linked" | "unlinked";

export type ReconShareListFilters = {
  companyKey: string;
  entityKey: string;
  accountKey: string;
  linkStatus: ReconShareLinkStatusFilter;
};

export const EMPTY_RECON_SHARE_LIST_FILTERS: ReconShareListFilters = {
  companyKey: "",
  entityKey: "",
  accountKey: "",
  linkStatus: "all",
};

function norm(v: unknown): string {
  return String(v ?? "").trim();
}

function blob(...parts: unknown[]): string {
  return parts.map(norm).filter(Boolean).join(" ").toLowerCase();
}

function companyKey(companyId: string, companyName: string): string {
  const id = norm(companyId);
  const name = norm(companyName);
  return id ? `${id}::${name}` : name;
}

function parseCompanyKey(key: string): { companyId: string; companyName: string } {
  const raw = norm(key);
  if (!raw) return { companyId: "", companyName: "" };
  const idx = raw.indexOf("::");
  if (idx === -1) return { companyId: "", companyName: raw };
  return { companyId: raw.slice(0, idx), companyName: raw.slice(idx + 2) };
}

function entityKey(entityType: ReconciliationEntityType | "", entityName: string): string {
  return entityType ? entityType : norm(entityName);
}

/** Account row valid — placeholder / pending empty skip. */
export function isReconShareSearchAccountValid(accountId: string, accountName: string): boolean {
  const id = norm(accountId);
  const name = norm(accountName);
  if (!id || !name) return false;
  if (name === "—" || name === "Not linked" || name === "Was linked") return false;
  return true;
}

function pushEntry(
  out: ReconShareSearchEntry[],
  share: ReconciliationShare,
  side: "owned" | "other",
  companyId: string,
  companyName: string,
  entityType: ReconciliationEntityType | undefined,
  accountId: string | undefined,
  accountName: string | undefined,
): void {
  const cName = norm(companyName);
  if (!cName || cName === "—") return;
  const cId = norm(companyId);
  const eType = (entityType || "") as ReconciliationEntityType | "";
  const eName = entityType ? reconciliationEntityLabel(entityType) : "—";
  const aId = norm(accountId);
  const aName = norm(accountName) || "—";
  out.push({
    key: `${share.id}:${side}:${cId || cName}:${eType}:${aId || aName}`,
    shareId: share.id,
    side,
    companyId: cId,
    companyName: cName,
    entityType: eType,
    entityName: eName,
    accountId: aId,
    accountName: aName,
    searchBlob: blob(cName, cId, eName, eType, aId, aName),
  });
}

/** Share doc se owned + other dono sides — list search / filter ke liye. */
export function extractReconShareSearchEntries(
  share: ReconciliationShare,
  userId: string | undefined,
): ReconShareSearchEntry[] {
  const entries: ReconShareSearchEntry[] = [];
  const iAmSender = !!userId && share.senderUserId === userId;

  if (iAmSender) {
    pushEntry(
      entries,
      share,
      "owned",
      share.senderCompanyId,
      share.senderCompanyName,
      share.senderEntityType,
      share.senderAccountId,
      share.senderAccountName,
    );
    if (share.receiverCompanyId || share.receiverAccountId) {
      pushEntry(
        entries,
        share,
        "other",
        share.receiverCompanyId || "",
        share.receiverCompanyName || "",
        share.receiverEntityType,
        share.receiverAccountId,
        share.receiverAccountName,
      );
    } else if (share.status === "pending") {
      pushEntry(
        entries,
        share,
        "other",
        "",
        share.targetUserEmail || "Invited user",
        undefined,
        "",
        "",
      );
    }
  } else {
    if (share.receiverCompanyId || share.receiverAccountId) {
      pushEntry(
        entries,
        share,
        "owned",
        share.receiverCompanyId || "",
        share.receiverCompanyName || "",
        share.receiverEntityType,
        share.receiverAccountId,
        share.receiverAccountName,
      );
    } else if (share.status === "pending") {
      pushEntry(entries, share, "owned", "", "Not linked", undefined, "", "");
    } else if (share.status === "revoked") {
      pushEntry(
        entries,
        share,
        "owned",
        share.receiverCompanyId || "",
        share.receiverCompanyName || "Was linked",
        share.receiverEntityType,
        share.receiverAccountId,
        share.receiverAccountName,
      );
    }
    pushEntry(
      entries,
      share,
      "other",
      share.senderCompanyId,
      share.senderCompanyName,
      share.senderEntityType,
      share.senderAccountId,
      share.senderAccountName,
    );
  }

  return entries;
}

/** Tab ki saari shares se search index — company / entity / other-account dropdowns. */
export function buildReconShareSearchIndex(
  shares: ReconciliationShare[],
  userId: string | undefined,
): ReconShareSearchEntry[] {
  return shares.flatMap((s) => extractReconShareSearchEntries(s, userId));
}

function entryCompanyMatches(entry: ReconShareSearchEntry, filterCompanyKey: string): boolean {
  const { companyId, companyName } = parseCompanyKey(filterCompanyKey);
  if (companyId && entry.companyId) return entry.companyId === companyId;
  return norm(entry.companyName).toLowerCase() === norm(companyName).toLowerCase();
}

function entryEntityMatches(entry: ReconShareSearchEntry, filterEntityKey: string): boolean {
  if (entry.entityType && entry.entityType === filterEntityKey) return true;
  return norm(entry.entityName).toLowerCase() === norm(filterEntityKey).toLowerCase();
}

/** Linked = active linked ya pehle link hoke revoke; Unlinked = pending ya kabhi link na hua revoke. */
export function matchesReconShareLinkStatusFilter(
  share: ReconciliationShare,
  linkStatus: ReconShareLinkStatusFilter,
): boolean {
  if (linkStatus === "all") return true;
  const hadReceiverLink = !!norm(share.receiverAccountId);
  if (linkStatus === "linked") {
    return share.status === "linked" || (share.status === "revoked" && hadReceiverLink);
  }
  return share.status === "pending" || (share.status === "revoked" && !hadReceiverLink);
}

/** Active filters se share list narrow — koi filter na ho to sab. */
export function filterReconciliationSharesForSearch(
  shares: ReconciliationShare[],
  filters: ReconShareListFilters,
  userId: string | undefined,
): ReconciliationShare[] {
  let pool = shares;
  const linkStatus = filters.linkStatus ?? "all";
  if (linkStatus !== "all") {
    pool = pool.filter((share) => matchesReconShareLinkStatusFilter(share, linkStatus));
  }
  if (!filters.companyKey && !filters.entityKey && !filters.accountKey) return pool;
  return pool.filter((share) => {
    const entries = extractReconShareSearchEntries(share, userId);
    return entries.some((entry) => {
      if (filters.accountKey) return entry.key === filters.accountKey;
      if (filters.companyKey && !entryCompanyMatches(entry, filters.companyKey)) return false;
      if (filters.entityKey && !entryEntityMatches(entry, filters.entityKey)) return false;
      return true;
    });
  });
}

/** Company dropdown — shared list me jitni companies connected hain. */
export function reconShareCompanyOptions(entries: ReconShareSearchEntry[]): { value: string; label: string; triggerLabel?: string }[] {
  const map = new Map<string, string>();
  for (const e of entries) {
    const key = companyKey(e.companyId, e.companyName);
    if (!map.has(key)) map.set(key, e.companyName);
  }
  return Array.from(map.entries())
    .map(([value, label]) => ({ value, label, triggerLabel: label }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
}

/** Entity dropdown — company select hone par us company ke shared entities. */
export function reconShareEntityOptions(
  entries: ReconShareSearchEntry[],
  filters: ReconShareListFilters,
): { value: string; label: string }[] {
  let pool = entries;
  if (filters.companyKey) {
    pool = pool.filter((e) => entryCompanyMatches(e, filters.companyKey));
  }
  const map = new Map<string, string>();
  for (const e of pool) {
    const name = norm(e.entityName);
    if (!name || name === "—") continue;
    const key = entityKey(e.entityType, e.entityName);
    if (!map.has(key)) map.set(key, name);
  }
  return Array.from(map.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
}

/**
 * Account dropdown — sirf Other company side ke connected accounts;
 * company / entity select hone par list narrow.
 */
export function reconShareOtherAccountOptions(
  entries: ReconShareSearchEntry[],
  filters: ReconShareListFilters,
): { value: string; label: string; triggerLabel?: string }[] {
  let pool = entries.filter(
    (e) => e.side === "other" && isReconShareSearchAccountValid(e.accountId, e.accountName),
  );
  if (filters.companyKey) {
    pool = pool.filter((e) => entryCompanyMatches(e, filters.companyKey));
  }
  if (filters.entityKey) {
    pool = pool.filter((e) => entryEntityMatches(e, filters.entityKey));
  }
  const seen = new Set<string>();
  const out: { value: string; label: string; triggerLabel?: string }[] = [];
  for (const e of pool) {
    if (seen.has(e.key)) continue;
    seen.add(e.key);
    out.push({
      value: e.key,
      label: `${e.accountName} (${e.companyName})`,
      triggerLabel: e.accountName,
    });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
}

/** Account pick — company + entity auto-fill (other side). */
export function reconShareEntryByAccountKey(
  entries: ReconShareSearchEntry[],
  accountKey: string,
): ReconShareSearchEntry | undefined {
  return entries.find((e) => e.key === accountKey);
}

export function reconShareFiltersFromAccountEntry(
  entry: ReconShareSearchEntry,
  prev?: ReconShareListFilters,
): ReconShareListFilters {
  return {
    companyKey: companyKey(entry.companyId, entry.companyName),
    entityKey: entityKey(entry.entityType, entry.entityName),
    accountKey: entry.key,
    linkStatus: prev?.linkStatus ?? "all",
  };
}

export { companyKey as reconShareCompanyKey, parseCompanyKey as parseReconShareCompanyKey };
