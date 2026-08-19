/**
 * Dev-only forensic: attachment remove/save ke baad file kahan se wapas aati hai.
 * Web console filter: `ATTACH_DELETE_TRACE`
 */
import { normalizeFileUrlsField, getVoucherAttachmentUrlsForUi } from "@/lib/voucherAttachmentNormalize";

const ENABLED = false; // reuse copy-as-new: attach-delete forensics off (was noisy / unused)

type TraceIntent = {
  companyId: string;
  voucherId: string;
  intendedUrls: string[];
  atMs: number;
};

type DurableIntentEntry = {
  at: number;
  /** Authoritative attachment URL list after save (empty = remove-all; shorter = partial remove). */
  urls: string[];
  /**
   * URLs that existed when the user cleared (intent.urls === []).
   * Stale Firestore/mirror revive of these is blocked; brand-new paste URLs are allowed.
   */
  blockedUrls?: string[];
};

const recentDeleteIntents = new Map<string, TraceIntent>();
const INTENT_TTL_MS = 120_000;
/** F5 ke baad bhi stale Firestore HTTPS trimmed/empty list pe wapas na aaye (outbox lag). */
const DURABLE_CLEAR_TTL_MS = 15 * 60_000;
const DURABLE_CLEAR_STORAGE_KEY = "pl_voucher_attachment_cleared_v1";

function intentKey(companyId: string, voucherId: string): string {
  return `${String(companyId || "").trim()}::${String(voucherId || "").trim()}`;
}

function readDurableIntentMap(): Record<string, DurableIntentEntry> {
  if (typeof sessionStorage === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(DURABLE_CLEAR_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, DurableIntentEntry> = {};
    const now = Date.now();
    for (const [k, v] of Object.entries(parsed)) {
      if (!k) continue;
      // Legacy: number timestamp → empty clear only.
      if (typeof v === "number" || (typeof v === "string" && Number.isFinite(Number(v)))) {
        const at = typeof v === "number" ? v : Number(v);
        if (!Number.isFinite(at) || now - at > DURABLE_CLEAR_TTL_MS) continue;
        out[k] = { at, urls: [] };
        continue;
      }
      if (!v || typeof v !== "object") continue;
      const rec = v as { at?: unknown; urls?: unknown; blockedUrls?: unknown };
      const at = typeof rec.at === "number" ? rec.at : Number(rec.at);
      if (!Number.isFinite(at) || now - at > DURABLE_CLEAR_TTL_MS) continue;
      const urls = Array.isArray(rec.urls) ? normalizeFileUrlsField(rec.urls) : [];
      const blockedUrls = Array.isArray(rec.blockedUrls)
        ? normalizeFileUrlsField(rec.blockedUrls)
        : undefined;
      out[k] = blockedUrls && blockedUrls.length > 0 ? { at, urls, blockedUrls } : { at, urls };
    }
    return out;
  } catch {
    return {};
  }
}

function writeDurableIntentMap(map: Record<string, DurableIntentEntry>): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(DURABLE_CLEAR_STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* quota / private mode */
  }
}

/** Save cleared/trimmed `fileUrls` — session me yaad rakho taaki refresh/pull purani HTTPS na laaye. */
export function markVoucherAttachmentsClearedDurable(
  companyId: string,
  voucherId: string,
  intendedUrls: readonly string[] = [],
  blockedUrls?: readonly string[]
): void {
  const key = intentKey(companyId, voucherId);
  if (!key.includes("::") || key.startsWith("::") || key.endsWith("::")) return;
  const map = readDurableIntentMap();
  const urls = normalizeFileUrlsField(intendedUrls);
  const blocked = urls.length === 0 ? normalizeFileUrlsField(blockedUrls) : [];
  map[key] =
    blocked.length > 0 ? { at: Date.now(), urls, blockedUrls: blocked } : { at: Date.now(), urls };
  writeDurableIntentMap(map);
}

export function clearVoucherAttachmentsClearedDurable(companyId: string, voucherId: string): void {
  const key = intentKey(companyId, voucherId);
  const map = readDurableIntentMap();
  if (!(key in map)) return;
  delete map[key];
  writeDurableIntentMap(map);
}

