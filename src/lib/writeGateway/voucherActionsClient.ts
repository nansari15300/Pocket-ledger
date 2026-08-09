"use client";

import {
  doc,
  getDoc,
  query,
  where,
  getDocs,
  Timestamp,
  collection,
  serverTimestamp,
} from "firebase/firestore";
import { addDoc, setDoc, updateDoc, runTransaction } from "@/lib/writeGateway/firestoreMutationsInternal";
import { auth, firestore, storage, firestoreNetworkDisabledByApi } from "@/lib/firebase";
import { ref as storageRef, deleteObject } from "firebase/storage";
import { moveFilesToVoucherDateClient } from "@/lib/storageClient";
import { deleteFirebaseStorageUrlsWithRegistry } from "@/lib/companyAttachmentRegistry";
import {
  getCompanyDocFromBrowserDb,
  mirrorVoucherDocToBrowserDb,
  upsertCompanyDocInBrowserDb,
} from "@/lib/localCompanyDocMirror";
import {
  enqueueVoucherOutbox,
  isLikelyOfflineFirestoreError,
  canSyncCompanyToServer,
  removeOutboxRowsForCompanyDoc,
  flushVoucherOutbox,
} from "@/lib/localVoucherOutbox";
import { syncPendingFiles } from "@/lib/localPendingFiles";
import { classifyAttachmentRef, logAttachmentPipeline } from "@/lib/attachmentPipelineDebug";
import {
  coerceVoucherDocumentDate,
  mergeVoucherCalendarDateWithSaveClock,
  parseFirestoreDateFieldToJsDate,
} from "@/lib/voucherDateNormalize";
import { getPlan, numericEntitlement, companyStorageIsLocal, type Entitlements, type PlanId } from "@/config/plans";
import { getPlanFromPlans } from "@/hooks/useLivePlans";
import { readCachedPlansRecord, defaultPlansRecordFallback } from "@/lib/plansCatalogCache";
import { getLocalCompanyById, listLocalCompanies } from "@/lib/localCompanyStore";
import { resolvePlanIdForVoucherEnforcement } from "@/lib/companyPlanLocalCache";
import { listCompanyDocsFromBrowserDb } from "@/lib/localCompanyDocMirror";
import { getEffectiveHistorySettings } from "@/lib/voucherHistoryUtils";
import {
  buildInterCompanyCreateHistoryChanges,
  type InterCompanyCreateHistoryInput,
} from "@/lib/interCompany/interCompanyVoucherHistory";
import { buildInterCompanyApprovalPatch } from "@/lib/interCompany/interCompanyApproval";
import { assertInterCompanyTargetApproveAllowed } from "@/lib/interCompany/interCompanyTargetApproval";
import { interCompanyVoucherViewerSide, readInterCompanyLink } from "@/lib/interCompany/interCompanyVoucherHydrate";
import { reconcileRecurringTemplateAfterAutoVoucherRecycle } from "@/lib/writeGateway/recurringVouchers";
import { startOfDay, endOfDay, startOfMonth, endOfMonth } from "date-fns";
import type { Allocation } from "@/lib/payment-allocation-utils";
import { getAllocationTotal, OPENING_BALANCE_VOUCHER_ID } from "@/lib/payment-allocation-utils";
import { isLocalOnlyMode } from "@/lib/localMode";
import { generateLocalVoucherIdForCreate } from "@/lib/localEntityIds";
import { isCompanyNotFoundError } from "@/lib/companyUpdateGuard";
import {
  filterAttachmentsForCompanyContext,
  filterVoucherAttachmentsForCompanyContext,
  getCrossCompanyAttachmentAccessPolicy,
} from "@/lib/crossCompanyAttachmentAccess";
import { isSoftDeleteLedgerPatch } from "@/lib/purgeGhostLocalCompanyDoc";
import { sendRecycleBinMovedAlert } from "@/lib/writeGateway/legacy/recycleBinAlerts";
import type { Company } from "@/hooks/useCompany";
import { LOCAL_MIRROR_META_SERVER_CONFIRMED_KEY, PL_CLIENT_OFFLINE_FIRST_PERSIST_MS } from "@/lib/localMirrorServerMeta";
import { beginApkLedgerAsyncWriteShield } from "@/lib/apkLedgerRouteShield";
import { writeEntity } from "@/lib/writeGateway";
import {
  apkCloudCompanyUsesSqliteFirstWrites,
  apkEmbeddedSqliteFirstWritesPreferred,
  isClientNavigatorOffline,
} from "@/lib/apkOnlineFirestoreWritePolicy";
import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";
import { isStaticAppBuild } from "@/lib/isStaticAppBuild";
import { isElectronDesktopApp } from "@/lib/isElectronDesktop";
import { assertCompanyAllowsLedgerMutations } from "@/lib/security/offlinePlanWriteGate";
import { isFirebaseLedgerDataSyncDisabled } from "@/lib/firebaseLedgerDataSyncDisabled";
import { isFirebaseLedgerCompanyDataSyncEnabled } from "@/lib/firebaseLedgerCompanySyncPrefs";
import { isOnlineCompanyLedgerCloudSyncAllowed } from "@/lib/onlineCompanySelectorSyncPolicy";
import { isOfflineCompanyStorage } from "@/lib/companyUnlockGate";
import { hydrateVoucherLocalAttachmentsForServer } from "@/lib/hydrateVoucherLocalAttachmentsForServer";
import {
  recordContainsLocalPendingVoucherFileRef,
  rewriteRemoteVoucherAttachmentsForOfflineCompany,
  voucherNewAttachmentsAlwaysStageAsLocalPending,
} from "@/lib/voucherLocalAttachmentUpload";
import { scheduleBrowserDbPersistAfterWrite } from "@/lib/localSqlite";
import { parseAttachmentHoldClipboardText } from "@/lib/attachmentHoldClipboard";
import { dispatchVoucherLivePatch, dispatchVoucherAttachmentSaved, materializeVoucherAttachmentsInSavePayload } from "@/lib/voucherFormAttachmentSave";
import {
  finalizeFormAttachmentEditAfterSave,
  mergeAttachmentCleanupContexts,
  readVoucherAttachmentBaselineFromRow,
  readVoucherEditAttachmentContext,
} from "@/lib/formAttachmentEditHelper";
import { normalizeFileUrlsField, dedupeVoucherAttachmentUrlList, withoutTransientVoucherAttachmentUrls, isTransientVoucherAttachmentUrl } from "@/lib/voucherAttachmentNormalize";
import { isDeviceLocalCompany, isServerGateCompany, shouldStripTransientVoucherAttachmentUrls } from "@/lib/companyStorageKind";
import { isLocalFileRef, getPendingPayloadForLocalRef, LOCAL_FILE_PREFIX } from "@/lib/localPendingFiles";
import { isDriveFileRef } from "@/lib/legacyDriveFileRef";
import { resolveAuthoritativeFirestoreCompanyId } from "@/lib/resolveAuthoritativeFirestoreCompanyId";
import { voucherDeleteDebugLog } from "@/lib/voucherDeletePreCheck";

/** Edit save: transient `blob:` preview URLs ya khali `fileUrls` se `local:` / Drive refs mat hatao. */
function persistableVoucherAttachmentUrls(raw: unknown): string[] {
  return withoutTransientVoucherAttachmentUrls(normalizeFileUrlsField(raw));
}

/** SQLite/outbox edit merge — incoming me `fileUrls` key ho to explicit replace (khali `[]` = user ne hata diya). */
function mergeVoucherEditPayloadPreservingAttachments(
  existing: Record<string, unknown> | null | undefined,
  incoming: Record<string, unknown>
): Record<string, unknown> {
  const merged = { ...(existing || {}), ...incoming };
  const hasIncomingFileUrls = Object.prototype.hasOwnProperty.call(incoming, "fileUrls");
  const existingUrls = persistableVoucherAttachmentUrls(existing?.fileUrls);
  const incomingUrls = persistableVoucherAttachmentUrls(incoming.fileUrls);

  if (hasIncomingFileUrls) {
    merged.fileUrls = incomingUrls;
    // Form save `files: []` bhejta hai; warna purani metadata EXE par removed file dikha deti thi.
    if (Object.prototype.hasOwnProperty.call(incoming, "files")) {
      merged.files = incoming.files;
    } else {
      merged.files = [];
    }
    // `fileUrls` is canonical — never keep stale `unassignedFile` from existing (remove/replace revive).
    if (Object.prototype.hasOwnProperty.call(incoming, "unassignedFile")) {
      merged.unassignedFile = incoming.unassignedFile ?? null;
    } else {
      merged.unassignedFile = null;
    }
  } else if (existingUrls.length > 0) {
    merged.fileUrls = existingUrls;
  }

  const hasIncomingFiles = Object.prototype.hasOwnProperty.call(incoming, "files");
  if (
    !hasIncomingFileUrls &&
    (incoming.files === undefined || (Array.isArray(incoming.files) && incoming.files.length === 0)) &&
    Array.isArray(existing?.files) &&
    existing.files.length > 0
  ) {
    merged.files = existing.files;
  } else if (hasIncomingFiles && !hasIncomingFileUrls) {
    merged.files = incoming.files;
  }

  if (incoming.unassignedFile === undefined && existing?.unassignedFile != null && !hasIncomingFileUrls) {
    merged.unassignedFile = existing.unassignedFile;
  }
  return merged;
}

function isFirebaseStorageAttachmentPath(path: unknown): boolean {
  const s = String(path || "").trim();
  if (!s || isLocalFileRef(s) || isDriveFileRef(s)) return false;
  if (s.startsWith("companies/") || s.startsWith("voucher-files/") || s.startsWith("pocket-ledger/")) return true;
  return s.startsWith("http://") || s.startsWith("https://");
}

/**
 * Firestore offline error ke baad SQLite/outbox fallback — APK par sirf genuinely local-SQLite-first company (`storageOption: local`).
 * Capacitor + cloud Firebase: queue mat lagao taaki stale redirect race na ho; Electron/web purana `(local || static)` rule.
 */
async function allowLocalFirestoreFailureQueue(companyId: string): Promise<boolean> {
  if (isClientNavigatorOffline()) return true;
  if (await shouldUseLocalVoucherPipeline(companyId)) return true;
  if (await apkCloudCompanyUsesSqliteFirstWrites(companyId)) return true;
  return !isCapacitorNativeApp() && (isLocalOnlyMode() || isStaticAppBuild());
}

async function shouldUseLocalVoucherPipeline(companyId: string): Promise<boolean> {
  const cid = String(companyId || "").trim();
  if (!cid) return false;
  if (apkEmbeddedSqliteFirstWritesPreferred() || isClientNavigatorOffline()) return true;
  if (await apkCloudCompanyUsesSqliteFirstWrites(cid)) return true;
  try {
    const { isPlServerThinStaffCompany } = await import("@/lib/plServerThinStaffClient");
    if (await isPlServerThinStaffCompany(cid)) return true;
  } catch {
    /* continue */
  }
  const company = await getLocalCompanyById(cid, { includeDeleted: true }).catch(() => null);
  if (company) {
    try {
      const { isServerGateCompany } = await import("@/lib/companyStorageKind");
      if (isServerGateCompany(company)) return true;
    } catch {
      /* continue */
    }
    try {
      const { isLocalServerShareableCompany } = await import("@/lib/localServerShareableCompanies");
      if (isLocalServerShareableCompany(company)) return true;
    } catch {
      /* continue */
    }
  }
  // Online ticker helper returns true when ticks N/A — that must NOT force Firestore for local/PL.
  return !isOnlineCompanyLedgerCloudSyncAllowed(cid, company as Company | null);
}

/** Shared / mirror registry id → Firestore `companies/{id}` path (Storage upload + voucher write same id). */
async function firestoreCompanyDocExists(
  companyId: string,
  collectionName: string,
  docId: string
): Promise<boolean> {
  const fsCompanyId = await resolveAuthoritativeFirestoreCompanyId(companyId);
  const snap = await getDoc(doc(firestore, `companies/${fsCompanyId}/${collectionName}`, docId)).catch(() => null);
  return Boolean(snap?.exists());
}

/** Direct `addDoc`/`updateDoc` se pehle: `local:` refs → HTTPS (outbox-only path me `flushVoucherOutbox` pehle se karta tha). */
async function voucherPayloadHydrateLocalFilesForFirestore(
  fsCompanyId: string,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const cid = String(fsCompanyId || "").trim();
  if (!cid) return payload;
  return hydrateVoucherLocalAttachmentsForServer(cid, payload);
}

/**
 * Default policy par `local:` ho to `uploadBytes`/`getDownloadURL` yahan await mat karo — `setDoc`+`preGeneratedVoucherId` ya `updateDoc` ke baad `syncPendingFiles`.
 * Legacy `NEXT_PUBLIC_VOUCHER_ATTACHMENT_FIRESTORE_IMMEDIATE_UPLOAD=1` + online: purana inline hydrate.
 */
function shouldAwaitBlockingHydrateForFirestorePayload(payload: Record<string, unknown>): boolean {
  // Ledger SQLite-first builds: kabhi Storage inline hydrate await na karo (network/`navigator.onLine` glitch).
  if (apkEmbeddedSqliteFirstWritesPreferred()) return false;
  if (isClientNavigatorOffline()) return false;
  if (!voucherNewAttachmentsAlwaysStageAsLocalPending()) return true;
  return !recordContainsLocalPendingVoucherFileRef(removeUndefined(payload) as Record<string, unknown>);
}

/** Firestore pe `local:` likhne ke baad IndexedDB pending → Storage + doc patch — await taaki preview HTTPS URL mile. */
async function syncPendingAttachmentsAfterFirestoreWrite(wrotePayload: Record<string, unknown>): Promise<void> {
  if (!recordContainsLocalPendingVoucherFileRef(removeUndefined(wrotePayload) as Record<string, unknown>)) return;
  const urls = Array.isArray(wrotePayload.fileUrls) ? wrotePayload.fileUrls : [];
  logAttachmentPipeline("save", {
    step: "before_syncPendingFiles",
    fileUrlKinds: urls.map(classifyAttachmentRef),
    fileUrls: urls,
  });
  try {
    const result = await syncPendingFiles();
    logAttachmentPipeline("sync", { step: "after_syncPendingFiles", result });
  } catch (e) {
    console.warn("[voucherActionsClient] syncPendingFiles after Firestore write failed", e);
    logAttachmentPipeline("sync", { step: "syncPendingFiles_failed", error: String(e) });
  }
}

/** Party/master jaisa: stage ke baad `/__pl_attachment` race-budget, SQLite tip se pehle. */
const PL_SERVER_ATTACHMENT_FLUSH_BUDGET_MS = 20_000;

async function voucherHasUploadableLocalPendingAttachmentBytes(
  companyId: string,
  payload: Record<string, unknown>
): Promise<boolean> {
  const scanUrl = async (raw: unknown): Promise<boolean> => {
    if (typeof raw !== "string" || !isLocalFileRef(raw)) return false;
    const pending = await getPendingPayloadForLocalRef(raw);
    if (pending?.blob && pending.blob.size > 0) return true;
    const localId = raw.slice(LOCAL_FILE_PREFIX.length).trim();
    if (!localId) return false;
    const { isPlServerAttachmentUploadPending } = await import("@/lib/plServerAttachmentUploadQueue");
    return isPlServerAttachmentUploadPending(companyId, localId);
  };
  const urls = Array.isArray(payload.fileUrls) ? payload.fileUrls : [];
  for (const u of urls) {
    if (await scanUrl(u)) return true;
  }
  const uf = payload.unassignedFile;
  if (uf && typeof uf === "object" && uf !== null) {
    if (await scanUrl((uf as Record<string, unknown>).url)) return true;
  }
  return false;
}

