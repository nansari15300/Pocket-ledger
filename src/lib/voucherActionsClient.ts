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
import { getPlan, type PlanId } from "@/config/plans";
import { startOfDay, endOfDay, startOfMonth, endOfMonth } from "date-fns";

function removeUndefined(obj: any): any {
  if (Array.isArray(obj)) return obj.map(removeUndefined);
  if (obj !== null && typeof obj === "object") {
    if (obj instanceof Date || (obj && "toDate" in obj && typeof obj.toDate === "function")) return obj;
    return Object.keys(obj).reduce((acc: any, key) => {
      const value = obj[key];
      if (value !== undefined) acc[key] = removeUndefined(value);
      return acc;
    }, {});
  }
  return obj;
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
      const oldTime = oldVal instanceof Date ? oldVal.toISOString() : oldVal.toDate().toISOString();
      const newTime = newVal instanceof Date ? newVal.toISOString() : new Date(newVal).toISOString();
      if (oldTime !== newTime) changes[key] = { from: oldData?.[key] ?? null, to: newData?.[key] ?? null };
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
 * Client-only: Save or update voucher. Runs in browser so Firestore uses signed-in user auth (server action has no auth → 500).
 */
export type SaveVoucherApproveOption = { approvedByUserId: string; approvedByName?: string | null };

export async function saveVoucher(
  companyId: string,
  userId: string,
  voucherData: any,
  voucherId?: string | null,
  approveAfterSave?: SaveVoucherApproveOption
): Promise<{ id: string }> {
  const cleanVoucherData = removeUndefined(voucherData);
  const voucherPath = `companies/${companyId}/vouchers`;
  const voucherRef = voucherId ? doc(firestore, voucherPath, voucherId) : null;

  if (typeof cleanVoucherData.date === "string") cleanVoucherData.date = new Date(cleanVoucherData.date);
  if (cleanVoucherData.lineItems) {
    if (cleanVoucherData.type === "sale_service" || cleanVoucherData.type === "sale") cleanVoucherData.type = "sale";
    else if (cleanVoucherData.type === "purchase_service" || cleanVoucherData.type === "purchase") cleanVoucherData.type = "purchase";
    else if (!cleanVoucherData.type) cleanVoucherData.type = "sale";
  }

  if (!voucherRef) {
    const companySnap = await getDoc(doc(firestore, "companies", companyId));
    const companyData = companySnap.data() || {};
    const planId = (companyData?.planId as PlanId) || "basic";
    const defaultPlan = getPlan(planId);
    const plansSnap = await getDoc(doc(firestore, "app_settings", "plans"));
    const plansData = plansSnap.exists() ? plansSnap.data() : {};
    const fromFs = plansData[planId];
    const plan = fromFs
      ? { ...defaultPlan, ...fromFs, entitlements: { ...defaultPlan.entitlements, ...(fromFs.entitlements || {}) } }
      : defaultPlan;
    const dailyLimit = (plan.entitlements.dailyVoucherLimit as number) ?? 0;
    const monthlyLimit = (plan.entitlements.monthlyVoucherLimit as number) ?? 0;
    if (dailyLimit > 0) {
      const todayStart = Timestamp.fromDate(startOfDay(new Date()));
      const todayEnd = Timestamp.fromDate(endOfDay(new Date()));
      const dailySnap = await getDocs(
        query(
          collection(firestore, voucherPath),
          where("date", ">=", todayStart),
          where("date", "<=", todayEnd)
        )
      );
      if (dailySnap.size >= dailyLimit) {
        const err = new Error(`Daily voucher limit reached (${dailyLimit}). Upgrade your plan for more.`) as Error & { isVoucherLimit?: boolean };
        err.isVoucherLimit = true;
        throw err;
      }
    }
    if (monthlyLimit > 0) {
      const monthStart = Timestamp.fromDate(startOfMonth(new Date()));
      const monthEnd = Timestamp.fromDate(endOfMonth(new Date()));
      const monthlySnap = await getDocs(
        query(
          collection(firestore, voucherPath),
          where("date", ">=", monthStart),
          where("date", "<=", monthEnd)
        )
      );
      if (monthlySnap.size >= monthlyLimit) {
        const err = new Error(`Monthly voucher limit reached (${monthlyLimit}). Upgrade your plan for more.`) as Error & { isVoucherLimit?: boolean };
        err.isVoucherLimit = true;
        throw err;
      }
    }
    const authUser = auth.currentUser;
    const creatorDisplayName =
      authUser?.displayName ||
      authUser?.email?.split("@")?.[0] ||
      cleanVoucherData.userDisplayName ||
      null;
    const creatorEmail = authUser?.email || cleanVoucherData.userEmail || null;
    const isOwnerCreator = companyData?.ownerId === userId;

    const now = new Date();
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
      history: [
        {
          changedAt: now,
          changedBy: userId,
          changes: {
            created: { from: "N/A", to: "Created" },
            lastEditedByUserName: { from: "N/A", to: creatorDisplayName || userId },
            lastEditedAt: { from: null, to: now },
          },
        },
      ],
    });
    const newId = docRef.id;

    const uf = cleanVoucherData.unassignedFile as { id?: string; url?: string; path?: string; name?: string } | undefined;
    if (uf?.path && uf?.name && typeof uf.path === "string" && typeof uf.name === "string") {
      const voucherType = cleanVoucherData.type || "sale";
      const voucherDate = cleanVoucherData.date instanceof Date ? cleanVoucherData.date : new Date(cleanVoucherData.date);
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
    return { id: newId };
  }

  const oldSnap = await getDoc(voucherRef);
  if (!oldSnap.exists()) throw new Error("Voucher not found");
  const oldData = oldSnap.data();
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

  const oldDate =
    oldData?.date && typeof (oldData as any).date?.toDate === "function"
      ? (oldData as any).date.toDate()
      : new Date((oldData as any)?.date);
  const newDate = cleanVoucherData?.date instanceof Date ? cleanVoucherData.date : new Date(cleanVoucherData?.date);
  const oldStamp = oldDate?.toISOString?.().slice(0, 10);
  const newStamp = newDate?.toISOString?.().slice(0, 10);
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
          storagePath: m.newPath,
          name: m.newPath.split("/").pop(),
        }));
      }
    }
  }

  const now = new Date();
  const currentUserName = auth.currentUser?.displayName || auth.currentUser?.email?.split("@")?.[0] || userId;
  const existingHistory = Array.isArray((oldData as any)?.history) ? (oldData as any).history : [];
  // Old: use saved name, or previous entry's editor UID (so history can show name for old vouchers)
  const previousEditor = (oldData as any)?.lastEditedByUserName || (existingHistory[0] as any)?.changedBy || "N/A";
  changedFields.lastEditedByUserName = { from: previousEditor, to: currentUserName };
  changedFields.lastEditedAt = { from: (oldData as any)?.lastEditedAt ?? (oldData as any)?.updatedAt ?? null, to: now };

  const newEntry = { changedAt: now, changedBy: userId, changes: changedFields };
  const newHistory = [newEntry, ...existingHistory].slice(0, 10);
  const updatePayload: any = {
    ...cleanVoucherData,
    lastEditedBy: userId,
    lastEditedByUserName: currentUserName,
    lastEditedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    history: newHistory,
  };
  if (approveAfterSave) {
    updatePayload.isApproved = true;
    updatePayload.approvedByUserId = approveAfterSave.approvedByUserId;
    updatePayload.approvedByUserName = approveAfterSave.approvedByName ?? approveAfterSave.approvedByUserId;
    updatePayload.approvedAt = serverTimestamp();
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
  await updateDoc(voucherRef, updatePayload);
  return { id: voucherRef.id };
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

  const voucherRef = doc(firestore, `companies/${companyId}/vouchers`, voucherId);

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

    const newHistory = [approvalEntry, ...existingHistory].slice(0, 10);

    tx.update(voucherRef, {
      isApproved: true,
      approvedByUserId: approvedByUserId,
      approvedByUserName: approverName,
      approvedAt: serverTimestamp(),
      history: newHistory,
    });
  });
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
  return { success: true };
}