/** Session durable intent — intended URL list (empty = remove-all). */
export function getDurableVoucherAttachmentIntent(
  companyId: string,
  voucherId: string
): { urls: string[]; atMs: number; blockedUrls: string[] } | null {
  const key = intentKey(companyId, voucherId);
  if (!key || key.startsWith("::") || key.endsWith("::")) return null;
  const entry = readDurableIntentMap()[key];
  if (!entry) return null;
  if (Date.now() - entry.at > DURABLE_CLEAR_TTL_MS) {
    const map = readDurableIntentMap();
    delete map[key];
    writeDurableIntentMap(map);
    return null;
  }
  return {
    urls: normalizeFileUrlsField(entry.urls),
    atMs: entry.at,
    blockedUrls: normalizeFileUrlsField(entry.blockedUrls),
  };
}

/** True jab is session me user ne attachments hataaye (empty) aur Firestore abhi stale HTTPS rakh sakta hai. */
export function shouldPreserveClearedVoucherAttachments(
  companyId: string,
  voucherId: string
): boolean {
  const intent = getDurableVoucherAttachmentIntent(companyId, voucherId);
  // Legacy empty durable (no blockedUrls) used to force-wipe ALL adds for 15 min — never honor that.
  if (!intent || intent.urls.length !== 0) return false;
  return intent.blockedUrls.length > 0;
}

/**
 * Stale remote/fuller list revive block — empty clear OR partial trim (3→2).
 * Remote longer / has URLs outside intended set → preserve intended.
 *
 * Empty intent must NOT block every future paste/add — only revive of the
 * URLs that were present when the user cleared (`blockedUrls`).
 *
 * Non-empty intent + empty/shorter candidate → preserve only ~4s (stale pull
 * right after this device's save). After that, other-device add/delete wins.
 */
export function shouldPreserveIntendedVoucherAttachments(
  companyId: string,
  voucherId: string,
  candidateUrls: readonly string[] | null | undefined
): boolean {
  const intent = getDurableVoucherAttachmentIntent(companyId, voucherId);
  if (!intent) return false;
  const candidate = normalizeFileUrlsField(candidateUrls);
  if (intent.urls.length === 0) {
    const blocked = intent.blockedUrls;
    if (blocked.length === 0) return false;
    if (candidate.length === 0) return false;
    const blockedSet = new Set(blocked);
    // Stale mirror: candidate is only old cleared URLs, or the old list grew back.
    const onlyBlocked = candidate.every((u) => blockedSet.has(u));
    const staleFullList =
      blocked.every((u) => candidate.includes(u)) && candidate.length >= blocked.length;
    return onlyBlocked || staleFullList;
  }
  // Recent save had files — block only the short stale-empty/full-list bounce after *this* device's save.
  // 15min lock was hiding EXE/APK deletes (and extra files) on web after a web add.
  const NON_EMPTY_INTENT_STALE_GRACE_MS = 4_000;
  if (Date.now() - intent.atMs > NON_EMPTY_INTENT_STALE_GRACE_MS) return false;
  if (candidate.length < intent.urls.length) return true;
  if (candidate.length > intent.urls.length) return true;
  const intendedSet = new Set(intent.urls);
  if (candidate.some((u) => !intendedSet.has(u))) return true;
  return false;
}

/** Prefer durable intended list when candidate violates trim/clear intent. */
export function resolveUrlsAgainstAttachmentIntent(
  companyId: string,
  voucherId: string,
  candidateUrls: readonly string[] | null | undefined
): string[] | null {
  const intent = getDurableVoucherAttachmentIntent(companyId, voucherId);
  if (!intent) return null;
  if (!shouldPreserveIntendedVoucherAttachments(companyId, voucherId, candidateUrls)) {
    return null;
  }
  return intent.urls;
}

function previewUrls(urls: readonly string[], max = 4): string[] {
  return urls.slice(0, max).map((u) => {
    const s = String(u || "");
    if (s.startsWith("blob:")) return `blob:…${s.slice(-12)}`;
    if (s.startsWith("local:")) return s.slice(0, 42);
    if (s.startsWith("http")) return s.slice(0, 64);
    return s.slice(0, 48);
  });
}

/**
 * Edit form ~1s file gayab — filter console: `ATTACH_WIPE`
 * Always logs in development (and when NEXT_PUBLIC_ATTACH_WIPE_LOG=1).
 */