async function listVoucherLocalPendingAttachmentIds(payload: Record<string, unknown>): Promise<string[]> {
  const { getVoucherAttachmentUrlsForUi } = await import("@/lib/voucherAttachmentNormalize");
  const seen = new Set<string>();
  for (const url of getVoucherAttachmentUrlsForUi(payload)) {
    if (!isLocalFileRef(url)) continue;
    const id = url.slice(LOCAL_FILE_PREFIX.length).trim();
    if (id) seen.add(id);
  }
  return [...seen];
}

/**
 * Party rule for vouchers: enqueue ke baad `/__pl_attachment` pehle, phir SQLite tip.
 */
export async function flushPlServerAttachmentsBeforeLocalSave(
  companyId: string,
  payload: Record<string, unknown>,
  options?: { awaitComplete?: boolean }
): Promise<void> {
  if (!recordContainsLocalPendingVoucherFileRef(payload)) return;
  const strict = options?.awaitComplete === true;
  try {
    const {
      shouldEnqueuePlServerAttachmentUpload,
      ensurePlServerAttachmentsQueuedFromRecord,
      flushPlServerAttachmentsAfterStagingBudgeted,
      flushPlServerAttachmentUploadQueueNow,
    } = await import("@/lib/plServerAttachmentUploadQueue");
    if (!(await shouldEnqueuePlServerAttachmentUpload(companyId))) {
      if (strict) throw new Error("attachment_upload_transport_unavailable");
      return;
    }
    await ensurePlServerAttachmentsQueuedFromRecord(companyId, payload);
    const localIds = await listVoucherLocalPendingAttachmentIds(payload);
    const hasBytes = await voucherHasUploadableLocalPendingAttachmentBytes(companyId, payload);
    if (!hasBytes) {
      return;
    }
    if (strict) {
      await flushPlServerAttachmentUploadQueueNow(companyId, { throwOnFailure: true, localIds });
      return;
    }
    await flushPlServerAttachmentsAfterStagingBudgeted(companyId, {
      localIds,
      budgetMs: PL_SERVER_ATTACHMENT_FLUSH_BUDGET_MS,
    });
  } catch (e) {
    if (strict) throw e;
    console.warn("[voucherActionsClient] pl server attachment flush best-effort failed", e);
  }
}

/**
 * Party order: bytes already flushed pre-upsert when possible; post-save soft flush + voucher tip.
 */
async function flushOrQueuePlServerVoucherAttachmentsAfterLocalSave(
  companyId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const voucherId = String(payload.id || "").trim();
  const hasLocalFiles = recordContainsLocalPendingVoucherFileRef(payload);

  const syncFilesThenVoucherToHost = async () => {
    if (hasLocalFiles) {
      try {
        await flushPlServerAttachmentsBeforeLocalSave(companyId, payload, { awaitComplete: false });
      } catch (e) {
        console.warn("[voucherActionsClient] pl server post-save attachment flush failed", e);
      }
    }
    if (!voucherId) return;
    try {
      const { maybeQueuePlServerDeltaAfterDocWrite } = await import("@/lib/plServerClientDeltaSync");
      await maybeQueuePlServerDeltaAfterDocWrite(companyId, "vouchers", voucherId, payload);
    } catch (e) {
      console.warn("[voucherActionsClient] pl server live voucher push failed", e);
    }
  };

  void syncFilesThenVoucherToHost()
    .then(() => {
      void import("@/lib/plServerAuthoritativeReplay").then((m) => {
        m.schedulePlServerAuthoritativeReplayDrain("post_save_live_sync");
      });
    })
    .catch((e) => {
      console.warn("[voucherActionsClient] pl server live post-save sync failed", e);
    });
}

async function hydrateLocalAttachmentsInPayloadIfOnline(
  companyId: string,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return payload;
  if (firestoreNetworkDisabledByApi) return payload;
  if (!recordContainsLocalPendingVoucherFileRef(payload)) return payload;
  try {
    const reg = await getLocalCompanyById(companyId);
    // EXE/APK device-local company: attachments `local:` + IndexedDB / LAN — save par Firebase mat upload karo.
    if (reg && (isServerGateCompany(reg) || (apkEmbeddedSqliteFirstWritesPreferred() && isDeviceLocalCompany(reg)))) {
      return payload;
    }
    if (reg && isOfflineCompanyStorage(reg as { storageOption?: string })) {
      if (!(await canSyncCompanyToServer(companyId))) return payload;
    }
  } catch {
    /* registry miss — niche hydrate try */
  }
  try {
    const fsCompanyId = await resolveAuthoritativeFirestoreCompanyId(companyId);
    const hydrated = await hydrateVoucherLocalAttachmentsForServer(fsCompanyId, payload);
    normalizeVoucherAttachmentFieldsForPersistence(hydrated, companyId);
    deleteUndefinedTopLevelFields(hydrated);
    return hydrated;
  } catch (e) {
    console.warn("[voucherActionsClient] inline attachment hydrate failed", e);
    return payload;
  }
}

function dispatchSavedVoucherAttachmentUrls(
  companyId: string,
  voucherId: string,
  payload: Record<string, unknown>
): void {
  // Empty `[]` bhi dispatch — warna remove-all ke baad useVouchers cache purani HTTPS URLs rakhta hai
  // aur form/ledger ~500ms baad file wapas dikha deta hai.
  if (!Object.prototype.hasOwnProperty.call(payload, "fileUrls")) return;
  const urls = Array.isArray(payload.fileUrls)
    ? payload.fileUrls.filter((u): u is string => typeof u === "string" && Boolean(String(u).trim()))
    : [];
  // `local:` pending — form `applyVoucherAttachmentsAfterFormSave` resolve ke baad dispatch karega (duplicate upload avoid).
  if (urls.some((u) => isLocalFileRef(u))) return;
  dispatchVoucherAttachmentSaved(companyId, voucherId, urls);
}

/** Firestore company root: `planExpiry` Timestamp ya `planExpiryMs` — tier overlay + cache ke saath expiry compare */
function planExpiryMsFromCompanyFirestoreData(row: Record<string, unknown>): number | null {
  const ms = row["planExpiryMs"];
  if (typeof ms === "number" && Number.isFinite(ms)) return ms;
  const pt = row["planExpiry"];
  if (pt != null && typeof pt === "object" && typeof (pt as Timestamp).toMillis === "function") {
    try {
      const m = (pt as Timestamp).toMillis();
      return Number.isFinite(m) ? m : null;
    } catch {
      return null;
    }
  }
  return null;
}

function removeUndefined(obj: any): any {
  // File/Blob SQLite/outbox JSON me nahi ja sakte — agar form se leak ho to strip karo (warn: BigInt JSON me throw karta hai).
  if (typeof obj === "bigint") return obj.toString();
  if (typeof File !== "undefined" && obj instanceof File) return undefined;
  if (typeof Blob !== "undefined" && obj instanceof Blob) return undefined;
  if (Array.isArray(obj)) return obj.map(removeUndefined).filter((v) => v !== undefined);
  if (obj !== null && typeof obj === "object") {
    if (obj instanceof Date || (obj && "toDate" in obj && typeof obj.toDate === "function")) return obj;
    return Object.keys(obj).reduce((acc: any, key) => {
      // SQLite mirror-only meta — Firestore document me kabhi persist mat karo
      if (key === LOCAL_MIRROR_META_SERVER_CONFIRMED_KEY) return acc;
      const value = removeUndefined(obj[key]);
      if (value !== undefined) acc[key] = value;
      return acc;
    }, {});
  }
  return obj;
}

/** `normalizeVoucherAttachmentFieldsForPersistence` kabhi `key: undefined` set kar deta hai — Firestore reject. */
function deleteUndefinedTopLevelFields(data: Record<string, unknown>): void {
  for (const key of Object.keys(data)) {
    if (data[key] === undefined) delete data[key];
  }
}

function normalizePersistableAttachmentUrl(raw: unknown): string | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return null;
  if (isTransientVoucherAttachmentUrl(s)) return null;
  if (!s.startsWith("PL_ATTACH_V1:")) return s;
  // Hold-clipboard marker should not be persisted; use decoded `src` so sync pipeline can process local/drive/http refs.
  const payload = parseAttachmentHoldClipboardText(s);
  const src = String(payload?.src || "").trim();
  return src || null;
}

function normalizeVoucherAttachmentFieldsForPersistence(
  data: Record<string, unknown>,
  companyId?: string | null
): void {
  const hasExplicitFileUrls = Object.prototype.hasOwnProperty.call(data, "fileUrls");
  const rawFileUrls = data.fileUrls;
  if (Array.isArray(rawFileUrls)) {
    const normalized: string[] = [];
    for (const entry of rawFileUrls) {
      const url = normalizePersistableAttachmentUrl(entry);
      if (url) normalized.push(url);
    }
    // Keep order stable but strip duplicates so repeated marker values do not inflate attachment arrays.
    let urls = normalized.filter((u, i) => normalized.indexOf(u) === i);
    if (companyId) {
      const policy = getCrossCompanyAttachmentAccessPolicy();
      urls = filterAttachmentsForCompanyContext(
        urls,
        companyId,
        policy.accessibleCompanyIds.size > 0 ? policy.accessibleCompanyIds : new Set([companyId])
      );
    }
    data.fileUrls = urls;
  } else if (typeof rawFileUrls === "string") {
    const one = normalizePersistableAttachmentUrl(rawFileUrls);
    data.fileUrls = one ? [one] : [];
  }

  if (hasExplicitFileUrls) {
    // Edit forms use `fileUrls` as the canonical attachment list. Null (not delete) so
    // SQLite merge overwrites stale `unassignedFile` instead of preserving it via spread.
    data.unassignedFile = null;
    if (!Object.prototype.hasOwnProperty.call(data, "files")) {
      data.files = [];
    }
  }

  const rawUf = data.unassignedFile;
  if (hasExplicitFileUrls) {
    data.unassignedFile = null;
  } else if (rawUf && typeof rawUf === "object") {
    const uf = { ...(rawUf as Record<string, unknown>) };
    const normalizedUrl = normalizePersistableAttachmentUrl(uf.url);
    // Invalid clipboard marker payload (`sid`-only etc.) should be dropped to avoid saving broken pseudo-URLs.
    if (normalizedUrl) uf.url = normalizedUrl;
    else delete uf.url;
    const cleaned = removeUndefined(uf) as Record<string, unknown>;
    if (Object.keys(cleaned).length > 0) data.unassignedFile = cleaned;
    else delete data.unassignedFile;
  } else if (rawUf == null) {
    delete data.unassignedFile;
  }
  if (companyId) {
    const filtered = filterVoucherAttachmentsForCompanyContext(data, companyId);
    data.fileUrls = filtered.fileUrls;
    if (hasExplicitFileUrls) {
      data.unassignedFile = null;
    } else {
      const filteredUf = filtered.unassignedFile;
      if (filteredUf != null && typeof filteredUf === "object") {
        data.unassignedFile = filteredUf;
      } else {
        delete data.unassignedFile;
      }
    }
  }
  deleteUndefinedTopLevelFields(data);
}

/** Date / Firestore Timestamp / ISO string → JS Date (update path me `new Date(ts)` galat Invalid Date deta tha) */
function toJsDateFromVoucherField(value: unknown): Date | null {
  // Reuse shared parser so `{ _seconds, _nanoseconds }` cached shapes also resolve instead of falling back to today.
  return parseFirestoreDateFieldToJsDate(value);
}

/** Har save par `app_settings/plans` read throttle — voucher create latency kam (Firestore round-trip reuse). */
const mergedPlanEntitlementsCache = new Map<PlanId, { entitlements: Entitlements; cachedAtMs: number }>();
const MERGED_PLAN_ENTITLEMENTS_TTL_MS = 90_000;

/** Admin `app_settings/plans` + default bundle — sirf entitlements (voucher limit checks). */
async function mergePlanEntitlementsForId(planId: PlanId): Promise<Entitlements> {
  const now = Date.now();
  const hit = mergedPlanEntitlementsCache.get(planId);
  if (hit && now - hit.cachedAtMs < MERGED_PLAN_ENTITLEMENTS_TTL_MS) return hit.entitlements;

  // Static/APK/EXE + PL local pipelines: bundled `plans` — `app_settings/plans` Firestore hang mat.
  if (apkEmbeddedSqliteFirstWritesPreferred() || isElectronDesktopApp() || isStaticAppBuild() || isCapacitorNativeApp()) {
    const rec = readCachedPlansRecord() ?? defaultPlansRecordFallback();
    const merged = getPlanFromPlans(rec, planId).entitlements;
    mergedPlanEntitlementsCache.set(planId, { entitlements: merged, cachedAtMs: now });
    return merged;
  }

  const defaultPlan = getPlan(planId);
  let merged: Entitlements = defaultPlan.entitlements;
  try {
    const plansSnap = await getDoc(doc(firestore, "app_settings", "plans"));
    if (plansSnap.exists()) {
      const plansData = plansSnap.data();
      const fromFs = plansData[planId] as { entitlements?: Partial<Entitlements> } | undefined;
      if (fromFs && typeof fromFs === "object") {
        merged = { ...defaultPlan.entitlements, ...(fromFs.entitlements || {}) };
        mergedPlanEntitlementsCache.set(planId, { entitlements: merged, cachedAtMs: now });
        return merged;
      }
      mergedPlanEntitlementsCache.set(planId, { entitlements: merged, cachedAtMs: now });
      return merged;
    }
  } catch {
    /* Firestore fail → niche cached catalog */
  }
  const rec = readCachedPlansRecord() ?? defaultPlansRecordFallback();
  merged = getPlanFromPlans(rec, planId).entitlements;
  mergedPlanEntitlementsCache.set(planId, { entitlements: merged, cachedAtMs: now });
  return merged;
}

/** APK/static save: daily/month cap — `normalizeLocalCompany` jaisa planId (SQLite + `writeCompanyPlanLocalCache`) phir merged entitlements */
async function resolveLocalPlanForImmediateVoucherSave(
  companyId: string
): Promise<{ planId: PlanId; storageOption?: string; entitlements: Entitlements }> {
  let storageOption: string | undefined;
  let sqliteRow: { planId?: string | null; planExpiryMs?: unknown } | null = null;
  try {
    const loc = await getLocalCompanyById(companyId);
    if (loc) {
      // LocalCompanyDoc = index signature + fixed keys — TS ko `sqliteRow` narrow type overlap nahi dikhta; fields alag uthao
      const row = loc as { planId?: string | null; planExpiryMs?: unknown };
      sqliteRow = { planId: row.planId, planExpiryMs: row.planExpiryMs };
      storageOption = (loc as { storageOption?: string }).storageOption ?? storageOption;
    }
  } catch {
    /* local registry optional; defaults below keep save path non-blocking */
  }
  const planId = resolvePlanIdForVoucherEnforcement(companyId, sqliteRow, null);
  const entitlements = await mergePlanEntitlementsForId(planId);
  return { planId, storageOption, entitlements };
}

