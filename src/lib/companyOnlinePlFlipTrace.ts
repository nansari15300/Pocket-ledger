"use client";

import { getActiveGate } from "@/lib/gates/gateStore";
import { isCompanyAllowedOnActiveServerGate } from "@/lib/plServerRemoteCompanyLogin";
import { isListedPlServerSharedCompany, isPlServerSharedCompanyRow } from "@/lib/plServerAccessContext";
import { isServerGateCompany } from "@/lib/companyStorageKind";

const FLIP_TAG = "[CompanyOnlinePlFlip]";
const PULSE_TAG = "[CompanySetPulse]";
const STICKY_KEY = "pl.stickyPlServerCompanyIds.v1";

/** Flip diagnosis ke liye tracked keys — inme change = company "flip" feel. */
const FLIP_WATCH_KEYS = [
  "id",
  "name",
  "storageOption",
  "syncPolicy",
  "syncedFromCloud",
  "plServerShared",
  "plServerGateId",
  "plServerGateServerUrl",
  "plServerHostCompanyId",
  "enableCrossCompanyLedgerCopy",
  "enableShareForReconciliation",
  "authoritativeCompanyId",
  "ownerId",
  "ownerEmail",
  "isOwned",
  "localOnly",
  "firestoreSyncDisabled",
  "localPersistence",
] as const;

type FlipRow = {
  id?: string;
  name?: string;
  storageOption?: string | null;
  syncPolicy?: string | null;
  syncedFromCloud?: boolean;
  plServerShared?: boolean;
  plServerGateId?: string;
  plServerGateServerUrl?: string;
  plServerHostCompanyId?: string;
  enableCrossCompanyLedgerCopy?: boolean;
  enableShareForReconciliation?: boolean;
  authoritativeCompanyId?: string;
  ownerId?: string;
  ownerEmail?: string | null;
  isOwned?: boolean;
  localOnly?: boolean;
  firestoreSyncDisabled?: boolean;
  localPersistence?: string | null;
} | null | undefined;

function readStickyIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(STICKY_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.map((x) => String(x || "").trim()).filter(Boolean));
  } catch {
    return new Set();
  }
}