export function logAttachWipe(params: {
  source: string;
  reason: string;
  companyId?: string | null;
  voucherId?: string | null;
  beforeUrls?: readonly string[] | null;
  afterUrls?: readonly string[] | null;
  extra?: Record<string, unknown>;
}): void {
  const force =
    typeof process !== "undefined" &&
    String(process.env.NEXT_PUBLIC_ATTACH_WIPE_LOG || "").trim() === "1";
  if (!ENABLED && !force) return;
  const before = normalizeFileUrlsField(params.beforeUrls);
  const after = normalizeFileUrlsField(params.afterUrls);
  if (before.length === 0 && after.length === 0) return;
  // Only care about shrink / clear against non-empty before
  if (!(before.length > after.length || (before.length > 0 && after.length === 0))) {
    if (!force) return;
  }
  console.warn("%c[ATTACH_WIPE]", "color:#dc2626;font-weight:bold;font-size:12px", {
    source: params.source,
    reason: params.reason,
    companyId: params.companyId || undefined,
    voucherId: params.voucherId || undefined,
    beforeCount: before.length,
    afterCount: after.length,
    beforePreview: previewUrls(before),
    afterPreview: previewUrls(after),
    ...params.extra,
    stack: stackHint(),
  });
}

function stackHint(): string {
  try {
    const stack = new Error().stack || "";
    return stack
      .split("\n")
      .slice(2, 8)
      .map((l) => l.trim())
      .join(" | ");
  } catch {
    return "";
  }
}

/** Save/outbox ne empty/trimmed list likhi — baad me grow hone par WARN. */
export function markAttachmentDeleteIntent(params: {
  companyId: string;
  voucherId: string;
  intendedUrls: readonly string[];
  source: string;
  /** When clearing to [], URLs that were on the voucher — used to block only those from reviving. */
  previousUrls?: readonly string[];
}): void {
  const companyId = String(params.companyId || "").trim();
  const voucherId = String(params.voucherId || "").trim();
  if (!companyId || !voucherId) return;
  const intendedUrls = normalizeFileUrlsField(params.intendedUrls);
  const previousUrls = normalizeFileUrlsField(params.previousUrls);
  // Empty + partial trim dono session-durable — stale Firestore HTTPS revive rokne ke liye.
  markVoucherAttachmentsClearedDurable(
    companyId,
    voucherId,
    intendedUrls,
    intendedUrls.length === 0 ? previousUrls : undefined
  );
  recentDeleteIntents.set(intentKey(companyId, voucherId), {
    companyId,
    voucherId,
    intendedUrls,
    atMs: Date.now(),
  });
  if (!ENABLED) return;
  console.log("%c[ATTACH_DELETE_TRACE] INTENT", "color:#0ea5e9;font-weight:bold", {
    source: params.source,
    companyId,
    voucherId,
    intendedCount: intendedUrls.length,
    intendedPreview: previewUrls(intendedUrls),
    blockedPreview:
      intendedUrls.length === 0 && previousUrls.length > 0 ? previewUrls(previousUrls) : undefined,
  });
}

/** Save ke baad nayi attachment list — stale mirror revive guard hatao. */
export function clearAttachmentDeleteIntent(companyId: string, voucherId: string): void {
  const cid = String(companyId || "").trim();
  const vid = String(voucherId || "").trim();
  if (!cid || !vid) return;
  clearVoucherAttachmentsClearedDurable(cid, vid);
  recentDeleteIntents.delete(intentKey(cid, vid));
}

const VOUCHER_ATTACHMENT_LIVE_PATCH_KEYS = new Set(["fileUrls", "files", "unassignedFile"]);

/** `dispatchVoucherAttachmentSaved` / `buildVoucherAttachmentLivePatch` — full voucher doc nahi. */
export function isAuthoritativeVoucherAttachmentLivePatch(patch: Record<string, unknown>): boolean {
  const keys = Object.keys(patch).filter((k) => k !== "id");
  if (keys.length === 0) return false;
  return keys.every((k) => VOUCHER_ATTACHMENT_LIVE_PATCH_KEYS.has(k));
}