/** Coerce Timestamp / Date / ms / ISO — quota window ke liye. */
function coerceVoucherInstant(raw: unknown): Date | null {
  if (raw instanceof Timestamp) return raw.toDate();
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof raw === "string" && raw.trim()) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (raw && typeof raw === "object" && "toDate" in raw && typeof (raw as { toDate?: () => Date }).toDate === "function") {
    try {
      const d = (raw as { toDate: () => Date }).toDate();
      return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
    } catch {
      return null;
    }
  }
  if (raw && typeof raw === "object" && "seconds" in raw) {
    const sec = Number((raw as { seconds?: unknown }).seconds);
    if (Number.isFinite(sec)) {
      const d = new Date(sec * 1000);
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }
  return null;
}

/**
 * Plan quota: kitne vouchers **aaj / is mahine create** hue (createdAt).
 * Voucher calendar `date` (past/future) se nahi — warna future-date save daily cap bypass karti.
 * Legacy rows bina createdAt: `date` fallback.
 */
function countLocalMirrorVouchersInRange(
  vouchers: Array<Record<string, unknown>>,
  start: Date,
  end: Date
): number {
  return vouchers.filter((v) => {
    const dt = coerceVoucherInstant(v.createdAt) ?? coerceVoucherInstant(v.date);
    if (!dt) return false;
    return dt >= start && dt <= end;
  }).length;
}

/**
 * Naya voucher: din/mahine cap — SQLite mirror (`forBackupMerge`) se ginti pehle, taaki roz Firestore query na ho.
 * Pure cloud company + SQLite khali ⇒ purana Firestore range query fallback (truth server-side).
 */
async function enforceDailyMonthlyVoucherQuotaForCreate(
  companyId: string,
  dailyLimit: number,
  monthlyLimit: number,
  storageOptionIsLocal: boolean
): Promise<void> {
  if (dailyLimit <= 0 && monthlyLimit <= 0) return;
  const now = new Date();
  const collPath = `companies/${companyId}/vouchers`;
  // `forBackupMerge`: local-first + APK + cloud user jiske paas restore/prefetch cache ho — bina iske web online par rows [] rehti hain.
  const mirrorRows = await listCompanyDocsFromBrowserDb(companyId, "vouchers", { forBackupMerge: true });
  const countFromSqlite =
    isLocalOnlyMode() || storageOptionIsLocal || mirrorRows.length > 0;

  if (countFromSqlite) {
    if (dailyLimit > 0) {
      const n = countLocalMirrorVouchersInRange(mirrorRows, startOfDay(now), endOfDay(now));
      if (n >= dailyLimit) {
        const err = new Error(
          `Daily voucher limit reached (${dailyLimit}). Upgrade your plan for more.`
        ) as Error & { isVoucherLimit?: boolean };
        err.isVoucherLimit = true;
        throw err;
      }
    }
    if (monthlyLimit > 0) {
      const n = countLocalMirrorVouchersInRange(mirrorRows, startOfMonth(now), endOfMonth(now));
      if (n >= monthlyLimit) {
        const err = new Error(
          `Monthly voucher limit reached (${monthlyLimit}). Upgrade your plan for more.`
        ) as Error & { isVoucherLimit?: boolean };
        err.isVoucherLimit = true;
        throw err;
      }
    }
    return;
  }

  if (dailyLimit > 0) {
    const todayStart = Timestamp.fromDate(startOfDay(now));
    const todayEnd = Timestamp.fromDate(endOfDay(now));
    const dailySnap = await getDocs(
      query(collection(firestore, collPath), where("createdAt", ">=", todayStart), where("createdAt", "<=", todayEnd))
    );
    if (dailySnap.size >= dailyLimit) {
      const err = new Error(
        `Daily voucher limit reached (${dailyLimit}). Upgrade your plan for more.`
      ) as Error & { isVoucherLimit?: boolean };
      err.isVoucherLimit = true;
      throw err;
    }
  }
  if (monthlyLimit > 0) {
    const monthStart = Timestamp.fromDate(startOfMonth(now));
    const monthEnd = Timestamp.fromDate(endOfMonth(now));
    const monthlySnap = await getDocs(
      query(collection(firestore, collPath), where("createdAt", ">=", monthStart), where("createdAt", "<=", monthEnd))
    );
    if (monthlySnap.size >= monthlyLimit) {
      const err = new Error(
        `Monthly voucher limit reached (${monthlyLimit}). Upgrade your plan for more.`
      ) as Error & { isVoucherLimit?: boolean };
      err.isVoucherLimit = true;
      throw err;
    }
  }
}

/** Firestore pe voucher doc missing (sirf SQLite mirror) — `setDoc` merge se server row banao / update karo. */
async function setFirestoreVoucherFromLocalMirrorWhenMissing(
  companyId: string,
  voucherId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const fsCompanyId = await resolveAuthoritativeFirestoreCompanyId(companyId);
  const awaitHydrate = shouldAwaitBlockingHydrateForFirestorePayload(payload);
  const payloadForFs = awaitHydrate
    ? await voucherPayloadHydrateLocalFilesForFirestore(fsCompanyId, payload)
    : (removeUndefined(payload) as Record<string, unknown>);
  await setDoc(doc(firestore, `companies/${fsCompanyId}/vouchers`, voucherId), payloadForFs, { merge: true });
  if (!awaitHydrate) {
    await syncPendingAttachmentsAfterFirestoreWrite(payload);
  }
  try {
    await removeOutboxRowsForCompanyDoc(companyId, "vouchers", voucherId);
  } catch {
    /* optional */
  }
  await mirrorVoucherDocToBrowserDb(companyId, voucherId);
}

/** Hybrid firebase-company vouchers: patch tail `updateDoc` fail (offline/static) → full row SQLite + voucher outbox. */
async function upsertLocalVoucherFromPartialForOutbox(
  companyId: string,
  voucherId: string,
  partial: Record<string, unknown>
): Promise<void> {
  const existingRaw = await getCompanyDocFromBrowserDb(companyId, "vouchers", voucherId).catch(() => null);
  const existing = ((existingRaw as Record<string, unknown> | null) || {}) as Record<string, unknown>;
  const payload = removeUndefined({
    ...existing,
    ...partial,
    id: voucherId,
    updatedAt: Timestamp.now(),
    lastEditedAt: Timestamp.now(),
  }) as Record<string, unknown>;
  coerceVoucherDocumentDate(payload);
  await upsertCompanyDocInBrowserDb(companyId, "vouchers", voucherId, payload);
  await enqueueVoucherOutbox(companyId, "update", voucherId, payload);
}

export async function patchVoucherFields(
  companyId: string,
  voucherId: string,
  partial: Record<string, unknown>,
  options?: { forceSqliteFirst?: boolean }
): Promise<void> {
  if (!companyId || !voucherId) throw new Error("Missing companyId or voucherId");
  // Online `updateDoc` branch SQLite se pehle gate nahi chhu sakta — yahan ek hi entry se dono paths cover.
  await assertCompanyAllowsLedgerMutations(companyId);
  // APK / static mobile: SQLite+outbox ke beech pathname race — `/dashboard` jump se pehle URL + company pin.
  beginApkLedgerAsyncWriteShield({ pinCompanyId: companyId });
  if (isSoftDeleteLedgerPatch(partial)) {
    const localRow = await getCompanyDocFromBrowserDb(companyId, "vouchers", voucherId).catch(() => null);
    const onServer = await firestoreCompanyDocExists(companyId, "vouchers", voucherId);
    if (!localRow && !onServer) return;
  }
  const sqliteFirst =
    options?.forceSqliteFirst === true || (await shouldUseLocalVoucherPipeline(companyId));
  let patchEditAttachmentCtx: { baselineUrls: string[]; remoteUrls: string[] } | null = null;
  if (Object.prototype.hasOwnProperty.call(partial, "fileUrls")) {
    patchEditAttachmentCtx = await readVoucherEditAttachmentContext(companyId, voucherId);
  }
  const schedulePatchAttachmentCleanup = (finalPayload: Record<string, unknown>): void => {
    if (!patchEditAttachmentCtx) return;
    finalizeFormAttachmentEditAfterSave({
      companyId,
      entityId: voucherId,
      voucherType: String(finalPayload.type || "").trim() || undefined,
      baselineUrls: patchEditAttachmentCtx.baselineUrls,
      finalUrls: normalizeFileUrlsField(finalPayload.fileUrls),
      oldDocRemoteUrls: patchEditAttachmentCtx.remoteUrls,
    });
  };
  if (sqliteFirst) {
    // Local-first: SQLite turant; online mirror company ke liye Firestore bhi seedha — warna outbox/JSON se delete server pe late/miss, refresh pe voucher wapas.
    const existing = (await getCompanyDocFromBrowserDb(companyId, "vouchers", voucherId)) || {};
    const payload = removeUndefined({
      ...(existing as Record<string, unknown>),
      ...partial,
      id: voucherId,
      updatedAt: Timestamp.now(),
      lastEditedAt: Timestamp.now(),
    }) as Record<string, unknown>;
    coerceVoucherDocumentDate(payload);
    await upsertCompanyDocInBrowserDb(companyId, "vouchers", voucherId, payload);
    schedulePatchAttachmentCleanup(payload);
    if (isSoftDeleteLedgerPatch(partial)) {
      try {
        const { cancelDriveAttachmentSideEffectsForDoc } = await import(
          "@/lib/localCloudSync/driveAttachmentSaveSideEffects"
        );
        cancelDriveAttachmentSideEffectsForDoc(companyId, "vouchers", voucherId);
      } catch {
        /* optional */
      }
      const { scheduleBrowserDbPersistAfterWrite, flushPendingBrowserDbSave } = await import("@/lib/localSqlite");
      scheduleBrowserDbPersistAfterWrite();
      await flushPendingBrowserDbSave().catch(() => undefined);
    }
    await flushOrQueuePlServerVoucherAttachmentsAfterLocalSave(companyId, payload);

    // Ledger Firebase sync off — SQLite tombstone kaafi; Firestore/outbox mat chalao.
    if (isFirebaseLedgerDataSyncDisabled() || !isFirebaseLedgerCompanyDataSyncEnabled(companyId)) {
      await enqueueVoucherOutbox(companyId, "update", voucherId, payload);
      return;
    }

    const reg = await getLocalCompanyById(companyId, { includeDeleted: true });
    const canSync = await canSyncCompanyToServer(companyId);
    const encFlag = Boolean(reg && (reg as Record<string, unknown>).encryptServerBackup === true);

    if (canSync && !encFlag) {
      // APK/static + "Server writes" OFF, ya device offline: Storage hydrate await na — outbox + baad mein `flushVoucherOutbox`.
      if (apkEmbeddedSqliteFirstWritesPreferred() || isClientNavigatorOffline()) {
        await enqueueVoucherOutbox(companyId, "update", voucherId, payload);
        // `enqueueVoucherOutbox` → awaited flush (static/APK vouchers) — yahan dubara `void flush` mat
        return;
      }
      const fsCompanyId =
        String((reg as Record<string, unknown> | null)?.authoritativeCompanyId || companyId).trim() || companyId;
      // Firestore path: authoritative id (shared / mirror company) — same as updateDoc branch below.
      const voucherFsRef = doc(firestore, `companies/${fsCompanyId}/vouchers`, voucherId);
      try {
        const awaitHydratePartial = shouldAwaitBlockingHydrateForFirestorePayload(partial as Record<string, unknown>);
        const partialForFs = awaitHydratePartial
          ? await voucherPayloadHydrateLocalFilesForFirestore(fsCompanyId, { ...partial })
          : ({ ...partial } as Record<string, unknown>);
        await updateDoc(voucherFsRef, partialForFs);
        if (!awaitHydratePartial) {
          await syncPendingAttachmentsAfterFirestoreWrite(partial as Record<string, unknown>);
        }
        await removeOutboxRowsForCompanyDoc(companyId, "vouchers", voucherId);
        await mirrorVoucherDocToBrowserDb(companyId, voucherId);
        return;
      } catch (e) {
        if (isLikelyOfflineFirestoreError(e)) {
          await enqueueVoucherOutbox(companyId, "update", voucherId, payload);
          return;
        }
        // Naya voucher abhi sirf SQLite + create-outbox pe ho sakta hai; server pe doc nahi → updateDoc "No document to update".
        // setDoc merge se poora local payload likho, warna SalaryForm ka syncSalaryBillWiseLinks throw karke Save success UI / dialog band nahi hota.
        if (isCompanyNotFoundError(e)) {
          if (isSoftDeleteLedgerPatch(partial)) {
            return;
          }
          try {
            const awaitHydrateFull = shouldAwaitBlockingHydrateForFirestorePayload(payload);
            const payloadForFs = awaitHydrateFull
              ? await voucherPayloadHydrateLocalFilesForFirestore(fsCompanyId, payload)
              : (removeUndefined(payload) as Record<string, unknown>);
            await setDoc(voucherFsRef, payloadForFs, { merge: true });
            if (!awaitHydrateFull) {
              await syncPendingAttachmentsAfterFirestoreWrite(payload);
            }
            await removeOutboxRowsForCompanyDoc(companyId, "vouchers", voucherId);
            await mirrorVoucherDocToBrowserDb(companyId, voucherId);
            return;
          } catch (e2) {
            if (isLikelyOfflineFirestoreError(e2)) {
              await enqueueVoucherOutbox(companyId, "update", voucherId, payload);
              return;
            }
            throw e2;
          }
        }
        throw e;
      }
    }

    if (canSync && encFlag) {
      await enqueueVoucherOutbox(companyId, "update", voucherId, payload);
      // Encrypted outbox: turant return — `flushVoucherOutbox` background (local save success network pe depend na kare).
      void flushVoucherOutbox().catch((e) => {
        console.warn("[patchVoucherFields] background flush after enc outbox enqueue failed", e);
      });
      return;
    }

    await enqueueVoucherOutbox(companyId, "update", voucherId, payload);
    return;
  }
  try {
    const fsPatchId = await resolveAuthoritativeFirestoreCompanyId(companyId);
    const awaitHydratePatch = shouldAwaitBlockingHydrateForFirestorePayload(partial as Record<string, unknown>);
    const partialHydrated = awaitHydratePatch
      ? await voucherPayloadHydrateLocalFilesForFirestore(fsPatchId, { ...partial })
      : ({ ...partial } as Record<string, unknown>);
    await updateDoc(doc(firestore, `companies/${fsPatchId}/vouchers`, voucherId), partialHydrated);
    if (!awaitHydratePatch) {
      await syncPendingAttachmentsAfterFirestoreWrite(partial as Record<string, unknown>);
    }
    schedulePatchAttachmentCleanup(partial as Record<string, unknown>);
  } catch (e) {
    if (isCompanyNotFoundError(e)) {
      if (isSoftDeleteLedgerPatch(partial)) {
        return;
      }
      const existingRaw = await getCompanyDocFromBrowserDb(companyId, "vouchers", voucherId).catch(() => null);
      const existing = ((existingRaw as Record<string, unknown> | null) || {}) as Record<string, unknown>;
      const fullPayload = removeUndefined({
        ...existing,
        ...partial,
        id: voucherId,
        updatedAt: Timestamp.now(),
        lastEditedAt: Timestamp.now(),
      }) as Record<string, unknown>;
      coerceVoucherDocumentDate(fullPayload);
      await setFirestoreVoucherFromLocalMirrorWhenMissing(companyId, voucherId, fullPayload);
      schedulePatchAttachmentCleanup(fullPayload);
      return;
    }
    if (!isLikelyOfflineFirestoreError(e)) throw e;
    if (!(await allowLocalFirestoreFailureQueue(companyId))) throw e;
    await upsertLocalVoucherFromPartialForOutbox(companyId, voucherId, partial);
    return;
  }
  await mirrorVoucherDocToBrowserDb(companyId, voucherId);
}