function writeStickyIds(ids: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STICKY_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

/** Active PL-gate company — session sticky so Firestore mirror share-list flicker pe online na bane. */
export function markStickyPlServerCompanyId(companyId: string | null | undefined): void {
  const id = String(companyId || "").trim();
  if (!id) return;
  const ids = readStickyIds();
  if (ids.has(id)) return;
  ids.add(id);
  writeStickyIds(ids);
}

export function clearStickyPlServerCompanyId(companyId: string | null | undefined): void {
  const id = String(companyId || "").trim();
  if (!id) return;
  const ids = readStickyIds();
  if (!ids.delete(id)) return;
  writeStickyIds(ids);
}

export function isStickyPlServerCompanyId(companyId: string | null | undefined): boolean {
  const id = String(companyId || "").trim();
  if (!id) return false;
  return readStickyIds().has(id);
}

function watchVal(row: FlipRow, key: string): string {
  if (!row) return "<null>";
  const v = (row as Record<string, unknown>)[key];
  if (v === undefined) return "<undefined>";
  if (v === null) return "<null>";
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
}

export function companyFlipChangedKeys(before: FlipRow, after: FlipRow): string[] {
  const changed: string[] = [];
  if (!before && !after) return changed;
  if (!before || !after) {
    changed.push(before ? "row→null" : "null→row");
    return changed;
  }
  for (const key of FLIP_WATCH_KEYS) {
    if (watchVal(before, key) !== watchVal(after, key)) changed.push(key);
  }
  return changed;
}

export function companyFlipSnapshot(row: FlipRow): Record<string, unknown> {
  if (!row) return { present: false };
  return {
    present: true,
    id: String(row.id || "").trim() || null,
    name: row.name || null,
    storageOption: row.storageOption ?? null,
    syncPolicy: row.syncPolicy ?? null,
    syncedFromCloud: row.syncedFromCloud === true,
    plServerShared: row.plServerShared === true,
    plServerGateId: row.plServerGateId || null,
    hasGateServerUrl: Boolean(String(row.plServerGateServerUrl || "").trim()),
    plServerHostCompanyId: row.plServerHostCompanyId || null,
    enableCrossCompanyLedgerCopy: row.enableCrossCompanyLedgerCopy === true,
    enableShareForReconciliation: row.enableShareForReconciliation === true,
    authoritativeCompanyId: String(row.authoritativeCompanyId || "").trim() || null,
    ownerId: row.ownerId || null,
    isOwned: row.isOwned === true,
    localOnly: row.localOnly === true,
  };
}

function flipKind(row: FlipRow): "pl_server" | "online_firebase" | "local" | "none" {
  if (!row) return "none";
  if (
    row.plServerShared === true ||
    isServerGateCompany(row as never) ||
    isPlServerSharedCompanyRow(row as never, null)
  ) {
    return "pl_server";
  }
  const so = String(row.storageOption || "").toLowerCase().trim();
  if (so === "firebase" || row.syncedFromCloud === true || so === "drive") return "online_firebase";
  if (so === "local") return "local";
  return "local";
}

/** Same id: PL/local_server shape ko Firebase online stamp se overwrite mat hone do. */
export function shouldPreferPlServerOverCloudRow(
  row: { id?: string; plServerHostCompanyId?: string; plServerShared?: boolean } | null | undefined
): boolean {
  if (!row) return false;
  const id = String(row.id || "").trim();
  if (row.plServerShared === true) return true;
  if (isServerGateCompany(row as never)) return true;
  if (isListedPlServerSharedCompany(row)) return true;
  if (id && isStickyPlServerCompanyId(id)) return true;
  try {
    const gate = getActiveGate();
    if (gate.type === "local_server" && id && isCompanyAllowedOnActiveServerGate(id, gate)) {
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

/** prev PL/local_server + next cloud stamp → retain prev (header Sync/Recon blink root). */
export function shouldRetainPlServerCompanyShape(prev: FlipRow, next: FlipRow): boolean {
  if (!prev || !next) return false;
  if (String(prev.id || "").trim() !== String(next.id || "").trim()) return false;
  const prevKind = flipKind(prev);
  const nextKind = flipKind(next);
  if (prevKind === "pl_server" && nextKind === "online_firebase") return true;
  if (
    prevKind === "pl_server" &&
    (String(next.storageOption || "").toLowerCase() === "firebase" || next.syncedFromCloud === true) &&
    next.plServerShared !== true
  ) {
    return true;
  }
  if (shouldPreferPlServerOverCloudRow(prev) && nextKind === "online_firebase") return true;
  return false;
}

let setPulseSeq = 0;
let lastPulseAt = 0;
let lastPulseSig = "";
let pulseSuppressed = 0;

function gateMeta(): { gateType: string; gateId: string } {
  try {
    const g = getActiveGate();
    return { gateType: g.type, gateId: g.id };
  } catch {
    return { gateType: "?", gateId: "?" };
  }
}

/**
 * Har meaningful setCompany — message string me hi kind + changedKeys (expand ke bina padho).
 * Filter: `CompanyOnlinePlFlip` ya `CompanySetPulse`
 */
export function logCompanyOnlinePlFlip(
  reason: string,
  detail: {
    before: FlipRow;
    after: FlipRow;
    source?: string;
    pathname?: string;
    extra?: Record<string, unknown>;
  }
): void {
  if (typeof window === "undefined") return;
  const beforeKind = flipKind(detail.before);
  const afterKind = flipKind(detail.after);
  const kindChanged = beforeKind !== afterKind;
  const changedKeys = companyFlipChangedKeys(detail.before, detail.after);
  const nullFlip = !detail.before !== !detail.after;
  const featureFlip =
    Boolean(detail.before?.enableCrossCompanyLedgerCopy) !==
      Boolean(detail.after?.enableCrossCompanyLedgerCopy) ||
    Boolean(detail.before?.enableShareForReconciliation) !==
      Boolean(detail.after?.enableShareForReconciliation);

  const idBefore = String(detail.before?.id || "").trim();
  const idAfter = String(detail.after?.id || "").trim();
  const source = detail.source || "unknown";
  const { gateType, gateId } = gateMeta();
  const pathname = detail.pathname || (typeof location !== "undefined" ? location.pathname : null);

  // Pulse: har setCompany attempt (same-ref skip caller pe). Filter: CompanySetPulse
  setPulseSeq += 1;
  const sig = `${source}|${beforeKind}|${afterKind}|${changedKeys.join(",")}|${idBefore}|${idAfter}`;
  const now = Date.now();
  if (sig === lastPulseSig && now - lastPulseAt < 400) {
    pulseSuppressed += 1;
  } else {
    if (pulseSuppressed > 0) {
      console.warn(
        `${PULSE_TAG} suppressed_repeat x${pulseSuppressed} last=${lastPulseSig}`
      );
      pulseSuppressed = 0;
    }
    lastPulseSig = sig;
    lastPulseAt = now;
    console.warn(
      `${PULSE_TAG} #${setPulseSeq} ${beforeKind}→${afterKind} src=${source} keys=[${changedKeys.join(",") || "none"}]`,
      {
        at: new Date(now).toISOString(),
        reason,
        source,
        beforeKind,
        afterKind,
        changedKeys,
        nullFlip,
        companyId: idAfter || idBefore || null,
        gateType,
        gateId,
        pathname,
        before: companyFlipSnapshot(detail.before),
        after: companyFlipSnapshot(detail.after),
        ...(detail.extra || {}),
      }
    );
  }

  // Full flip warn: sirf jab kind/null/feature/watch-keys badlen
  if (!kindChanged && !featureFlip && !nullFlip && changedKeys.length === 0) return;

  const msg = `${FLIP_TAG} ${reason} ${beforeKind}→${afterKind} src=${source} keys=[${changedKeys.join(",") || "none"}]`;
  console.warn(msg, {
    at: new Date().toISOString(),
    beforeKind,
    afterKind,
    kindChanged,
    featureFlip,
    nullFlip,
    changedKeys,
    changedDetail: changedKeys.map((k) => ({
      key: k,
      from: k === "null→row" || k === "row→null" ? k : watchVal(detail.before, k),
      to: k === "null→row" || k === "row→null" ? k : watchVal(detail.after, k),
    })),
    gateType,
    gateId,
    pathname,
    source,
    before: companyFlipSnapshot(detail.before),
    after: companyFlipSnapshot(detail.after),
    sticky: isStickyPlServerCompanyId(idAfter || idBefore),
    ...(detail.extra || {}),
  });
}

export function logHeaderFeatureButtonFlip(
  detail: {
    companyId: string | null;
    syncLedgerVisible: boolean;
    shareReconVisible: boolean;
    enableCrossCompanyLedgerCopy: boolean;
    enableShareForReconciliation: boolean;
    storageOption?: string | null;
    plServerShared?: boolean;
    syncedFromCloud?: boolean;
  }
): void {
  if (typeof window === "undefined") return;
  const kind = flipKind({
    id: detail.companyId || undefined,
    storageOption: detail.storageOption,
    syncedFromCloud: detail.syncedFromCloud,
    plServerShared: detail.plServerShared,
    enableCrossCompanyLedgerCopy: detail.enableCrossCompanyLedgerCopy,
    enableShareForReconciliation: detail.enableShareForReconciliation,
  });
  console.warn(
    `[HeaderFeatureButtonFlip] sync=${detail.syncLedgerVisible} recon=${detail.shareReconVisible} kind=${kind}`,
    {
      at: new Date().toISOString(),
      ...detail,
      kind,
    }
  );
}