/** Koi path fileUrls / attachments set kar raha hai — delete intent ke baad grow = suspect. */
export function traceAttachmentUrlsChange(params: {
  source: string;
  companyId?: string | null;
  voucherId?: string | null;
  prevUrls?: readonly string[] | null;
  nextUrls?: readonly string[] | null;
  extra?: Record<string, unknown>;
}): void {
  if (!ENABLED) return;
  const companyId = String(params.companyId || "").trim();
  const voucherId = String(params.voucherId || "").trim();
  const prev = normalizeFileUrlsField(params.prevUrls);
  const next = normalizeFileUrlsField(params.nextUrls);
  const prevFp = prev.join("\x1e");
  const nextFp = next.join("\x1e");
  if (prevFp === nextFp && !params.extra) return;

  const grew = next.length > prev.length || (prev.length === 0 && next.length > 0);
  const intent = companyId && voucherId ? recentDeleteIntents.get(intentKey(companyId, voucherId)) : undefined;
  const intentFresh = intent && Date.now() - intent.atMs < INTENT_TTL_MS;
  const violatesIntent =
    Boolean(intentFresh) &&
    next.length > intent!.intendedUrls.length &&
    (intent!.intendedUrls.length === 0 || next.some((u) => !intent!.intendedUrls.includes(u)));

  const payload = {
    source: params.source,
    companyId: companyId || undefined,
    voucherId: voucherId || undefined,
    prevCount: prev.length,
    nextCount: next.length,
    grew,
    violatesDeleteIntent: violatesIntent,
    prevPreview: previewUrls(prev),
    nextPreview: previewUrls(next),
    intentCount: intentFresh ? intent!.intendedUrls.length : undefined,
    msSinceIntent: intentFresh ? Date.now() - intent!.atMs : undefined,
    ...params.extra,
    stack: violatesIntent || grew ? stackHint() : undefined,
  };

  if (violatesIntent) {
    console.warn("%c[ATTACH_DELETE_TRACE] REVIVE_AFTER_DELETE", "color:#ef4444;font-weight:bold", payload);
  } else if (grew) {
    console.warn("%c[ATTACH_DELETE_TRACE] GROW", "color:#f59e0b;font-weight:bold", payload);
  } else {
    console.log("%c[ATTACH_DELETE_TRACE]", "color:#64748b", payload);
  }
}

export function traceAttachmentRowChange(params: {
  source: string;
  companyId?: string | null;
  voucherId?: string | null;
  prevRow?: Record<string, unknown> | null;
  nextRow?: Record<string, unknown> | null;
  extra?: Record<string, unknown>;
}): void {
  if (!ENABLED) return;
  const prevUrls = getVoucherAttachmentUrlsForUi(params.prevRow);
  const nextUrls = getVoucherAttachmentUrlsForUi(params.nextRow);
  const prevUf =
    params.prevRow?.unassignedFile && typeof params.prevRow.unassignedFile === "object"
      ? String((params.prevRow.unassignedFile as { url?: string }).url || "").trim()
      : "";
  const nextUf =
    params.nextRow?.unassignedFile && typeof params.nextRow.unassignedFile === "object"
      ? String((params.nextRow.unassignedFile as { url?: string }).url || "").trim()
      : "";
  traceAttachmentUrlsChange({
    source: params.source,
    companyId: params.companyId,
    voucherId: params.voucherId || String(params.nextRow?.id || params.prevRow?.id || ""),
    prevUrls,
    nextUrls,
    extra: {
      ...params.extra,
      prevUnassigned: prevUf ? prevUf.slice(0, 48) : "",
      nextUnassigned: nextUf ? nextUf.slice(0, 48) : "",
    },
  });
}

function rowEditTimeMs(row: Record<string, unknown> | null | undefined): number {
  if (!row) return 0;
  for (const key of ["lastEditedAt", "updatedAt", "createdAt"] as const) {
    const v = row[key];
    if (v == null) continue;
    if (typeof (v as { toMillis?: () => number }).toMillis === "function") {
      try {
        return (v as { toMillis: () => number }).toMillis();
      } catch {
        /* fall through */
      }
    }
    const sec = (v as { seconds?: number }).seconds;
    if (typeof sec === "number") return sec * 1000;
    const d = new Date(v as string | number | Date);
    if (!Number.isNaN(d.getTime())) return d.getTime();
  }
  return 0;
}

/**
 * Mirror/live patch kabhi full voucher doc bhejta hai (purani HTTPS ke saath).
 * Cache pe intentional empty/trimmed `fileUrls` ho to stale patch se revive mat hone do.
 */