/**
 * Sync‑2 tombstone timestamps: APK/local SQLite/outbox ko `serverTimestamp()` sentinel kabhi naive spread se mat lagao —
 * **`patchVoucherFields`** local branch JSON-safe `Timestamp.now()` rakhe.
 */
export function voucherRecycleBinDeletedAt(): InstanceType<typeof Timestamp> | ReturnType<typeof serverTimestamp> {
  return isLocalOnlyMode() ? Timestamp.now() : serverTimestamp();
}

/**
 * Recycler soft-delete ek hi jagah — static APK offline outbox aur online `updateDoc` dono **`patch`** se align.
 */
export async function softDeleteVoucherMoveToRecycleBin(
  companyId: string,
  voucherId: string,
  deletedByUid: string,
  options?: { forceSqliteFirst?: boolean }
): Promise<void> {
  const reg = await getLocalCompanyById(companyId, { includeDeleted: true });
  const fsCompanyId = String((reg as { authoritativeCompanyId?: string } | null)?.authoritativeCompanyId || companyId).trim();
  const sqliteFirst =
    options?.forceSqliteFirst === true ||
    (await shouldUseLocalVoucherPipeline(companyId)) ||
    Boolean(reg && isServerGateCompany(reg));
  const deletedAt = sqliteFirst ? Timestamp.now() : voucherRecycleBinDeletedAt();
  voucherDeleteDebugLog("soft_delete_start", {
    companyId,
    fsCompanyId,
    voucherId,
    deletedByUid: deletedByUid || "",
    hasRegistryRow: Boolean(reg),
    registryStorageOption: String((reg as { storageOption?: unknown } | null)?.storageOption ?? ""),
    registryPlServerShared: (reg as { plServerShared?: unknown } | null)?.plServerShared === true,
    registryIsServerGate: Boolean(reg && isServerGateCompany(reg)),
    deletedAtKind: deletedAt instanceof Timestamp ? "timestamp_now" : "server_timestamp",
  });
  let voucherNumber = "";
  let voucherType = "";
  try {
    const vSnap = await getDoc(doc(firestore, `companies/${fsCompanyId}/vouchers`, voucherId));
    if (vSnap.exists()) {
      const v = vSnap.data() as Record<string, unknown>;
      voucherNumber = String(v.voucherNumber ?? "");
      voucherType = String(v.type ?? "");
    }
  } catch {
    /* alert optional */
  }
  try {
    await patchVoucherFields(
      companyId,
      voucherId,
      {
        isDeleted: true,
        deletedAt,
        deletedBy: deletedByUid || "",
      },
      { forceSqliteFirst: options?.forceSqliteFirst }
    );
  } catch (e) {
    voucherDeleteDebugLog("soft_delete_patch_error", {
      companyId,
      fsCompanyId,
      voucherId,
      error:
        e && typeof e === "object"
          ? {
              name: (e as { name?: unknown }).name,
              code: (e as { code?: unknown }).code,
              message: (e as { message?: unknown }).message,
            }
          : { message: String(e ?? "") },
    });
    throw e;
  }
  voucherDeleteDebugLog("soft_delete_patch_done", {
    companyId,
    fsCompanyId,
    voucherId,
    voucherNumber,
    voucherType,
  });
  // Last auto recycle → template `lastGenerated*` clear; dashboard card + strip dubara accrue karein
  void reconcileRecurringTemplateAfterAutoVoucherRecycle(fsCompanyId, voucherId).catch((e) => {
    console.warn("[softDeleteVoucher] recurring template reconcile failed", e);
  });
  const u = auth.currentUser;
  void sendRecycleBinMovedAlert(fsCompanyId, (reg as Company) ?? null, {
    entityKind: "voucher",
    entityId: voucherId,
    entityName: voucherNumber || voucherId,
    collectionPath: "vouchers",
    voucherNumber: voucherNumber || undefined,
    voucherType: voucherType || undefined,
    performedByUserId: deletedByUid || u?.uid,
    performedByEmail: u?.email ?? undefined,
    performedByName: u?.displayName ?? undefined,
  });
}

function getChanges(oldData: any, newData: any): Record<string, { from: any; to: any }> {
  const changes: Record<string, { from: any; to: any }> = {};
  const ignoredFields = [
    "history", "createdAt", "updatedAt", "id", "isDeleted",
    "deletedAt", "balance", "credit", "debit",
    "lastEditedByUserName", "lastEditedAt", // added as separate history rows with Old/New
    // Sirf browser SQLite mirror — Firestore pe nahi; history me mat dikhao.
    LOCAL_MIRROR_META_SERVER_CONFIRMED_KEY,
    PL_CLIENT_OFFLINE_FIRST_PERSIST_MS,
  ];
  const keys = new Set([...Object.keys(oldData || {}), ...Object.keys(newData || {})]);
  keys.forEach((key) => {
    if (ignoredFields.includes(key)) return;
    let oldVal = oldData?.[key];
    let newVal = newData?.[key];
    // Journal save payload me `total` hota hai (`CreateJournalForm`), `amount` purane/mirror doc me ho sakta — bina iske "New: N/A" dikhta.
    if (
      key === "amount" &&
      String(newData?.type || "").toLowerCase() === "journal" &&
      (newVal === undefined || newVal === null) &&
      newData != null &&
      newData.total !== undefined &&
      newData.total !== null
    ) {
      const tn = Number(newData.total);
      if (Number.isFinite(tn)) newVal = tn;
    }
    if (
      (oldVal instanceof Date || (oldVal?.toDate instanceof Function)) &&
      (newVal instanceof Date || (newVal?.toDate instanceof Function))
    ) {
      // Timestamp: `new Date(ts)` Invalid Date; form kabhi Invalid Date bhej deta — `toISOString` se RangeError na aaye (convert-save).
      const oldD = toJsDateFromVoucherField(oldVal);
      const newD = toJsDateFromVoucherField(newVal);
      const oldIso = oldD ? oldD.toISOString() : "";
      const newIso = newD ? newD.toISOString() : "";
      if (oldIso !== newIso) changes[key] = { from: oldData?.[key] ?? null, to: newData?.[key] ?? null };
    } else if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes[key] = { from: oldVal ?? null, to: newData?.[key] ?? null };
    }
  });
  return changes;
}

/** Create-time history: inter_company ke liye alag rows; baaki vouchers generic `created` + lastEdited. */
function buildInitialCreateHistoryChanges(args: {
  voucherData: Record<string, unknown>;
  userId: string;
  creatorDisplayName: string | null;
  creatorEmail: string | null;
  now: Date;
  interCompanyCreateHistory?: InterCompanyCreateHistoryInput | null;
}): Record<string, { from: unknown; to: unknown }> {
  const isIc =
    String(args.voucherData?.type || "").toLowerCase() === "inter_company" &&
    args.interCompanyCreateHistory != null;
  if (isIc && args.interCompanyCreateHistory) {
    return buildInterCompanyCreateHistoryChanges(args.interCompanyCreateHistory);
  }
  return {
    created: { from: "N/A", to: "Created" },
    lastEditedByUserName: { from: "N/A", to: args.creatorDisplayName || args.userId },
    lastEditedAt: { from: null, to: args.now },
  };
}

/**
 * Client-only: Balance opening balance with Capital. Runs in browser so Firestore uses signed-in user auth.
 */
export async function balanceOpeningBalanceWithCapital(
  companyId: string,
  accountCollection: "parties" | "bank_accounts" | "staff" | "taxes" | "expense_accounts",
  accountId: string,
  oldOpeningBalance: number,
  newOpeningBalance: number
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!companyId) throw new Error("Company ID is missing");
    // OB↔capital adjust master write — APK par SQLite/Firestore ke beech wahi pathname/company glitch possible
    beginApkLedgerAsyncWriteShield({ pinCompanyId: companyId });
    const difference = newOpeningBalance - oldOpeningBalance;
    if (Math.abs(difference) < 0.01) return { success: true };

    let currentCapitalOB = 0;

    // APK/static/EXE/server-delta: OB ledger bhi SQLite-first. Firestore getDoc yahan foreground save ko atka sakta hai.
    if (await shouldUseLocalVoucherPipeline(companyId)) {
      const reg = await getLocalCompanyById(companyId);
      let ownerId = String((reg as Record<string, unknown>)?.ownerId ?? "").trim();
      if (!ownerId) {
        ownerId = auth.currentUser?.uid || "local_guest_user";
      }
      const capitalOpeningBalanceDoc = await getCompanyDocFromBrowserDb(
        companyId,
        "parties",
        "opening_balance_ledger",
        { includeDeleted: true }
      );
      if (!capitalOpeningBalanceDoc) {
        const createdAt = Date.now();
        const createRes = await writeEntity({
          companyId,
          collectionName: "parties",
          docId: "opening_balance_ledger",
          operation: "create",
          data: {
            name: "Opening Balance",
            groupId: "equity",
            openingBalance: 0,
            openingBalanceDate: null,
            companyId,
            ownerId,
            isDeleted: false,
            isSystemReserved: true,
            isSystemAccount: true,
            createdAt,
            balance: 0,
            debit: 0,
            credit: 0,
          },
        });
        if (createRes.ok === false) return { success: false, error: createRes.error };
        currentCapitalOB = 0;
      } else {
        currentCapitalOB = Number(capitalOpeningBalanceDoc.openingBalance) || 0;
      }
      const newCapitalOB = currentCapitalOB - difference;
      const capitalDebit = newCapitalOB > 0 ? newCapitalOB : 0;
      const capitalCredit = newCapitalOB < 0 ? Math.abs(newCapitalOB) : 0;
      const updRes = await writeEntity({
        companyId,
        collectionName: "parties",
        docId: "opening_balance_ledger",
        operation: "update",
        data: {
          openingBalance: newCapitalOB,
          balance: newCapitalOB,
          debit: capitalDebit,
          credit: capitalCredit,
        },
      });
      if (updRes.ok === false) return { success: false, error: updRes.error };
      return { success: true };
    }

    const capitalOpeningBalanceRef = doc(firestore, `companies/${companyId}/parties`, "opening_balance_ledger");
    const capitalOpeningBalanceSnap = await getDoc(capitalOpeningBalanceRef);

    if (!capitalOpeningBalanceSnap.exists()) {
      const companySnap = await getDoc(doc(firestore, "companies", companyId));
      await setDoc(capitalOpeningBalanceRef, {
        name: "Opening Balance",
        groupId: "equity",
        openingBalance: 0,
        openingBalanceDate: null,
        companyId,
        ownerId: companySnap.data()?.ownerId || "",
        isDeleted: false,
        isSystemReserved: true,
        isSystemAccount: true,
        createdAt: serverTimestamp(),
        balance: 0,
        debit: 0,
        credit: 0,
      });
      currentCapitalOB = 0;
    } else {
      currentCapitalOB = capitalOpeningBalanceSnap.data()?.openingBalance || 0;
    }

    const newCapitalOB = currentCapitalOB - difference;
    const capitalDebit = newCapitalOB > 0 ? newCapitalOB : 0;
    const capitalCredit = newCapitalOB < 0 ? Math.abs(newCapitalOB) : 0;

    await updateDoc(capitalOpeningBalanceRef, {
      openingBalance: newCapitalOB,
      balance: newCapitalOB,
      debit: capitalDebit,
      credit: capitalCredit,
    });
    return { success: true };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Error balancing opening balance with capital:", error);
    return { success: false, error: msg };
  }
}

/** Use in catch blocks: if true, show error.message and "Upgrade" action to /billing */
export function isVoucherLimitError(error: unknown): error is Error & { isVoucherLimit: true } {
  return Boolean(error && typeof error === "object" && (error as any).isVoucherLimit);
}

/**
 * Static + offline: naya voucher local SQLite + outbox (Firestore baad mein flush).
 * Daily/monthly caps: `dailyVoucherLimitLocal` / `monthlyVoucherLimitLocal` jab company local storage ho.
 */
async function saveVoucherOfflineLocalCreate(
  companyId: string,
  userId: string,
  cleanVoucherData: any,
  voucherPath: string,
  /** Forms ne pehle se `local:` file refs + IndexedDB ke liye id banai ho to wahi use karo */
  preGeneratedVoucherId?: string | null,
  approveAfterSave?: SaveVoucherApproveOption,
  options?: SaveVoucherOptions
): Promise<{ id: string }> {
  const { storageOption, entitlements: mergedEnt } = await resolveLocalPlanForImmediateVoucherSave(companyId);
  const useLocalLim = companyStorageIsLocal(storageOption);
  const dailyLimitOff = numericEntitlement(mergedEnt, "dailyVoucherLimit", useLocalLim);
  const monthlyLimitOff = numericEntitlement(mergedEnt, "monthlyVoucherLimit", useLocalLim);
  // Offline create: SQLite `forBackupMerge` list + shared helper — server query tab hi jab mirror bilkul khali aur pure-cloud ho.
  await enforceDailyMonthlyVoucherQuotaForCreate(companyId, dailyLimitOff, monthlyLimitOff, useLocalLim);
  // Local-first mode me ID generation Firestore dependent nahi hona chahiye.
  const trimmed = preGeneratedVoucherId && String(preGeneratedVoucherId).trim();
  const newId = trimmed || generateLocalVoucherIdForCreate();
  const authUser = auth.currentUser;
  const creatorDisplayName =
    options?.actorDisplayNameOverride ||
    authUser?.displayName ||
    authUser?.email?.split("@")?.[0] ||
    cleanVoucherData.userDisplayName ||
    null;
  const creatorEmail = authUser?.email || cleanVoucherData.userEmail || null;
  let historyEnabled = false;
  try {
    const { enabled } = await getEffectiveHistorySettings(companyId);
    historyEnabled = enabled;
  } catch {
    historyEnabled = false;
  }
  // History snapshot: readable `Date` for change log (`nowTs` Firebase server-style alag field).
  const now = new Date();
  const nowTs = Timestamp.now();
  const initialHistory = historyEnabled
    ? [
        {
          changedAt: nowTs,
          changedBy: userId,
          changes: buildInitialCreateHistoryChanges({
            voucherData: cleanVoucherData as Record<string, unknown>,
            userId,
            creatorDisplayName,
            creatorEmail,
            now,
            interCompanyCreateHistory: options?.interCompanyCreateHistory ?? null,
          }),
        },
      ]
    : [];
  const bodyRaw = {
    ...cleanVoucherData,
    companyId,
    userId,
    isApproved: options?.forceUnapprovedCreate ? false : (approveAfterSave ? true : cleanVoucherData.isApproved === true),
    ...(approveAfterSave
      ? {
          approvedByUserId: approveAfterSave.approvedByUserId,
          approvedByUserName: approveAfterSave.approvedByName ?? approveAfterSave.approvedByUserId,
          approvedAt: nowTs,
        }
      : {}),
    // Auto-generated path: explicit display name preserve karo.
    userDisplayName: options?.userDisplayNameOverride ?? creatorDisplayName,
    userEmail: creatorEmail,
    lastEditedByUserName: creatorDisplayName || userId,
    lastEditedAt: nowTs,
    createdAt: nowTs,
    history: initialHistory,
  };
  const body = removeUndefined(bodyRaw) as Record<string, unknown>;
  coerceVoucherDocumentDate(body);
  // Sync‑3: device lineage debug / future merge tuning — Firebase flush me strip (`localVoucherOutbox`)
  body[PL_CLIENT_OFFLINE_FIRST_PERSIST_MS] = Date.now();
  const payload = { id: newId, ...body };
  // Party rule: `/__pl_attachment` pehle, phir SQLite voucher tip.
  await flushPlServerAttachmentsBeforeLocalSave(companyId, payload, { awaitComplete: false });
  await upsertCompanyDocInBrowserDb(companyId, "vouchers", newId, payload);
  scheduleBrowserDbPersistAfterWrite();
  void flushOrQueuePlServerVoucherAttachmentsAfterLocalSave(companyId, payload);
  await enqueueVoucherOutbox(companyId, "create", newId, payload);
  scheduleBrowserDbPersistAfterWrite();
  dispatchSavedVoucherAttachmentUrls(companyId, newId, payload);
  return { id: newId };
}

