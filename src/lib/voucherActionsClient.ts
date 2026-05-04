"use client";

import {
  doc,
  getDoc,
  updateDoc,
  addDoc,
  collection,
  serverTimestamp,
  setDoc,
  query,
  where,
  getDocs,
  Timestamp,
  runTransaction,
} from "firebase/firestore";
import { auth, firestore, storage } from "@/lib/firebase";
import { ref as storageRef, deleteObject } from "firebase/storage";
import { moveFilesToVoucherDateClient } from "./storageClient";
import { getCompanyDocFromBrowserDb, mirrorVoucherDocToBrowserDb, upsertCompanyDocInBrowserDb } from "@/lib/localCompanyDocMirror";
import {
  enqueueVoucherOutbox,
  isLikelyOfflineFirestoreError,
  canSyncCompanyToServer,
  removeOutboxRowsForCompanyDoc,
  flushVoucherOutbox,
} from "@/lib/localVoucherOutbox";
import { coerceVoucherDocumentDate } from "@/lib/voucherDateNormalize";
import { getPlan, numericEntitlement, companyStorageIsLocal, type Entitlements, type PlanId } from "@/config/plans";
import { getPlanFromPlans } from "@/hooks/useLivePlans";
import { readCachedPlansRecord, defaultPlansRecordFallback } from "@/lib/plansCatalogCache";
import { getLocalCompanyById, listLocalCompanies } from "@/lib/localCompanyStore";
import { resolvePlanIdForVoucherEnforcement } from "@/lib/companyPlanLocalCache";
import { listCompanyDocsFromBrowserDb } from "@/lib/localCompanyDocMirror";
import { getEffectiveHistorySettings } from "@/lib/voucherHistoryUtils";
import { startOfDay, endOfDay, startOfMonth, endOfMonth } from "date-fns";
import type { Allocation } from "@/lib/payment-allocation-utils";
import { getAllocationTotal, OPENING_BALANCE_VOUCHER_ID } from "@/lib/payment-allocation-utils";
import { isLocalOnlyMode } from "@/lib/localMode";
import { generateLocalVoucherIdForCreate } from "@/lib/localEntityIds";
import { isCompanyNotFoundError } from "@/lib/companyUpdateGuard";
import { LOCAL_MIRROR_META_SERVER_CONFIRMED_KEY, PL_CLIENT_OFFLINE_FIRST_PERSIST_MS } from "@/lib/localMirrorServerMeta";
import { beginApkLedgerAsyncWriteShield } from "@/lib/apkLedgerRouteShield";
import { apkCloudCompanyUsesSqliteFirstWrites } from "@/lib/apkOnlineFirestoreWritePolicy";
import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";
import { isStaticAppBuild } from "@/lib/isStaticAppBuild";

/**
 * Firestore offline error ke baad SQLite/outbox fallback — APK par sirf genuinely local-SQLite-first company (`storageOption: local`).
 * Capacitor + cloud Firebase: queue mat lagao taaki stale redirect race na ho; Electron/web purana `(local || static)` rule.
 */