export function protectClearedAttachmentsFromStalePatch(
  existing: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>,
  opts?: { companyId?: string; voucherId?: string }
): Record<string, unknown> {
  if (!existing || !patch) return patch;
  // Form save ke turant baad attachment-only patch authoritative hai — ledger live preview.
  if (isAuthoritativeVoucherAttachmentLivePatch(patch)) {
    return patch;
  }
  const patchHasFileUrlsKey = Object.prototype.hasOwnProperty.call(patch, "fileUrls");
  if (!patchHasFileUrlsKey) return patch;
  const patchUrls = normalizeFileUrlsField(patch.fileUrls);
  const existingUrls = normalizeFileUrlsField(existing.fileUrls);
  const existingExplicitEmpty =
    Object.prototype.hasOwnProperty.call(existing, "fileUrls") &&
    Array.isArray(existing.fileUrls) &&
    (existing.fileUrls as unknown[]).length === 0;
  const existingShorterHttps =
    Object.prototype.hasOwnProperty.call(existing, "fileUrls") &&
    Array.isArray(existing.fileUrls) &&
    existingUrls.length > 0 &&
    patchUrls.length > existingUrls.length;

  const existingMs = rowEditTimeMs(existing);
  const patchMs = rowEditTimeMs(patch);
  const voucherId = String(opts?.voucherId || existing.id || patch.id || "").trim();
  const companyId = String(opts?.companyId || "").trim();
  const intent =
    companyId && voucherId ? recentDeleteIntents.get(intentKey(companyId, voucherId)) : undefined;
  const intentFresh = Boolean(intent && Date.now() - intent.atMs < INTENT_TTL_MS);
  const durableBlock =
    companyId && voucherId
      ? shouldPreserveIntendedVoucherAttachments(companyId, voucherId, patchUrls)
      : false;
  const intentFreshTrimOrClear = Boolean(
    intentFresh &&
      ((intent!.intendedUrls.length === 0 &&
        // Only treat empty intent as "block grow" when we know which URLs were cleared.
        normalizeFileUrlsField(
          getDurableVoucherAttachmentIntent(companyId, voucherId)?.blockedUrls
        ).length > 0 &&
        shouldPreserveIntendedVoucherAttachments(companyId, voucherId, patchUrls)) ||
        (intent!.intendedUrls.length > 0 && patchUrls.length > intent!.intendedUrls.length))
  );

  if (!existingExplicitEmpty && !existingShorterHttps && !durableBlock && !intentFreshTrimOrClear) {
    return patch;
  }
  if (patchUrls.length === 0 && !existingExplicitEmpty && !durableBlock) {
    return patch;
  }
  // Growing patch vs shorter/empty cache or durable intent — block revive.
  // Important: empty cache → non-empty patch is a normal “add attachment” save unless intent says otherwise.
  if (
    patchUrls.length > existingUrls.length ||
    (existingExplicitEmpty && patchUrls.length > 0 && (durableBlock || intentFreshTrimOrClear)) ||
    durableBlock
  ) {
    if (intentFreshTrimOrClear || durableBlock || existingMs >= patchMs || patchMs === 0) {
      const keepUrls =
        (companyId && voucherId
          ? resolveUrlsAgainstAttachmentIntent(companyId, voucherId, patchUrls)
          : null) ??
        (intentFresh ? intent!.intendedUrls : null) ??
        existingUrls;
      if (ENABLED) {
        console.warn("%c[ATTACH_DELETE_TRACE] BLOCK_STALE_MIRROR_REVIVE", "color:#ef4444;font-weight:bold", {
          companyId: companyId || undefined,
          voucherId,
          existingMs,
          patchMs,
          keepCount: keepUrls.length,
          patchUrlPreview: previewUrls(patchUrls),
          keepPreview: previewUrls(keepUrls),
        });
      }
      logAttachWipe({
        source: "protectClearedAttachmentsFromStalePatch",
        reason: "blocked_patch_kept_existing_or_intent",
        companyId,
        voucherId,
        beforeUrls: patchUrls,
        afterUrls: keepUrls,
        extra: {
          existingMs,
          patchMs,
          durableBlock,
          intentFreshTrimOrClear,
          existingExplicitEmpty,
        },
      });
      return {
        ...patch,
        fileUrls: keepUrls,
        files: [],
        unassignedFile: keepUrls.length === 0 ? null : (patch.unassignedFile ?? existing.unassignedFile ?? null),
      };
    }
  }
  return patch;
}

export type StorageDeleteOutcome =
  | "deleted"
  | "skipped_no_path"
  | "skipped_refcount"
  | "skipped_not_eligible"
  | "not_found"
  | "failed";

function firebaseErrorCode(err: unknown): string {
  if (!err || typeof err !== "object") return "";
  const code = (err as { code?: string }).code;
  return typeof code === "string" ? code : "";
}