/**
 * SQLite `company_docs` voucher row aur us row ka canonical `company_id` (UPSERT/outbox same key ho).
 * Registry id vs authoritative Firestore id mismatch par approve/update miss hota tha ("Voucher not found").
 */
async function resolveVoucherSnapshotForLocalWrite(
  companyId: string,
  voucherId: string
): Promise<{ voucher: Record<string, unknown>; writeCompanyId: string } | null> {
  const primary = String(companyId ?? "").trim();
  if (!primary || !voucherId) return null;
  const tryIds: string[] = [];
  const seen = new Set<string>();
  const push = (x: string) => {
    const s = String(x ?? "").trim();
    if (!s || seen.has(s)) return;
    seen.add(s);
    tryIds.push(s);
  };
  push(primary);
  try {
    const reg = await getLocalCompanyById(primary, { includeDeleted: true });
    push(String((reg as Record<string, unknown> | null)?.authoritativeCompanyId ?? "").trim());
    const all = await listLocalCompanies({ includeDeleted: true });
    for (const c of all) {
      const a = String((c as Record<string, unknown>).authoritativeCompanyId ?? "").trim();
      if (c.id === primary || a === primary) push(c.id);
    }
  } catch {
    /* ignore — single-id try still runs */
  }
  for (const cid of tryIds) {
    const v = await getCompanyDocFromBrowserDb(cid, "vouchers", voucherId);
    if (v && typeof v === "object") return { voucher: v as Record<string, unknown>, writeCompanyId: cid };
  }
  return null;
}

/** Source IC approve — target copy par visibility flag taaki target ledger me tab dikhe. */
async function syncInterCompanySourceApprovedToPeerTarget(
  sourceVoucher: Record<string, unknown>
): Promise<void> {
  if (interCompanyVoucherViewerSide(sourceVoucher) !== "source") return;
  const link = readInterCompanyLink(sourceVoucher);
  if (!link?.peerCompanyId || !link?.peerVoucherId) return;
  await patchVoucherFields(link.peerCompanyId, link.peerVoucherId, {
    interCompanySourceApproved: true,
  });
}

/** Local mirror pe approve persist (local-only APK + Firebase mode offline fallback). */
async function approveVoucherLocalPersist(
  companyId: string,
  voucherId: string,
  approvedByUserId: string,
  approvedByName?: string | null
): Promise<void> {
  const resolved = await resolveVoucherSnapshotForLocalWrite(companyId, voucherId);
  if (!resolved) throw new Error("Voucher not found.");
  const { voucher, writeCompanyId } = resolved;
  if ((voucher as Record<string, unknown>)?.["isApproved"] === true) return;
  await assertInterCompanyTargetApproveAllowed(voucher as Record<string, unknown>);
  // Firebase-mode offline me `getEffectiveHistorySettings` Firestore pe ja sakta — yahan defaults safe.
  const { enabled: historyEnabled, limit: historyLimit } = isLocalOnlyMode()
    ? await getEffectiveHistorySettings(companyId)
    : { enabled: true, limit: 10 };
  const existingHistory = Array.isArray((voucher as Record<string, unknown>)?.["history"])
    ? ((voucher as Record<string, unknown>)["history"] as unknown[])
    : [];
  const approverName = approvedByName || approvedByUserId;
  const previousApprover =
    (voucher as Record<string, unknown>)?.["approvedByUserName"] ||
    (voucher as Record<string, unknown>)?.["approvedByUserId"] ||
    "N/A";
  const approvalEntry = {
    changedAt: new Date(),
    changedBy: approvedByUserId,
    changes: {
      isApproved: { from: (voucher as Record<string, unknown>)?.["isApproved"] === true ? true : false, to: true },
      approvedByUserName: { from: (voucher as Record<string, unknown>)?.["approvedByUserName"] || "N/A", to: approverName },
      approvedByUserId: { from: (voucher as Record<string, unknown>)?.["approvedByUserId"] || "N/A", to: approvedByUserId },
      approvedBy: { from: previousApprover, to: approverName },
    },
  };
  const newHistory = historyEnabled ? [approvalEntry, ...existingHistory].slice(0, historyLimit) : existingHistory;
  const icLegPatch = buildInterCompanyApprovalPatch(voucher as Record<string, unknown>);
  const payload = removeUndefined({
    ...voucher,
    ...icLegPatch,
    id: voucherId,
    isApproved: true,
    approvedByUserId,
    approvedByUserName: approverName,
    approvedAt: Timestamp.now(),
    history: newHistory,
  }) as Record<string, unknown>;
  coerceVoucherDocumentDate(payload);
  await upsertCompanyDocInBrowserDb(writeCompanyId, "vouchers", voucherId, payload);
  await enqueueVoucherOutbox(writeCompanyId, "update", voucherId, payload);
  if (interCompanyVoucherViewerSide(payload) === "source") {
    await syncInterCompanySourceApprovedToPeerTarget(payload);
  }
}

/**
 * Client-only: Save or update voucher. Runs in browser so Firestore uses signed-in user auth (server action has no auth → 500).
 */
export type SaveVoucherApproveOption = { approvedByUserId: string; approvedByName?: string | null };

/** Local create: attachment flow ne `generateLocalVoucherIdForCreate` pehle call kiya ho to yahan pass karo */
export type SaveVoucherOptions = {
  preGeneratedVoucherId?: string;
  /** Recurring auto-create: owner create hone par bhi unapproved persist chahiye. */
  forceUnapprovedCreate?: boolean;
  /** Recurring auto-create: transaction user column me fixed label (e.g. "Auto"). */
  userDisplayNameOverride?: string;
  /** Recurring auto-create: history/editor actor name ko stable label do. */
  actorDisplayNameOverride?: string;
  /** Inter Company create: pehli history me user / company detail rows. */
  interCompanyCreateHistory?: InterCompanyCreateHistoryInput;
};