async function allowLocalFirestoreFailureQueue(companyId: string): Promise<boolean> {
  if (await apkCloudCompanyUsesSqliteFirstWrites(companyId)) return true;
  return !isCapacitorNativeApp() && (isLocalOnlyMode() || isStaticAppBuild());
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

/** Date / Firestore Timestamp / ISO string → JS Date (update path me `new Date(ts)` galat Invalid Date deta tha) */
function toJsDateFromVoucherField(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (value instanceof Timestamp) {
    try {
      const d = value.toDate();
      return isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  }
  if (typeof value === "string" && value.trim()) {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "object" && typeof (value as { toDate?: () => Date }).toDate === "function") {
    try {
      const d = (value as { toDate: () => Date }).toDate();
      return d instanceof Date && !isNaN(d.getTime()) ? d : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Har save par `app_settings/plans` read throttle — voucher create latency kam (Firestore round-trip reuse). */
const mergedPlanEntitlementsCache = new Map<PlanId, { entitlements: Entitlements; cachedAtMs: number }>();
const MERGED_PLAN_ENTITLEMENTS_TTL_MS = 90_000;

/** Admin `app_settings/plans` + default bundle — sirf entitlements (voucher limit checks). */
async function mergePlanEntitlementsForId(planId: PlanId): Promise<Entitlements> {
  const now = Date.now();
  const hit = mergedPlanEntitlementsCache.get(planId);
  if (hit && now - hit.cachedAtMs < MERGED_PLAN_ENTITLEMENTS_TTL_MS) return hit.entitlements;

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

/** SQLite mirror vouchers: `date` field ko day/month window me count karo (cloud query jaisa). */
function countLocalMirrorVouchersInRange(
  vouchers: Array<Record<string, unknown>>,
  start: Date,
  end: Date
): number {
  return vouchers.filter((v) => {
    const raw = v.date;
    let dt: Date | null = null;
    if (raw instanceof Timestamp) dt = raw.toDate();
    else if (raw instanceof Date) dt = raw;
    else if (typeof raw === "string" && raw.trim()) {
      const d = new Date(raw);
      dt = !Number.isNaN(d.getTime()) ? d : null;
    }
    else if (raw && typeof raw === "object" && "toDate" in raw && typeof (raw as { toDate?: () => Date }).toDate === "function") {
      try {
        dt = (raw as { toDate: () => Date }).toDate();
      } catch {
        dt = null;
      }
    }
    if (!dt || Number.isNaN(dt.getTime())) return false;
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
      query(collection(firestore, collPath), where("date", ">=", todayStart), where("date", "<=", todayEnd))
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
      query(collection(firestore, collPath), where("date", ">=", monthStart), where("date", "<=", monthEnd))
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
  partial: Record<string, unknown>
): Promise<void> {
  if (!companyId || !voucherId) throw new Error("Missing companyId or voucherId");
  // APK / static mobile: SQLite+outbox ke beech pathname race — `/dashboard` jump se pehle URL + company pin.
  beginApkLedgerAsyncWriteShield({ pinCompanyId: companyId });
  if (await apkCloudCompanyUsesSqliteFirstWrites(companyId)) {
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

    const reg = await getLocalCompanyById(companyId, { includeDeleted: true });
    const canSync = await canSyncCompanyToServer(companyId);
    const encFlag = Boolean(reg && (reg as Record<string, unknown>).encryptServerBackup === true);

    if (canSync && !encFlag) {
      const fsCompanyId =
        String((reg as Record<string, unknown> | null)?.authoritativeCompanyId || companyId).trim() || companyId;
      // Firestore path: authoritative id (shared / mirror company) — same as updateDoc branch below.
      const voucherFsRef = doc(firestore, `companies/${fsCompanyId}/vouchers`, voucherId);
      try {
        await updateDoc(voucherFsRef, partial);
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
          try {
            await setDoc(voucherFsRef, payload, { merge: true });
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
      await flushVoucherOutbox();
      return;
    }

    await enqueueVoucherOutbox(companyId, "update", voucherId, payload);
    return;
  }
  try {
    await updateDoc(doc(firestore, `companies/${companyId}/vouchers`, voucherId), partial);
  } catch (e) {
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
  deletedByUid: string
): Promise<void> {
  await patchVoucherFields(companyId, voucherId, {
    isDeleted: true,
    deletedAt: voucherRecycleBinDeletedAt(),
    deletedBy: deletedByUid || "",
  });
}

function getChanges(oldData: any, newData: any): Record<string, { from: any; to: any }> {
  const changes: Record<string, { from: any; to: any }> = {};
  const ignoredFields = [
    "history", "createdAt", "updatedAt", "id", "isDeleted",
    "deletedAt", "balance", "credit", "debit",
    "lastEditedByUserName", "lastEditedAt", // added as separate history rows with Old/New
  ];
  const keys = new Set([...Object.keys(oldData || {}), ...Object.keys(newData || {})]);
  keys.forEach((key) => {
    if (ignoredFields.includes(key)) return;
    let oldVal = oldData?.[key];
    let newVal = newData?.[key];
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

    const capitalOpeningBalanceRef = doc(firestore, `companies/${companyId}/parties`, "opening_balance_ledger");
    const capitalOpeningBalanceSnap = await getDoc(capitalOpeningBalanceRef);
    let currentCapitalOB = 0;

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
  preGeneratedVoucherId?: string | null
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
    authUser?.displayName || authUser?.email?.split("@")?.[0] || cleanVoucherData.userDisplayName || null;
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
          changes: {
            created: { from: "N/A", to: "Created" },
            lastEditedByUserName: { from: "N/A", to: creatorDisplayName || userId },
            lastEditedAt: { from: null, to: now },
          },
        },
      ]
    : [];
  const bodyRaw = {
    ...cleanVoucherData,
    companyId,
    userId,
    isApproved: cleanVoucherData.isApproved === true,
    userDisplayName: creatorDisplayName,
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
  await upsertCompanyDocInBrowserDb(companyId, "vouchers", newId, payload);
  await enqueueVoucherOutbox(companyId, "create", newId, payload);
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
  const payload = removeUndefined({
    ...voucher,
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
}

/**
 * Client-only: Save or update voucher. Runs in browser so Firestore uses signed-in user auth (server action has no auth → 500).
 */
export type SaveVoucherApproveOption = { approvedByUserId: string; approvedByName?: string | null };

/** Local create: attachment flow ne `generateLocalVoucherIdForCreate` pehle call kiya ho to yahan pass karo */
export type SaveVoucherOptions = { preGeneratedVoucherId?: string };

export async function saveVoucher(
  companyId: string,
  userId: string,
  voucherData: any,
  voucherId?: string | null,
  approveAfterSave?: SaveVoucherApproveOption,
  options?: SaveVoucherOptions
): Promise<{ id: string }> {
  beginApkLedgerAsyncWriteShield({ pinCompanyId: companyId });
  const cleanVoucherData = removeUndefined(voucherData);
  const voucherPath = `companies/${companyId}/vouchers`;
  /** APK Firebase company: SQLite-first mat — Firestore writes (redirect race mitigation). Local row `storageOption: local` = purana behaviour. */
  const sqliteFirst = await apkCloudCompanyUsesSqliteFirstWrites(companyId);

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
      const dMissing =
        cleanVoucherData.date === undefined ||
        cleanVoucherData.date === null ||
        (typeof cleanVoucherData.date === "string" && String(cleanVoucherData.date).trim() === "");
      if (dMissing && oldRow?.date != null) {
        cleanVoucherData.date = oldRow.date as any;
      }
    } catch {
      /* offline / permission: merge skip — niche coerce fallback */
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

  if (sqliteFirst) {
    // Static local-first: voucher writes ko direct Firebase pe mat bhejo; only local + outbox.
    if (!voucherRef) {
      return saveVoucherOfflineLocalCreate(
        companyId,
        userId,
        cleanVoucherData,
        voucherPath,
        options?.preGeneratedVoucherId ?? null
      );
    }
    const resolvedExisting = await resolveVoucherSnapshotForLocalWrite(companyId, voucherId!);
    const existingLocal = resolvedExisting?.voucher ?? null;
    const writeCompanyIdLocal = resolvedExisting?.writeCompanyId ?? companyId;
    const nowTs = Timestamp.now();
    const mergedLocal = removeUndefined({
      ...(existingLocal || {}),
      ...cleanVoucherData,
      id: voucherId!,
      companyId,
      userId: (existingLocal as any)?.userId ?? userId,
      lastEditedBy: userId,
      lastEditedByUserName: auth.currentUser?.displayName || auth.currentUser?.email?.split("@")?.[0] || userId,
      lastEditedAt: nowTs,
      updatedAt: nowTs,
    }) as Record<string, unknown>;
    coerceVoucherDocumentDate(mergedLocal);
    await upsertCompanyDocInBrowserDb(writeCompanyIdLocal, "vouchers", voucherId!, mergedLocal);
    await enqueueVoucherOutbox(writeCompanyIdLocal, "update", voucherId!, mergedLocal);
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
      authUser?.displayName ||
      authUser?.email?.split("@")?.[0] ||
      cleanVoucherData.userDisplayName ||
      null;
    const creatorEmail = authUser?.email || cleanVoucherData.userEmail || null;
    const isOwnerCreator = companyData?.ownerId === userId;

    const { enabled: historyEnabled } = await getEffectiveHistorySettings(companyId);
    const now = new Date();
    const initialHistory = historyEnabled
      ? [{ changedAt: now, changedBy: userId, changes: { created: { from: "N/A", to: "Created" }, lastEditedByUserName: { from: "N/A", to: creatorDisplayName || userId }, lastEditedAt: { from: null, to: now } } }]
      : [];
    const docRef = await addDoc(collection(firestore, voucherPath), {
      ...cleanVoucherData,
      companyId,
      userId,
      isApproved: isOwnerCreator ? true : (cleanVoucherData.isApproved ?? false),
      userDisplayName: creatorDisplayName,
      userEmail: creatorEmail,
      lastEditedByUserName: creatorDisplayName || userId,
      lastEditedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      history: initialHistory,
    });
    const newId = docRef.id;

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
        options?.preGeneratedVoucherId ?? null
      );
    }
  }

  const oldSnap = await getDoc(voucherRef).catch(() => null);
  let oldData: any;
  if (oldSnap?.exists()) {
    oldData = oldSnap.data();
  } else {
    const loc = await getCompanyDocFromBrowserDb(companyId, "vouchers", voucherId!);
    if (!loc || typeof loc !== "object") throw new Error("Voucher not found");
    oldData = loc;
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
    const filesToMove = (oldData as any)?.files || [];
    if (Array.isArray(filesToMove) && filesToMove.length > 0) {
      const companySnap = await getDoc(doc(firestore, "companies", companyId));
      const companyName = companySnap.data()?.name;
      const moveResult = await moveFilesToVoucherDateClient({
        companyId,
        companyName,
        voucherType: vType,
        voucherDate: newDate,
        voucherId: voucherRef.id,
        files: filesToMove.map((f: any) => ({ oldPath: f.storagePath, fileName: f.name })),
      });
      if (moveResult?.success && Array.isArray(moveResult.moved)) {
        movedFileObjects = moveResult.moved.map((m: any) => ({
          url: m.url,
          storagePath: m.newPath ?? "",
          name: m.newPath ? m.newPath.split("/").pop() : "",
        }));
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
  const updatePayload: any = {
    ...cleanVoucherData,
    lastEditedBy: userId,
    lastEditedByUserName: currentUserName,
    lastEditedAt: localTs,
    updatedAt: localTs,
    history: newHistory,
  };
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
    await updateDoc(voucherRef, fireUpdate);
  } catch (e) {
    // Static/hybrid: offline queue; APK Firebase company par allowLocalFirestoreFailureQueue false ho to throw
    const queueLocalStale = isLikelyOfflineFirestoreError(e) && (await allowLocalFirestoreFailureQueue(companyId));
    if (!queueLocalStale) throw e;
    const { id: _oldId, ...oldRest } = oldData as Record<string, unknown>;
    const forLocal = removeUndefined({
      id: voucherRef.id,
      ...oldRest,
      ...updatePayload,
    }) as Record<string, unknown>;
    coerceVoucherDocumentDate(forLocal);
    await upsertCompanyDocInBrowserDb(companyId, "vouchers", voucherRef.id, forLocal);
    await enqueueVoucherOutbox(companyId, "update", voucherRef.id, forLocal);
    return { id: voucherRef.id };
  }
  await mirrorVoucherDocToBrowserDb(companyId, voucherRef.id);
  return { id: voucherRef.id };
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
  if (await apkCloudCompanyUsesSqliteFirstWrites(companyId)) {
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
    return;
  }
  const voucherRef = doc(firestore, `companies/${companyId}/vouchers`, voucherId);
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
    return;
  }
  await mirrorVoucherDocToBrowserDb(companyId, voucherId);
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
  // Multi-doc allocation sync — APK par turant-heavy write burst; ledger shield ek hi entry se arm
  beginApkLedgerAsyncWriteShield({ pinCompanyId: companyId });
  if (await apkCloudCompanyUsesSqliteFirstWrites(companyId)) {
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

  if (await apkCloudCompanyUsesSqliteFirstWrites(companyId)) {
    await approveVoucherLocalPersist(companyId, voucherId, approvedByUserId, approvedByName);
    return;
  }
  const voucherRef = doc(firestore, `companies/${companyId}/vouchers`, voucherId);
  const { enabled: historyEnabled, limit: historyLimit } = await getEffectiveHistorySettings(companyId);

  try {
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

      tx.update(voucherRef, {
        isApproved: true,
        approvedByUserId: approvedByUserId,
        approvedByUserName: approverName,
        approvedAt: serverTimestamp(),
        history: newHistory,
      });
    });
  } catch (e) {
    // `saveVoucher` jaisa: APK + Firestore company par offline queue mat — seedha throw (allowLocalFirestoreFailureQueue false).
    if (!isLikelyOfflineFirestoreError(e)) throw e;
    if (!(await allowLocalFirestoreFailureQueue(companyId))) throw e;
    await approveVoucherLocalPersist(companyId, voucherId, approvedByUserId, approvedByName);
    return;
  }
  await mirrorVoucherDocToBrowserDb(companyId, voucherId);
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
  if (await apkCloudCompanyUsesSqliteFirstWrites(companyId)) {
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
    await Promise.all(toDeleteFromStorage.map((url) => tryDeleteStorageFile(url)));
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
  if (await apkCloudCompanyUsesSqliteFirstWrites(companyId)) {
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
    await Promise.all(toDeleteFromStorage.map((url) => tryDeleteStorageFile(url)));
  }

  await updateDoc(voucherRef, { history: filtered });
  await mirrorVoucherDocToBrowserDb(companyId, voucherId);
  return { success: true };
}