/** Save ke baad bucket cleanup plan — kya delete list me gaya / kyun khali. */
export function traceStorageCleanupPlan(params: {
  companyId: string;
  entityId?: string;
  baselineUrls: readonly string[];
  finalUrls: readonly string[];
  oldDocRemoteUrls?: readonly string[];
  storageDeleteUrls: readonly string[];
  localPendingRefs: readonly string[];
  driveRefs: readonly string[];
}): void {
  if (!ENABLED) return;
  console.log("%c[ATTACH_DELETE_TRACE] STORAGE_PLAN", "color:#8b5cf6;font-weight:bold", {
    companyId: params.companyId,
    entityId: params.entityId || undefined,
    baselineCount: params.baselineUrls.length,
    finalCount: params.finalUrls.length,
    remoteBaselineCount: params.oldDocRemoteUrls?.length ?? 0,
    storageDeleteCount: params.storageDeleteUrls.length,
    localPendingCount: params.localPendingRefs.length,
    driveRefCount: params.driveRefs.length,
    baselinePreview: previewUrls(params.baselineUrls),
    finalPreview: previewUrls(params.finalUrls),
    remotePreview: previewUrls(params.oldDocRemoteUrls ?? []),
    storageDeletePreview: previewUrls(params.storageDeleteUrls),
    localPendingPreview: previewUrls(params.localPendingRefs),
  });
}

export function traceStorageCleanupSkip(params: {
  companyId: string;
  entityId?: string;
  reason: string;
  baselineUrls?: readonly string[];
  finalUrls?: readonly string[];
}): void {
  if (!ENABLED) return;
  console.warn("%c[ATTACH_DELETE_TRACE] STORAGE_SKIP", "color:#f59e0b;font-weight:bold", {
    companyId: params.companyId,
    entityId: params.entityId || undefined,
    reason: params.reason,
    baselinePreview: previewUrls(params.baselineUrls ?? []),
    finalPreview: previewUrls(params.finalUrls ?? []),
  });
}

export function traceStorageDeleteBatchStart(params: {
  companyId: string;
  entityId?: string;
  registryEnabled: boolean;
  forceDeleteBytes: boolean;
  urlCount: number;
}): void {
  if (!ENABLED) return;
  console.log("%c[ATTACH_DELETE_TRACE] STORAGE_DELETE_START", "color:#8b5cf6;font-weight:bold", params);
}

export function traceStorageDeleteUrlResult(params: {
  phase: "registry_unlink" | "force_delete" | "local_id_walk";
  companyId: string;
  entityId?: string;
  url?: string;
  storagePath?: string | null;
  outcome: StorageDeleteOutcome;
  error?: unknown;
  detail?: Record<string, unknown>;
}): void {
  if (!ENABLED) return;
  const isOk = params.outcome === "deleted" || params.outcome === "not_found";
  const logFn = isOk ? console.log.bind(console) : console.warn.bind(console);
  const style = isOk
    ? "color:#22c55e;font-weight:bold"
    : params.outcome === "skipped_refcount"
      ? "color:#64748b"
      : "color:#ef4444;font-weight:bold";
  logFn(`%c[ATTACH_DELETE_TRACE] STORAGE_${params.outcome.toUpperCase()}`, style, {
    phase: params.phase,
    companyId: params.companyId,
    entityId: params.entityId || undefined,
    urlPreview: params.url ? previewUrls([params.url])[0] : undefined,
    storagePath: params.storagePath || undefined,
    errorCode: firebaseErrorCode(params.error),
    errorMessage:
      params.error && typeof params.error === "object" && "message" in params.error
        ? String((params.error as { message?: string }).message || "")
        : params.error != null
          ? String(params.error)
          : undefined,
    ...params.detail,
  });
}

export function traceStorageCleanupDone(params: {
  companyId: string;
  entityId?: string;
  storageDeleteCount: number;
  localPendingCount: number;
}): void {
  if (!ENABLED) return;
  console.log("%c[ATTACH_DELETE_TRACE] STORAGE_CLEANUP_DONE", "color:#22c55e;font-weight:bold", params);
}

export function traceStorageCleanupBlocked(params: {
  companyId: string;
  entityId?: string;
  reason: string;
  detail?: Record<string, unknown>;
}): void {
  if (!ENABLED) return;
  console.warn("%c[ATTACH_DELETE_TRACE] STORAGE_BLOCKED", "color:#f59e0b;font-weight:bold", params);
}