export async function saveVoucher(
  companyId: string,
  userId: string,
  voucherData: any,
  voucherId?: string | null,
  approveAfterSave?: SaveVoucherApproveOption,
  options?: SaveVoucherOptions
): Promise<{ id: string }> {
  beginApkLedgerAsyncWriteShield({ pinCompanyId: companyId });
  // Firestore-first companies: SQLite upsert se pehle bhi yahi gate — expired paid = seedha updateDoc bhi rokna.
  await assertCompanyAllowsLedgerMutations(companyId);
  try {
    const { assertPlServerStaffWriteAllowed } = await import("@/lib/plServerStaffOfflinePolicy");
    await assertPlServerStaffWriteAllowed(companyId);
  } catch (e) {
    throw e instanceof Error ? e : new Error(String(e));
  }
  const cleanVoucherData = removeUndefined(voucherData);
  // Normalize clipboard marker URLs before any local-ref detection/sync routing.
  normalizeVoucherAttachmentFieldsForPersistence(cleanVoucherData as Record<string, unknown>, companyId);
  deleteUndefinedTopLevelFields(cleanVoucherData as Record<string, unknown>);
  const voucherPath = `companies/${companyId}/vouchers`;
  /** APK/static/EXE + offline: hamesha SQLite/outbox — Firestore/Storage await se "Saving…" (attachments) na atke. */
  const sqliteFirstEarly =
    await shouldUseLocalVoucherPipeline(companyId);
  // Local company + Copy To slip: Firebase HTTPS URL save se pehle `local:` pending me materialize.
  if (sqliteFirstEarly) {
    await rewriteRemoteVoucherAttachmentsForOfflineCompany(
      companyId,
      cleanVoucherData as Record<string, unknown>,
      voucherId ?? null
    );
    normalizeVoucherAttachmentFieldsForPersistence(cleanVoucherData as Record<string, unknown>, companyId);
    deleteUndefinedTopLevelFields(cleanVoucherData as Record<string, unknown>);
  }
  const sqliteFirst = sqliteFirstEarly;

  let voucherEditAttachmentCtx: { baselineUrls: string[]; remoteUrls: string[] } | null = null;
  if (voucherId) {
    voucherEditAttachmentCtx = await readVoucherEditAttachmentContext(companyId, voucherId);
  }

  const scheduleVoucherAttachmentCleanupIfNeeded = (
    finalUrls: unknown,
    ctxOverride?: { baselineUrls: string[]; remoteUrls: string[] } | null
  ): void => {
    const ctx = ctxOverride ?? voucherEditAttachmentCtx;
    if (!voucherId || !ctx) {
      if (process.env.NODE_ENV !== "production") {
        void import("@/lib/attachmentDeleteTrace").then((t) =>
          t.traceStorageCleanupBlocked({
            companyId,
            entityId: voucherId ?? undefined,
            reason: !voucherId ? "missing voucherId" : "missing attachment cleanup context",
          })
        );
      }
      return;
    }
    if (!Object.prototype.hasOwnProperty.call(cleanVoucherData, "fileUrls")) {
      if (process.env.NODE_ENV !== "production") {
        void import("@/lib/attachmentDeleteTrace").then((t) =>
          t.traceStorageCleanupBlocked({
            companyId,
            entityId: voucherId,
            reason: "save payload missing fileUrls key — cleanup skipped",
            detail: { keys: Object.keys(cleanVoucherData).slice(0, 24) },
          })
        );
      }
      return;
    }
    finalizeFormAttachmentEditAfterSave({
      companyId,
      entityId: voucherId,
      voucherType: String(cleanVoucherData.type || "").trim() || undefined,
      baselineUrls: ctx.baselineUrls,
      finalUrls: normalizeFileUrlsField(finalUrls),
      oldDocRemoteUrls: ctx.remoteUrls,
    });
  };

  // Web online + Firestore company: production jaisa — `local:` / clipboard marker ko HTTPS me badal kar hi persist karo.
  if (!sqliteFirst) {
    await materializeVoucherAttachmentsInSavePayload({
      companyId,
      voucherId: voucherId ?? null,
      data: cleanVoucherData as Record<string, unknown>,
      editBaselineUrls: voucherEditAttachmentCtx?.baselineUrls,
      editOldDocRemoteUrls: voucherEditAttachmentCtx?.remoteUrls,
    });
    normalizeVoucherAttachmentFieldsForPersistence(cleanVoucherData as Record<string, unknown>, companyId);
    deleteUndefinedTopLevelFields(cleanVoucherData as Record<string, unknown>);
  }

  // Edit: form/outbox se `date` key missing ho to purani voucher date merge — static/APK offline me pehla `getDoc` hang/slow kar sakta tha (“Saving…” chipka)
  if (voucherId) {
    try {
      let oldRow: Record<string, unknown> | null = null;
      if (sqliteFirst) {
        oldRow =
          (
            await resolveVoucherSnapshotForLocalWrite(companyId, voucherId).then((r) => r?.voucher ?? null)
          ) ?? null;
      } else {
        const snap = await getDoc(doc(firestore, voucherPath, voucherId));
        oldRow = snap.exists() ? (snap.data() as Record<string, unknown>) : null;
        if (!oldRow) {
          try {
            oldRow = (await getCompanyDocFromBrowserDb(companyId, "vouchers", voucherId)) as Record<
              string,
              unknown
            > | null;
          } catch {
            oldRow = null;
          }
        }
      }
      const currentDate = toJsDateFromVoucherField(cleanVoucherData.date);
      const dMissing =
        cleanVoucherData.date === undefined ||
        cleanVoucherData.date === null ||
        (typeof cleanVoucherData.date === "string" && String(cleanVoucherData.date).trim() === "");
      const dInvalidButPresent = !dMissing && currentDate === null;
      // Edit path: preserve previous voucher date when incoming payload carries an unparsable placeholder/object.
      if ((dMissing || dInvalidButPresent) && oldRow?.date != null) {
        cleanVoucherData.date = oldRow.date as any;
      }
    } catch {
      /* offline / permission: merge skip — niche coerce fallback */
    }
  }

  // Naya voucher: user-picked calendar day + abhi ka local clock — `createdAt` pending ho to bhi list me 12:00 AM na dikhe.
  if (!voucherId) {
    const calendarDate = toJsDateFromVoucherField(cleanVoucherData.date);
    if (calendarDate) {
      cleanVoucherData.date = mergeVoucherCalendarDateWithSaveClock(calendarDate);
    }
  }

  // `Date`/string → `Timestamp`: outbox JSON + bilink partial merge dono mein stable `date` (Payment Out "new" khali column fix).
  coerceVoucherDocumentDate(cleanVoucherData as Record<string, unknown>);
  const voucherRef = voucherId ? doc(firestore, voucherPath, voucherId) : null;
  if (cleanVoucherData.lineItems) {
    if (cleanVoucherData.type === "sale_service" || cleanVoucherData.type === "sale") cleanVoucherData.type = "sale";
    else if (cleanVoucherData.type === "purchase_service" || cleanVoucherData.type === "purchase") cleanVoucherData.type = "purchase";
    else if (!cleanVoucherData.type) cleanVoucherData.type = "sale";
  }
  if (
    (cleanVoucherData.type === "sale" || cleanVoucherData.type === "purchase") &&
    cleanVoucherData.total !== undefined &&
    cleanVoucherData.total !== null &&
    String(cleanVoucherData.total).trim() !== ""
  ) {
    // Keep legacy consumers in sync on edit/create; merged edits otherwise preserve stale `amount`.
    cleanVoucherData.amount = cleanVoucherData.total;
  }

  if (sqliteFirst) {
    // Static local-first: voucher writes ko direct Firebase pe mat bhejo; only local + outbox.
    if (!voucherRef) {
      return saveVoucherOfflineLocalCreate(
        companyId,
        userId,
        cleanVoucherData,
        voucherPath,
        options?.preGeneratedVoucherId ?? null,
        approveAfterSave,
        options
      );
    }
    const resolvedExisting = await resolveVoucherSnapshotForLocalWrite(companyId, voucherId!);
    const existingLocal = resolvedExisting?.voucher ?? null;
    const writeCompanyIdLocal = resolvedExisting?.writeCompanyId ?? companyId;
    const nowTs = Timestamp.now();
    let mergedLocal = removeUndefined(
      mergeVoucherEditPayloadPreservingAttachments(
        (existingLocal as Record<string, unknown> | null) ?? null,
        {
          ...cleanVoucherData,
          id: voucherId!,
          companyId,
          userId: (existingLocal as any)?.userId ?? userId,
          lastEditedBy: userId,
          lastEditedByUserName: auth.currentUser?.displayName || auth.currentUser?.email?.split("@")?.[0] || userId,
          lastEditedAt: nowTs,
          updatedAt: nowTs,
        }
      )
    ) as Record<string, unknown>;
    const wasApproved = (existingLocal as Record<string, unknown> | null)?.isApproved === true;
    if (approveAfterSave) {
      const approverName = approveAfterSave.approvedByName ?? approveAfterSave.approvedByUserId;
      mergedLocal.isApproved = true;
      mergedLocal.approvedByUserId = approveAfterSave.approvedByUserId;
      mergedLocal.approvedByUserName = approverName;
      mergedLocal.approvedAt = nowTs;
      try {
        const { enabled: historyEnabled, limit: historyLimit } =
          isLocalOnlyMode() || apkEmbeddedSqliteFirstWritesPreferred()
            ? { enabled: true, limit: 10 }
            : await getEffectiveHistorySettings(companyId);
        if (historyEnabled) {
          const existingHistory = Array.isArray(mergedLocal.history)
            ? [...(mergedLocal.history as unknown[])]
            : [];
          mergedLocal.history = [
            {
              changedAt: new Date(),
              changedBy: userId,
              changes: {
                isApproved: { from: wasApproved, to: true },
                approvedByUserId: {
                  from: (existingLocal as Record<string, unknown> | null)?.approvedByUserId ?? "N/A",
                  to: approveAfterSave.approvedByUserId,
                },
                approvedByUserName: {
                  from: (existingLocal as Record<string, unknown> | null)?.approvedByUserName ?? "N/A",
                  to: approverName,
                },
              },
            },
            ...existingHistory,
          ].slice(0, historyLimit);
        }
      } catch {
        /* history optional on local save */
      }
    } else if (wasApproved) {
      mergedLocal.isApproved = false;
      mergedLocal.approvedByUserId = null;
      mergedLocal.approvedByUserName = null;
      mergedLocal.approvedAt = null;
    }
    mergedLocal = { ...mergedLocal, id: voucherId! };
    coerceVoucherDocumentDate(mergedLocal);
    // Party rule: bytes bridge pe pehle, phir voucher JSON sync.
    await flushPlServerAttachmentsBeforeLocalSave(writeCompanyIdLocal, mergedLocal, {
      awaitComplete: false,
    });
    await upsertCompanyDocInBrowserDb(writeCompanyIdLocal, "vouchers", voucherId!, mergedLocal);
    scheduleBrowserDbPersistAfterWrite();
    void flushOrQueuePlServerVoucherAttachmentsAfterLocalSave(writeCompanyIdLocal, mergedLocal);
    await enqueueVoucherOutbox(writeCompanyIdLocal, "update", voucherId!, mergedLocal);
    scheduleBrowserDbPersistAfterWrite();
    dispatchSavedVoucherAttachmentUrls(writeCompanyIdLocal, voucherId!, mergedLocal);
    const cleanupCtx = mergeAttachmentCleanupContexts(
      voucherEditAttachmentCtx,
      readVoucherAttachmentBaselineFromRow(existingLocal as Record<string, unknown> | null)
    );
    scheduleVoucherAttachmentCleanupIfNeeded(mergedLocal.fileUrls, cleanupCtx);
    return { id: voucherId! };
  }

  if (!voucherRef) {
    try {
    const companySnap = await getDoc(doc(firestore, "companies", companyId));
    const companyData = companySnap.data() || {};
    const cd = companyData as Record<string, unknown>;

    let sqliteQuotaRow: { planId?: string | null; planExpiryMs?: unknown } | null = null;
    try {
      const loc = await getLocalCompanyById(companyId);
      if (loc) {
        const row = loc as { planId?: string | null; planExpiryMs?: unknown };
        sqliteQuotaRow = { planId: row.planId, planExpiryMs: row.planExpiryMs };
      }
    } catch {
      /* registry miss — sirf Firestore tier use */
    }

    const planId = resolvePlanIdForVoucherEnforcement(companyId, sqliteQuotaRow, {
      planId: (cd.planId as string | null | undefined) ?? null,
      planExpiryMs: planExpiryMsFromCompanyFirestoreData(cd),
    });
    const mergedEntitlements = await mergePlanEntitlementsForId(planId);
    const storageIsLocal = companyStorageIsLocal(companyData?.storageOption as string | undefined);
    const dailyLimit = numericEntitlement(mergedEntitlements, "dailyVoucherLimit", storageIsLocal);
    const monthlyLimit = numericEntitlement(mergedEntitlements, "monthlyVoucherLimit", storageIsLocal);
    // Pehle browser SQLite mirror; roz `getDocs` range query sirf mirror khali pure-cloud branch mein (`enforce*` ke andar).
    await enforceDailyMonthlyVoucherQuotaForCreate(companyId, dailyLimit, monthlyLimit, storageIsLocal);
    const authUser = auth.currentUser;
    const creatorDisplayName =
      options?.actorDisplayNameOverride ||
      authUser?.displayName ||
      authUser?.email?.split("@")?.[0] ||
      cleanVoucherData.userDisplayName ||
      null;
    const creatorEmail = authUser?.email || cleanVoucherData.userEmail || null;
    const isOwnerCreator = companyData?.ownerId === userId;

    const { enabled: historyEnabled } = await getEffectiveHistorySettings(companyId);
    const now = new Date();
    const nowTs = Timestamp.now();
    const initialHistory = historyEnabled
      ? [
          {
            changedAt: now,
            changedBy: userId,
            changes: buildInitialCreateHistoryChanges({
              voucherData: cleanVoucherData as Record<string, unknown>,
              userId,
              creatorDisplayName,
              creatorEmail,
              now,
              interCompanyCreateHistory: options?.interCompanyCreateHistory ?? null,
            }),
          },
        ]
      : [];
    // Firestore create: default policy par `local:` pe blocking hydrate skip — stable `preGeneratedVoucherId` + `setDoc` taaki `pendingFiles.docPath` match rahe; phir `syncPendingFiles`.
    const fsIdCreate = await resolveAuthoritativeFirestoreCompanyId(companyId);
    const createPayloadForFs = {
      ...cleanVoucherData,
      companyId,
      userId,
      // Recurring generator owner se create hone par bhi voucher unapproved hi rehna chahiye.
      isApproved: options?.forceUnapprovedCreate
        ? false
        : (approveAfterSave ? true : (isOwnerCreator ? true : (cleanVoucherData.isApproved ?? false))),
      ...(approveAfterSave
        ? {
            approvedByUserId: approveAfterSave.approvedByUserId,
            approvedByUserName: approveAfterSave.approvedByName ?? approveAfterSave.approvedByUserId,
            approvedAt: nowTs,
          }
        : {}),
      userDisplayName: options?.userDisplayNameOverride ?? creatorDisplayName,
      userEmail: creatorEmail,
      lastEditedByUserName: creatorDisplayName || userId,
      // Client `Timestamp.now()` — `serverTimestamp()` pending par list "• 12:00 AM" dikhata tha.
      lastEditedAt: nowTs,
      createdAt: nowTs,
      history: initialHistory,
      [PL_CLIENT_OFFLINE_FIRST_PERSIST_MS]: Date.now(),
    } as Record<string, unknown>;

    let awaitHydrateCreate = shouldAwaitBlockingHydrateForFirestorePayload(createPayloadForFs);
    const cleanedCreateBase = removeUndefined(createPayloadForFs) as Record<string, unknown>;
    const hasLocalCreate = recordContainsLocalPendingVoucherFileRef(cleanedCreateBase);
    const preGenCreate = String(options?.preGeneratedVoucherId ?? "").trim();
    // Hybrid web: `addDoc` id unknown ho to docPath mismatch — inline hydrate. Offline/static me await mat (hang).
    if (hasLocalCreate && !preGenCreate && !isClientNavigatorOffline() && !apkEmbeddedSqliteFirstWritesPreferred()) {
      awaitHydrateCreate = true;
    }

    const createPayloadHydrated = awaitHydrateCreate
      ? await voucherPayloadHydrateLocalFilesForFirestore(fsIdCreate, createPayloadForFs)
      : cleanedCreateBase;

    const canSetClientVoucherId = !awaitHydrateCreate && preGenCreate.length > 0;

    let newId: string;
    let docRef: ReturnType<typeof doc>;

    if (canSetClientVoucherId) {
      newId = preGenCreate;
      // `pendingFiles.docPath` authoritative company id use karta hai — `setDoc` bhi wahi path.
      docRef = doc(firestore, "companies", fsIdCreate, "vouchers", newId);
      const bodyForCreate = removeUndefined({ ...createPayloadHydrated, id: newId }) as Record<string, unknown>;
      await setDoc(docRef, bodyForCreate);
      await syncPendingAttachmentsAfterFirestoreWrite(bodyForCreate);
    } else {
      const added = await addDoc(
        collection(firestore, `companies/${fsIdCreate}/vouchers`),
        removeUndefined(createPayloadHydrated) as Record<string, unknown>,
      );
      newId = added.id;
      docRef = added;
      await syncPendingAttachmentsAfterFirestoreWrite(
        removeUndefined(createPayloadHydrated) as Record<string, unknown>,
      );
    }

    const uf = cleanVoucherData.unassignedFile as { id?: string; url?: string; path?: string; name?: string } | undefined;
    if (uf?.path && uf?.name && typeof uf.path === "string" && typeof uf.name === "string") {
      const voucherType = cleanVoucherData.type || "sale";
      const voucherDate = toJsDateFromVoucherField(cleanVoucherData.date) ?? new Date();
      const companySnap = await getDoc(doc(firestore, "companies", companyId));
      const companyName = companySnap.data()?.name as string | undefined;
      const moveResult = await moveFilesToVoucherDateClient({
        companyId,
        companyName,
        voucherType,
        voucherDate,
        voucherId: newId,
        files: [{ oldPath: uf.path, fileName: uf.name }],
      });
      if (moveResult?.success && Array.isArray(moveResult.moved) && moveResult.moved.length > 0) {
        const m = moveResult.moved[0];
        const newUrl = m.url;
        const newPath = m.newPath;
        const fileUrls = (Array.isArray(cleanVoucherData.fileUrls) ? cleanVoucherData.fileUrls : []) as string[];
        const updatedFileUrls = fileUrls.map((u) => (u === uf.url ? newUrl : u));
        const files = [{ url: newUrl, storagePath: newPath, name: newPath.split("/").pop() || uf.name }];
        await updateDoc(docRef, { fileUrls: updatedFileUrls, files, unassignedFile: null });
      }
    }
    // Static build: naya voucher + optional file move ke baad local SQLite mein mirror (offline layer).
    await mirrorVoucherDocToBrowserDb(companyId, newId);
    return { id: newId };
    } catch (e) {
      if (isVoucherLimitError(e)) throw e;
      if (!isLikelyOfflineFirestoreError(e)) throw e;
      if (!(await allowLocalFirestoreFailureQueue(companyId))) throw e;
      return saveVoucherOfflineLocalCreate(
        companyId,
        userId,
        cleanVoucherData,
        voucherPath,
        options?.preGeneratedVoucherId ?? null,
        approveAfterSave,
        options
      );
    }
  }

  const fsIdForEdit = await resolveAuthoritativeFirestoreCompanyId(companyId);
  const firestoreVoucherRef = doc(firestore, `companies/${fsIdForEdit}/vouchers`, voucherId!);
  const oldSnap = await getDoc(firestoreVoucherRef).catch(() => null);
  let oldData: any;
  if (oldSnap?.exists()) {
    oldData = oldSnap.data();
  } else {
    // Local company / authoritative-id mismatch: SQLite me voucher same `companyId` ke alawa alias row me bhi ho sakta hai.
    const resolvedLocal = await resolveVoucherSnapshotForLocalWrite(companyId, voucherId!);
    if (!resolvedLocal?.voucher) throw new Error("Voucher not found");
    oldData = resolvedLocal.voucher;
  }
  const { createdAt, updatedAt, ...restOfOldData } = (oldData || {}) as any;
  const changedFields = getChanges(restOfOldData, cleanVoucherData);
  if (Object.keys(changedFields).length === 0 && !approveAfterSave) return { id: voucherId! };
  const shouldResetApproval = oldData?.isApproved === true && !approveAfterSave;
  if (approveAfterSave) {
    const approverName = approveAfterSave.approvedByName ?? approveAfterSave.approvedByUserId;
    changedFields.isApproved = { from: (oldData as any)?.isApproved === true, to: true };
    changedFields.approvedByUserId = { from: (oldData as any)?.approvedByUserId ?? "N/A", to: approveAfterSave.approvedByUserId };
    changedFields.approvedByUserName = { from: (oldData as any)?.approvedByUserName ?? "N/A", to: approverName };
    changedFields.approvedAt = { from: (oldData as any)?.approvedAt ?? null, to: new Date() };
  } else if (shouldResetApproval) {
    changedFields.isApproved = { from: true, to: false };
    if ((oldData as any)?.approvedByUserId != null) {
      changedFields.approvedByUserId = { from: (oldData as any).approvedByUserId, to: null };
    }
    if ((oldData as any)?.approvedByUserName != null) {
      changedFields.approvedByUserName = { from: (oldData as any).approvedByUserName, to: null };
    }
    if ((oldData as any)?.approvedAt != null) {
      changedFields.approvedAt = { from: (oldData as any).approvedAt, to: null };
    }
  }

  const oldDate = toJsDateFromVoucherField((oldData as any)?.date);
  const newDate = toJsDateFromVoucherField(cleanVoucherData?.date);
  const oldStamp = oldDate ? oldDate.toISOString().slice(0, 10) : "";
  const newStamp = newDate ? newDate.toISOString().slice(0, 10) : "";
  let movedFileObjects: any[] | null = null;

  if (oldStamp && newStamp && oldStamp !== newStamp) {
    const vType = cleanVoucherData?.type || (oldData as any)?.type || "sale";
    const filesToMove = ((oldData as any)?.files || []).filter(
      (f: any) => f && isFirebaseStorageAttachmentPath(f.storagePath)
    );
    if (filesToMove.length > 0) {
      const companySnap = await getDoc(doc(firestore, "companies", companyId));
      const companyName = companySnap.data()?.name;
      const moveResult = await moveFilesToVoucherDateClient({
        companyId,
        companyName,
        voucherType: vType,
        voucherDate: newDate!,
        voucherId: voucherRef.id,
        files: filesToMove.map((f: any) => ({
          oldPath: String(f.storagePath),
          fileName: String(f.name || f.storagePath.split("/").pop() || "file"),
        })),
      });
      if (moveResult?.success && Array.isArray(moveResult.moved)) {
        const moved = moveResult.moved
          .filter((m: any) => m?.success !== false && (m.url || m.newPath))
          .map((m: any) => ({
            url: m.url,
            storagePath: m.newPath ?? "",
            name: m.newPath ? m.newPath.split("/").pop() : "",
          }));
        if (moved.length > 0) movedFileObjects = moved;
      }
    }
  }

  const { enabled: historyEnabled, limit: historyLimit, fullBehavior } = await getEffectiveHistorySettings(companyId);
  const existingHistory = Array.isArray((oldData as any)?.history) ? (oldData as any).history : [];
  // When history disabled: no restriction; when enabled + block_edit: block if at limit
  if (historyEnabled && fullBehavior === 'block_edit' && existingHistory.length >= historyLimit) {
    throw new Error("Voucher history is full. Clear history in History dialog to edit and save changes.");
  }
  const now = new Date();
  const currentUserName = auth.currentUser?.displayName || auth.currentUser?.email?.split("@")?.[0] || userId;
  const previousEditor = (oldData as any)?.lastEditedByUserName || (existingHistory[0] as any)?.changedBy || "N/A";
  changedFields.lastEditedByUserName = { from: previousEditor, to: currentUserName };
  changedFields.lastEditedAt = { from: (oldData as any)?.lastEditedAt ?? (oldData as any)?.updatedAt ?? null, to: now };

  const newEntry = { changedAt: now, changedBy: userId, changes: changedFields };
  const newHistory = historyEnabled ? [newEntry, ...existingHistory].slice(0, historyLimit) : existingHistory;
  const localTs = Timestamp.now();
  const updatePayload: any = mergeVoucherEditPayloadPreservingAttachments(oldData as Record<string, unknown>, {
    ...cleanVoucherData,
    lastEditedBy: userId,
    lastEditedByUserName: currentUserName,
    lastEditedAt: localTs,
    updatedAt: localTs,
    history: newHistory,
  });
  if (approveAfterSave) {
    updatePayload.isApproved = true;
    updatePayload.approvedByUserId = approveAfterSave.approvedByUserId;
    updatePayload.approvedByUserName = approveAfterSave.approvedByName ?? approveAfterSave.approvedByUserId;
    updatePayload.approvedAt = localTs;
  } else if (shouldResetApproval) {
    updatePayload.isApproved = false;
    updatePayload.approvedByUserId = null;
    updatePayload.approvedByUserName = null;
    updatePayload.approvedAt = null;
  }
  if (movedFileObjects) updatePayload.files = movedFileObjects;
  const vType = cleanVoucherData?.type || (oldData as any)?.type;
  if (vType === "sale" || vType === "purchase") {
    const serverOB = (oldData as any)?.openingBalanceAllocated;
    if (serverOB !== undefined && serverOB !== null) updatePayload.openingBalanceAllocated = Number(serverOB) || 0;
  }
  const fireUpdate: any = {
    ...updatePayload,
    lastEditedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (approveAfterSave) fireUpdate.approvedAt = serverTimestamp();
  else if (shouldResetApproval) fireUpdate.approvedAt = null;

  try {
    const awaitHydrateUpdate = shouldAwaitBlockingHydrateForFirestorePayload(fireUpdate as Record<string, unknown>);
    const fireUpdateHydrated = awaitHydrateUpdate
      ? await voucherPayloadHydrateLocalFilesForFirestore(fsIdForEdit, fireUpdate as Record<string, unknown>)
      : (removeUndefined(fireUpdate) as Record<string, unknown>);
    await updateDoc(firestoreVoucherRef, fireUpdateHydrated as typeof fireUpdate);
    if (!awaitHydrateUpdate) {
      await syncPendingAttachmentsAfterFirestoreWrite(fireUpdate as Record<string, unknown>);
    }
  } catch (e) {
    if (isCompanyNotFoundError(e)) {
      const { id: _oldId, ...oldRest } = oldData as Record<string, unknown>;
      const forFs = removeUndefined({
        id: voucherId!,
        ...oldRest,
        ...updatePayload,
        companyId,
      }) as Record<string, unknown>;
      coerceVoucherDocumentDate(forFs);
      await setFirestoreVoucherFromLocalMirrorWhenMissing(companyId, voucherId!, forFs);
      scheduleVoucherAttachmentCleanupIfNeeded(forFs.fileUrls);
      return { id: voucherId! };
    }
    // Static/hybrid: offline queue; APK Firebase company par allowLocalFirestoreFailureQueue false ho to throw
    const queueLocalStale = isLikelyOfflineFirestoreError(e) && (await allowLocalFirestoreFailureQueue(companyId));
    if (!queueLocalStale) throw e;
    const { id: _oldId, ...oldRest } = oldData as Record<string, unknown>;
    const forLocal = removeUndefined({
      id: voucherId!,
      ...oldRest,
      ...updatePayload,
    }) as Record<string, unknown>;
    coerceVoucherDocumentDate(forLocal);
    await upsertCompanyDocInBrowserDb(companyId, "vouchers", voucherId!, forLocal);
    await enqueueVoucherOutbox(companyId, "update", voucherId!, forLocal);
    scheduleVoucherAttachmentCleanupIfNeeded(forLocal.fileUrls);
    return { id: voucherId! };
  }
  await mirrorVoucherDocToBrowserDb(companyId, voucherId!);
  scheduleVoucherAttachmentCleanupIfNeeded(cleanVoucherData.fileUrls);
  return { id: voucherId! };
}

/**
 * Client-only: Update only spend-wise link fields on a voucher (Payment Out / Contra / Direct Expense).
 * Used when linking from Payment In "Link Pay" so we don't overwrite the whole voucher.
 */
export async function updateVoucherSpendWiseLinks(
  companyId: string,
  voucherId: string,
  linkedPaymentInIds: string[],
  linkedPaymentInAmounts: Record<string, number>,
  userId: string
): Promise<void> {
  if (!companyId || !voucherId) throw new Error("Missing companyId or voucherId");
  // Spend-wise patch = local SQLite/outbox burst — shield `saveVoucher` / `patchVoucherFields` jaisa
  beginApkLedgerAsyncWriteShield({ pinCompanyId: companyId });
  if (await shouldUseLocalVoucherPipeline(companyId)) {
    // Local-only mode me spend-wise links browser DB me update karke outbox queue karo.
    const oldData = await getCompanyDocFromBrowserDb(companyId, "vouchers", voucherId);
    if (!oldData) throw new Error("Voucher not found");
    const currentUserName = auth.currentUser?.displayName || auth.currentUser?.email?.split("@")?.[0] || userId;
    const now = new Date();
    const existingHistory = Array.isArray((oldData as any)?.history) ? (oldData as any).history : [];
    const { enabled: historyEnabled, limit: historyLimit } = await getEffectiveHistorySettings(companyId);
    const newEntry = {
      changedAt: now,
      changedBy: userId,
      changes: {
        linkedPaymentInIds: { from: (oldData as any)?.linkedPaymentInIds ?? [], to: linkedPaymentInIds },
        linkedPaymentInAmounts: { from: (oldData as any)?.linkedPaymentInAmounts ?? {}, to: linkedPaymentInAmounts },
        lastEditedByUserName: { from: (oldData as any)?.lastEditedByUserName ?? "N/A", to: currentUserName },
        lastEditedAt: { from: (oldData as any)?.lastEditedAt ?? null, to: now },
      },
    };
    const newHistory = historyEnabled ? [newEntry, ...existingHistory].slice(0, historyLimit) : existingHistory;
    const payload = removeUndefined({
      ...(oldData as any),
      id: voucherId,
      linkedPaymentInIds,
      linkedPaymentInAmounts,
      lastEditedByUserName: currentUserName,
      lastEditedAt: Timestamp.now(),
      history: newHistory,
    }) as Record<string, unknown>;
    coerceVoucherDocumentDate(payload);
    await upsertCompanyDocInBrowserDb(companyId, "vouchers", voucherId, payload);
    await enqueueVoucherOutbox(companyId, "update", voucherId, payload);
    dispatchVoucherLivePatch(companyId, voucherId, {
      linkedPaymentInIds,
      linkedPaymentInAmounts,
      lastEditedByUserName: currentUserName,
      lastEditedAt: payload.lastEditedAt,
    });
    return;
  }
  const fsCompanyId = await resolveAuthoritativeFirestoreCompanyId(companyId);
  const voucherRef = doc(firestore, `companies/${fsCompanyId}/vouchers`, voucherId);
  const authUser = auth.currentUser;
  const currentUserName = authUser?.displayName || authUser?.email?.split("@")?.[0] || userId;
  const now = new Date();
  const oldSnap = await getDoc(voucherRef).catch(() => null);
  let baseRow: Record<string, unknown> | null = oldSnap?.exists()
    ? (oldSnap.data() as Record<string, unknown>)
    : null;
  if (!baseRow) {
    const loc = await getCompanyDocFromBrowserDb(companyId, "vouchers", voucherId);
    if (loc && typeof loc === "object") baseRow = loc as Record<string, unknown>;
  }
  if (!baseRow) throw new Error("Voucher not found");

  const oldData = baseRow as Record<string, unknown>;
  const { enabled: historyEnabled, limit: historyLimit } = await getEffectiveHistorySettings(companyId);
  const existingHistory = Array.isArray(oldData.history) ? (oldData.history as unknown[]) : [];
  const newEntry = {
    changedAt: now,
    changedBy: userId,
    changes: {
      linkedPaymentInIds: {
        from: (oldData as { linkedPaymentInIds?: unknown }).linkedPaymentInIds ?? [],
        to: linkedPaymentInIds,
      },
      linkedPaymentInAmounts: {
        from: (oldData as { linkedPaymentInAmounts?: unknown }).linkedPaymentInAmounts ?? {},
        to: linkedPaymentInAmounts,
      },
      lastEditedByUserName: {
        from: (oldData as { lastEditedByUserName?: unknown }).lastEditedByUserName ?? "N/A",
        to: currentUserName,
      },
      lastEditedAt: { from: (oldData as { lastEditedAt?: unknown }).lastEditedAt ?? null, to: now },
    },
  };
  const newHistory = historyEnabled ? [newEntry, ...existingHistory].slice(0, historyLimit) : existingHistory;
  try {
    await updateDoc(voucherRef, {
      linkedPaymentInIds,
      linkedPaymentInAmounts,
      lastEditedByUserName: currentUserName,
      lastEditedAt: serverTimestamp(),
      history: newHistory,
    });
  } catch (e) {
    if (!(isLikelyOfflineFirestoreError(e) && (await allowLocalFirestoreFailureQueue(companyId)))) throw e;
    await upsertLocalVoucherFromPartialForOutbox(companyId, voucherId, {
      linkedPaymentInIds,
      linkedPaymentInAmounts,
      lastEditedByUserName: currentUserName,
      lastEditedAt: Timestamp.now(),
      history: newHistory as unknown as Record<string, unknown>,
    });
    dispatchVoucherLivePatch(companyId, voucherId, {
      linkedPaymentInIds,
      linkedPaymentInAmounts,
      lastEditedByUserName: currentUserName,
      lastEditedAt: Timestamp.now(),
    });
    return;
  }
  await mirrorVoucherDocToBrowserDb(companyId, voucherId);
  dispatchVoucherLivePatch(companyId, voucherId, {
    linkedPaymentInIds,
    linkedPaymentInAmounts,
    lastEditedByUserName: currentUserName,
    lastEditedAt: Timestamp.now(),
  });
}

/**
 * Bill-wise bilateral sync: when a Payment In or Payment Out is saved with allocations (Link to Dr/Cr),
 * update each target voucher so it has the reverse allocation. So RCPT→Sale and PYMT→Purchase (and Payment↔Payment) show on both sides.
 */
export async function syncBillWiseAllocationsToTargetVouchers(
  companyId: string,
  sourceVoucherId: string,
  newAllocations: Allocation[],
  previousAllocations: Allocation[] = []
): Promise<void> {
  if (!companyId || !sourceVoucherId) return;
  const hasNew = newAllocations.some(
    (a) => a.voucherId && a.voucherId !== OPENING_BALANCE_VOUCHER_ID && getAllocationTotal(a) > 0
  );
  const hasPrev = previousAllocations.some(
    (a) => a.voucherId && a.voucherId !== OPENING_BALANCE_VOUCHER_ID && getAllocationTotal(a) > 0
  );
  if (!hasNew && !hasPrev) return;
  // Multi-doc allocation sync — APK par turant-heavy write burst; ledger shield ek hi entry se arm
  beginApkLedgerAsyncWriteShield({ pinCompanyId: companyId });
  if (await shouldUseLocalVoucherPipeline(companyId)) {
    // Local-only mode me reverse allocation links local vouchers par maintain karo.
    const prevIds = new Set(
      previousAllocations
        .filter((a) => a.voucherId && a.voucherId !== OPENING_BALANCE_VOUCHER_ID)
        .map((a) => a.voucherId)
    );
    const newIds = new Set(
      newAllocations
        .filter((a) => a.voucherId && a.voucherId !== OPENING_BALANCE_VOUCHER_ID)
        .map((a) => a.voucherId)
    );
    const toRemove = [...prevIds].filter((id) => !newIds.has(id));
    for (const targetId of toRemove) {
      const data = await getCompanyDocFromBrowserDb(companyId, "vouchers", targetId);
      if (!data) continue;
      const allocations: Allocation[] = Array.isArray((data as any)?.allocations) ? [...((data as any).allocations as Allocation[])] : [];
      const filtered = allocations.filter((a) => a.voucherId !== sourceVoucherId);
      if (filtered.length !== allocations.length) {
        const payload = removeUndefined({ ...(data as any), id: targetId, allocations: filtered }) as Record<string, unknown>;
        coerceVoucherDocumentDate(payload);
        await upsertCompanyDocInBrowserDb(companyId, "vouchers", targetId, payload);
        await enqueueVoucherOutbox(companyId, "update", targetId, payload);
      }
    }
    for (const a of newAllocations) {
      if (!a.voucherId || a.voucherId === OPENING_BALANCE_VOUCHER_ID) continue;
      const amt = getAllocationTotal(a);
      if (amt <= 0) continue;
      const targetId = a.voucherId;
      const data = await getCompanyDocFromBrowserDb(companyId, "vouchers", targetId);
      if (!data) continue;
      const allocations: Allocation[] = Array.isArray((data as any)?.allocations) ? [...((data as any).allocations as Allocation[])] : [];
      const idx = allocations.findIndex((x) => x.voucherId === sourceVoucherId);
      const entry: Allocation = {
        voucherId: sourceVoucherId,
        amount: amt,
        taxAmount: (a as any).taxAmount !== undefined ? Number((a as any).taxAmount) : undefined,
        netAmount: (a as any).netAmount !== undefined ? Number((a as any).netAmount) : undefined,
      };
      if (idx >= 0) allocations[idx] = entry;
      else allocations.push(entry);
      const payload = removeUndefined({ ...(data as any), id: targetId, allocations }) as Record<string, unknown>;
      coerceVoucherDocumentDate(payload);
      await upsertCompanyDocInBrowserDb(companyId, "vouchers", targetId, payload);
      await enqueueVoucherOutbox(companyId, "update", targetId, payload);
    }
    return;
  }
  const voucherPath = `companies/${companyId}/vouchers`;
  const prevIds = new Set(
    previousAllocations
      .filter((a) => a.voucherId && a.voucherId !== OPENING_BALANCE_VOUCHER_ID)
      .map((a) => a.voucherId)
  );
  const newIds = new Set(
    newAllocations
      .filter((a) => a.voucherId && a.voucherId !== OPENING_BALANCE_VOUCHER_ID)
      .map((a) => a.voucherId)
  );
  const toRemove = [...prevIds].filter((id) => !newIds.has(id));
  for (const targetId of toRemove) {
    const ref = doc(firestore, voucherPath, targetId);
    const snap = await getDoc(ref);
    if (!snap.exists()) continue;
    const data = snap.data();
    const allocations: Allocation[] = Array.isArray(data?.allocations) ? [...data.allocations] : [];
    const filtered = allocations.filter((a) => a.voucherId !== sourceVoucherId);
    if (filtered.length !== allocations.length) {
      await updateDoc(ref, { allocations: filtered });
      await mirrorVoucherDocToBrowserDb(companyId, targetId);
    }
  }
  // Sanitize allocation so Firestore never gets undefined
  const sanitizeAllocation = (x: Allocation): Allocation => {
    const out: Allocation = { voucherId: x.voucherId, amount: Number(x.amount) || 0 };
    if ((x as any).taxAmount !== undefined && (x as any).taxAmount !== null) out.taxAmount = Number((x as any).taxAmount);
    if ((x as any).netAmount !== undefined && (x as any).netAmount !== null) out.netAmount = Number((x as any).netAmount);
    return out;
  };

  for (const a of newAllocations) {
    if (!a.voucherId || a.voucherId === OPENING_BALANCE_VOUCHER_ID) continue;
    const amt = getAllocationTotal(a);
    if (amt <= 0) continue;
    const ref = doc(firestore, voucherPath, a.voucherId);
    const snap = await getDoc(ref);
    if (!snap.exists()) continue;
    const data = snap.data();
    const rawAllocations: Allocation[] = Array.isArray(data?.allocations) ? [...data.allocations] : [];
    const allocations = rawAllocations.map(sanitizeAllocation);
    const idx = allocations.findIndex((x) => x.voucherId === sourceVoucherId);
    const entry = sanitizeAllocation({
      voucherId: sourceVoucherId,
      amount: amt,
      taxAmount: (a as any).taxAmount,
      netAmount: (a as any).netAmount,
    } as Allocation);
    if (idx >= 0) allocations[idx] = entry;
    else allocations.push(entry);
    await updateDoc(ref, { allocations });
    await mirrorVoucherDocToBrowserDb(companyId, a.voucherId);
  }
}

/**
 * Ledger / report "Link for bill wise" save — mirror + bilateral sync + live cache patch.
 */
export async function applyPaymentBillWiseLinkAllocations(
  companyId: string,
  sourceVoucher: { id: string; allocations?: Allocation[] },
  newAllocations: Allocation[]
): Promise<void> {
  if (!companyId || !sourceVoucher?.id) throw new Error("Missing companyId or voucher");
  const sourceId = sourceVoucher.id;
  const previousAllocations = Array.isArray(sourceVoucher.allocations) ? sourceVoucher.allocations : [];
  await patchVoucherFields(companyId, sourceId, { allocations: newAllocations });
  await syncBillWiseAllocationsToTargetVouchers(companyId, sourceId, newAllocations, previousAllocations);

  dispatchVoucherLivePatch(companyId, sourceId, { allocations: newAllocations });

  const affectedTargetIds = new Set<string>();
  for (const a of [...previousAllocations, ...newAllocations]) {
    if (a.voucherId && a.voucherId !== OPENING_BALANCE_VOUCHER_ID) affectedTargetIds.add(a.voucherId);
  }
  for (const targetId of affectedTargetIds) {
    const data = await getCompanyDocFromBrowserDb(companyId, "vouchers", targetId).catch(() => null);
    if (!data) continue;
    const allocations = Array.isArray((data as { allocations?: Allocation[] }).allocations)
      ? (data as { allocations: Allocation[] }).allocations
      : [];
    dispatchVoucherLivePatch(companyId, targetId, { allocations });
  }
}

/**
 * Approve a voucher and append a history entry with approver metadata.
 * Uses a transaction so we read the latest doc (including any just-saved edit history) and append approval.
 */
export async function approveVoucherWithHistory(
  companyId: string,
  voucherId: string,
  approvedByUserId: string,
  approvedByName?: string | null
): Promise<void> {
  if (!companyId || !voucherId || !approvedByUserId) {
    throw new Error("Missing required approval parameters.");
  }
  beginApkLedgerAsyncWriteShield({ pinCompanyId: companyId });

  // Live + SQLite-first: local row ho to local approve; warna Firestore (live) pe try.
  const localResolved = await resolveVoucherSnapshotForLocalWrite(companyId, voucherId);
  // Save & Approve create already embeds isApproved — skip FS race ("Voucher not found").
  if (localResolved?.voucher?.isApproved === true) {
    return;
  }
  // Prefer SQLite whenever the row exists (new create often not on Firestore yet).
  if (localResolved) {
    await approveVoucherLocalPersist(companyId, voucherId, approvedByUserId, approvedByName);
    void flushVoucherOutbox().catch(() => undefined);
    return;
  }

  const authFsId = await resolveAuthoritativeFirestoreCompanyId(companyId);
  const fsCompanyIds = Array.from(
    new Set([String(companyId).trim(), String(authFsId || "").trim()].filter(Boolean))
  );
  const { enabled: historyEnabled, limit: historyLimit } = await getEffectiveHistorySettings(companyId);

  let approvedViaFs = false;
  for (const fsCompanyId of fsCompanyIds) {
    const voucherRef = doc(firestore, `companies/${fsCompanyId}/vouchers`, voucherId);
    try {
      const preApproveSnap = await getDoc(voucherRef);
      if (!preApproveSnap.exists()) {
        continue;
      }
      await assertInterCompanyTargetApproveAllowed(preApproveSnap.data() as Record<string, unknown>);

      await runTransaction(firestore, async (tx) => {
        const snap = await tx.get(voucherRef);
        if (!snap.exists()) throw new Error("Voucher not found.");

        const voucher = snap.data() as any;
        if (voucher?.isApproved === true) return;

        const existingHistory = Array.isArray(voucher?.history) ? voucher.history : [];
        const approverName = approvedByName || approvedByUserId;
        const previousApprover = voucher?.approvedByUserName || voucher?.approvedByUserId || "N/A";

        const approvalEntry = {
          changedAt: new Date(),
          changedBy: approvedByUserId,
          changes: {
            isApproved: { from: voucher?.isApproved === true ? true : false, to: true },
            approvedByUserName: { from: voucher?.approvedByUserName || "N/A", to: approverName },
            approvedByUserId: { from: voucher?.approvedByUserId || "N/A", to: approvedByUserId },
            approvedBy: { from: previousApprover, to: approverName },
          },
        };

        const newHistory = historyEnabled ? [approvalEntry, ...existingHistory].slice(0, historyLimit) : existingHistory;
        const icLegPatch = buildInterCompanyApprovalPatch(voucher as Record<string, unknown>);

        tx.update(voucherRef, {
          ...icLegPatch,
          isApproved: true,
          approvedByUserId: approvedByUserId,
          approvedByUserName: approverName,
          approvedAt: serverTimestamp(),
          history: newHistory,
        });
      });
      const approvedSnap = await getDoc(voucherRef);
      if (approvedSnap.exists()) {
        const approvedRow = { ...approvedSnap.data(), id: voucherId } as Record<string, unknown>;
        if (interCompanyVoucherViewerSide(approvedRow) === "source") {
          await syncInterCompanySourceApprovedToPeerTarget(approvedRow);
        }
      }
      approvedViaFs = true;
      break;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e || "");
      if (msg === "Voucher not found.") {
        continue;
      }
      if (!isLikelyOfflineFirestoreError(e)) throw e;
      if (!(await allowLocalFirestoreFailureQueue(companyId))) throw e;
      if (localResolved) {
        await approveVoucherLocalPersist(companyId, voucherId, approvedByUserId, approvedByName);
        void flushVoucherOutbox().catch(() => undefined);
        return;
      }
      throw e;
    }
  }

  if (approvedViaFs) {
    await mirrorVoucherDocToBrowserDb(companyId, voucherId);
    return;
  }

  // Live Firestore miss + SQLite pending outbox row → local approve.
  if (localResolved) {
    await approveVoucherLocalPersist(companyId, voucherId, approvedByUserId, approvedByName);
    void flushVoucherOutbox().catch(() => undefined);
    return;
  }
  throw new Error("Voucher not found.");
}

/**
 * Reset (clear) voucher history. Runs on client so Firestore uses the logged-in user's auth.
 * Also deletes from Firebase Storage any file URLs that were only referenced in history
 * and are not in the current voucher's fileUrls.
 */
export async function resetVoucherHistory(
  companyId: string,
  voucherId: string
): Promise<{ success: true }> {
  beginApkLedgerAsyncWriteShield({ pinCompanyId: companyId });
  if (await shouldUseLocalVoucherPipeline(companyId)) {
    // Local-only mode: history clear local voucher doc me apply karo.
    const voucher = await getCompanyDocFromBrowserDb(companyId, "vouchers", voucherId);
    if (!voucher) throw new Error("Voucher not found");
    const payload = removeUndefined({ ...(voucher as any), id: voucherId, history: [] }) as Record<string, unknown>;
    coerceVoucherDocumentDate(payload);
    await upsertCompanyDocInBrowserDb(companyId, "vouchers", voucherId, payload);
    await enqueueVoucherOutbox(companyId, "update", voucherId, payload);
    return { success: true };
  }
  const voucherRef = doc(firestore, `companies/${companyId}/vouchers`, voucherId);
  const snap = await getDoc(voucherRef);
  if (!snap.exists()) throw new Error("Voucher not found");
  const data = snap.data();
  const existing: any[] = data.history ?? [];

  // URLs to keep = current voucher attachments
  const keepUrls = new Set<string>();
  for (const field of ["fileUrls", "fileUrl", "url"]) {
    for (const u of toUrlArray(data[field])) keepUrls.add(u);
  }

  // All URLs that appear anywhere in history (from or to)
  const urlsInHistory = new Set<string>();
  for (const entry of existing) {
    for (const field of ["fileUrls", "fileUrl", "url"]) {
      const change = entry.changes?.[field];
      if (!change) continue;
      for (const u of [...toUrlArray(change.from), ...toUrlArray(change.to)]) {
        urlsInHistory.add(u);
      }
    }
  }

  // Delete from storage any URL that was only in history and not on the voucher
  const toDeleteFromStorage = [...urlsInHistory].filter((u) => !keepUrls.has(u));
  if (toDeleteFromStorage.length > 0) {
    await deleteFirebaseStorageUrlsWithRegistry(companyId, toDeleteFromStorage);
  }

  await updateDoc(voucherRef, { history: [] });
  await mirrorVoucherDocToBrowserDb(companyId, voucherId);
  return { success: true };
}

/** Normalise fileUrls field value (string | string[] | null) to a flat string[]. */
function toUrlArray(val: any): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter((u: any) => typeof u === "string" && u);
  if (typeof val === "string" && val) return [val];
  return [];
}

/** Get Firebase Storage path from a full download URL so we can use ref(storage, path). */
function getStoragePathFromUrl(url: string): string | null {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) return trimmed;
  try {
    const parsed = new URL(trimmed);
    const encoded = parsed.pathname.split("/o/")[1];
    if (encoded) return decodeURIComponent(encoded.split("?")[0]);
  } catch {
    // ignore
  }
  return null;
}

/** Delete a file from Firebase Storage by URL; swallows errors. */
async function tryDeleteStorageFile(url: string): Promise<void> {
  const path = getStoragePathFromUrl(url);
  if (!path) return;
  try {
    await deleteObject(storageRef(storage, path));
  } catch {
    // File may already be deleted or URL not ours
  }
}

/** Delete specific history entries by their changedAt millisecond timestamps.
 *  Also deletes from Firebase Storage any file URLs that were in the removed
 *  entries' "from" state and are no longer referenced by the voucher or remaining history. */
export async function deleteHistoryEntries(
  companyId: string,
  voucherId: string,
  changedAtMs: number[]
): Promise<{ success: true }> {
  beginApkLedgerAsyncWriteShield({ pinCompanyId: companyId });
  if (await shouldUseLocalVoucherPipeline(companyId)) {
    // Local-only mode: selected history rows local voucher se remove karo.
    const voucher = await getCompanyDocFromBrowserDb(companyId, "vouchers", voucherId);
    if (!voucher) throw new Error("Voucher not found");
    const existing: any[] = Array.isArray((voucher as any).history) ? (voucher as any).history : [];
    const toDelete = new Set(changedAtMs);
    const tsToMs = (c: any): number | null => {
      if (!c) return null;
      if (c?.toDate instanceof Function) return c.toDate().getTime();
      if (c?._seconds != null) return c._seconds * 1000;
      if (c?.seconds != null) return c.seconds * 1000;
      if (typeof c === "number") return c;
      const p = new Date(c);
      return isNaN(p.getTime()) ? null : p.getTime();
    };
    const filtered = existing.filter((h: any) => {
      const ms = tsToMs(h.changedAt);
      return ms === null || !toDelete.has(ms);
    });
    const payload = removeUndefined({ ...(voucher as any), id: voucherId, history: filtered }) as Record<string, unknown>;
    coerceVoucherDocumentDate(payload);
    await upsertCompanyDocInBrowserDb(companyId, "vouchers", voucherId, payload);
    await enqueueVoucherOutbox(companyId, "update", voucherId, payload);
    return { success: true };
  }
  const voucherRef = doc(firestore, `companies/${companyId}/vouchers`, voucherId);
  const snap = await getDoc(voucherRef);
  if (!snap.exists()) throw new Error("Voucher not found");
  const data = snap.data();
  const existing: any[] = data.history ?? [];
  const toDelete = new Set(changedAtMs);
  const tsToMs = (c: any): number | null => {
    if (!c) return null;
    if (c?.toDate instanceof Function) return c.toDate().getTime();
    if (c?._seconds != null) return c._seconds * 1000;
    if (c?.seconds != null) return c.seconds * 1000;
    if (typeof c === "number") return c;
    const p = new Date(c);
    return isNaN(p.getTime()) ? null : p.getTime();
  };

  const entriesToDelete = existing.filter((h: any) => {
    const ms = tsToMs(h.changedAt);
    return ms !== null && toDelete.has(ms);
  });
  const filtered = existing.filter((h: any) => {
    const ms = tsToMs(h.changedAt);
    return ms === null || !toDelete.has(ms);
  });

  // URLs that were removed in the deleted entries (in "from" but not in "to")
  const candidateDeletedUrls = new Set<string>();
  for (const entry of entriesToDelete) {
    for (const field of ["fileUrls", "fileUrl", "url"]) {
      const change = entry.changes?.[field];
      if (!change) continue;
      const fromUrls = toUrlArray(change.from);
      const toUrls = new Set(toUrlArray(change.to));
      for (const u of fromUrls) {
        if (!toUrls.has(u)) candidateDeletedUrls.add(u);
      }
    }
  }

  if (candidateDeletedUrls.size > 0) {
    const stillReferenced = new Set<string>();
    for (const field of ["fileUrls", "fileUrl", "url"]) {
      for (const u of toUrlArray(data[field])) stillReferenced.add(u);
    }
    for (const entry of filtered) {
      for (const field of ["fileUrls", "fileUrl", "url"]) {
        const change = entry.changes?.[field];
        if (!change) continue;
        for (const u of [...toUrlArray(change.from), ...toUrlArray(change.to)]) {
          stillReferenced.add(u);
        }
      }
    }
    const toDeleteFromStorage = [...candidateDeletedUrls].filter((u) => !stillReferenced.has(u));
    if (toDeleteFromStorage.length > 0) {
      await deleteFirebaseStorageUrlsWithRegistry(companyId, toDeleteFromStorage);
    }
  }

  await updateDoc(voucherRef, { history: filtered });
  await mirrorVoucherDocToBrowserDb(companyId, voucherId);
  return { success: true };
}
