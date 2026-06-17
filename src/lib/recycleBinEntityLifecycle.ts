"use client";

/**
 * Local + Drive companies: voucher/master soft-delete → SQLite bin + cloud_sync op;
 * permanent delete → SQLite row + Drive attachments + `plPermanentlyPurged` op (doosre devices).
 */

import { Timestamp, deleteDoc, doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { firestore, auth } from "@/lib/firebase";
import { isLocalOnlyMode } from "@/lib/localMode";
import { remotePathFromDriveFileRef, isDriveFileRef } from "@/lib/legacyDriveFileRef";
import type { DeletedItem } from "@/components/recycle-bin/RecycleBinItem";
import {
  deleteCompanyDocFromBrowserDb,
  getCompanyDocFromBrowserDb,
  listCompanyDocsFromBrowserDb,
} from "@/lib/localCompanyDocMirror";
import { getLocalCompanyById } from "@/lib/localCompanyStore";
import { coerceDeletedAtToDate } from "@/lib/coerceDeletedAt";
import { isLocalFileRef, removePendingFile } from "@/lib/localPendingFiles";
import { writeEntity, type WriteEntityResult } from "@/lib/writeGateway";
import { patchVoucherFields, softDeleteVoucherMoveToRecycleBin } from "@/lib/writeGateway/voucherActionsClient";
import { purgeInterCompanyCounterpartyPartyIfUnused } from "@/lib/interCompany/cleanupInterCompanyCounterpartyParty";

/** Drive/cloud_sync permanent delete marker — remote device SQLite row hard-remove kare. */
export const PL_PERMANENT_PURGE_KEY = "plPermanentlyPurged";

export function isPermanentPurgePayload(payload: Record<string, unknown> | null | undefined): boolean {
  return payload?.[PL_PERMANENT_PURGE_KEY] === true;
}

/** Soft-delete timestamp — APK/local JSON-safe `Timestamp.now()`, web `serverTimestamp()`. */
export function recycleBinDeletedAt(): InstanceType<typeof Timestamp> | ReturnType<typeof serverTimestamp> {
  return isLocalOnlyMode() ? Timestamp.now() : serverTimestamp();
}

/** Recycle bin list SQLite se bhi load karni hai (Firestore empty ho sakta hai local+Drive par). */
export async function companyUsesSqliteRecycleBinSource(companyId: string): Promise<boolean> {
  const cid = String(companyId || "").trim();
  if (!cid) return false;
  if (isLocalOnlyMode()) return true;
  const reg = await getLocalCompanyById(cid, { includeDeleted: true });
  return String((reg as { storageOption?: string } | null)?.storageOption || "").toLowerCase() === "local";
}

export type RecycleBinCollectionMeta = {
  path: string;
  nameField: string;
  type: string;
};

/** SQLite `company_docs` se `isDeleted` rows → recycle bin UI items. */
export async function listDeletedSubdocsFromSqlite(
  companyId: string,
  collections: RecycleBinCollectionMeta[]
): Promise<DeletedItem[]> {
  const cid = String(companyId || "").trim();
  if (!cid) return [];
  const out: DeletedItem[] = [];
  for (const coll of collections) {
    const rows = await listCompanyDocsFromBrowserDb(cid, coll.path, { includeSoftDeleted: true });
    for (const data of rows) {
      if (data?.isDeleted !== true) continue;
      if (data.movedToAdminRecycleAt) continue;
      const item: DeletedItem = {
        id: String(data.id || ""),
        name:
          String(data[coll.nameField] ?? "") ||
          String(data.title ?? "") ||
          (coll.path === "vouchers" ? `Voucher ${data.voucherNumber ?? ""}` : "Unnamed"),
        type: coll.type,
        deletedAt: coerceDeletedAtToDate(data.deletedAt) ?? undefined,
        collectionPath: coll.path,
        convertedToType: data.convertedToType as string | undefined,
        convertedToVoucherNumber: data.convertedToVoucherNumber as string | undefined,
      };
      if (coll.path === "vouchers") {
        item.voucherNumber = data.voucherNumber as string | undefined;
        const rawDate = data.date;
        item.date =
          rawDate && typeof rawDate === "object" && "toDate" in (rawDate as object) && typeof (rawDate as { toDate: () => Date }).toDate === "function"
            ? (rawDate as { toDate: () => Date }).toDate()
            : rawDate instanceof Date
              ? rawDate
              : rawDate
                ? new Date(rawDate as string | number)
                : null;
        item.accountId = data.accountId as string | undefined;
        item.fromAccountId = data.fromAccountId as string | undefined;
        item.toAccountId = data.toAccountId as string | undefined;
        item.userId = data.userId as string | undefined;
        item.deletedBy = (data.deletedBy as string | undefined) || (data.userId as string | undefined);
      }
      if (item.id) out.push(item);
    }
  }
  return out;
}

/** Voucher / master / item → recycle bin (soft delete), sab devices par `isDeleted` sync. */
export async function softDeleteCompanySubdocToRecycleBin(
  companyId: string,
  collectionName: string,
  docId: string,
  deletedByUid: string
): Promise<WriteEntityResult> {
  const cid = String(companyId || "").trim();
  const id = String(docId || "").trim();
  if (!cid || !id) return { ok: false, error: "Missing companyId or docId" };
  if (collectionName === "vouchers") {
    await softDeleteVoucherMoveToRecycleBin(cid, id, deletedByUid);
    return { ok: true, docId: id };
  }
  const patch = {
    isDeleted: true,
    deletedAt: recycleBinDeletedAt(),
    deletedBy: deletedByUid || auth.currentUser?.uid || "",
  };
  const res = await writeEntity({
    companyId: cid,
    collectionName,
    docId: id,
    operation: "update",
    data: patch,
  });
  if (!res.ok) return res;
  const reg = await getLocalCompanyById(cid, { includeDeleted: true });
  const fsId = String((reg as { authoritativeCompanyId?: string } | null)?.authoritativeCompanyId || cid).trim();
  try {
    await updateDoc(doc(firestore, `companies/${fsId}/${collectionName}`, id), patch);
  } catch {
    /* Firestore row optional on pure local+Drive */
  }
  return res;
}

/** Bin se restore — SQLite + Firestore (agar doc ho) + cloud_sync update. */
export async function restoreCompanySubdocFromRecycleBin(
  companyId: string,
  collectionPath: string,
  docId: string
): Promise<void> {
  const cid = String(companyId || "").trim();
  const id = String(docId || "").trim();
  if (!cid || !id) throw new Error("Missing company or document id");
  const patch = { isDeleted: false, deletedAt: null, deletedBy: null };
  if (collectionPath === "vouchers") {
    await patchVoucherFields(cid, id, patch);
  } else {
    const res = await writeEntity({
      companyId: cid,
      collectionName: collectionPath,
      docId: id,
      operation: "update",
      data: patch,
    });
    if (!res.ok) throw new Error("error" in res ? res.error : "restore failed");
  }
  const reg = await getLocalCompanyById(cid, { includeDeleted: true });
  const fsId = String((reg as { authoritativeCompanyId?: string } | null)?.authoritativeCompanyId || cid).trim();
  try {
    await updateDoc(doc(firestore, `companies/${fsId}/${collectionPath}`, id), patch);
  } catch {
    /* Firestore row optional on pure local+Drive */
  }
}

function collectFirebaseStoragePaths(data: Record<string, unknown>): string[] {
  const paths: string[] = [];
  if (Array.isArray(data.filePaths)) paths.push(...(data.filePaths as string[]));
  if (typeof data.storagePath === "string") paths.push(data.storagePath);
  if (typeof data.path === "string") paths.push(data.path);
  if (Array.isArray(data.fileUrls)) {
    for (const u of data.fileUrls as unknown[]) {
      if (typeof u === "string" && (u.startsWith("http://") || u.startsWith("https://"))) paths.push(u);
    }
  }
  return paths;
}

function resolveFirebaseStoragePath(filePath: string): string | null {
  const trimmed = filePath.trim();
  if (!trimmed) return null;
  try {
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      const url = new URL(trimmed);
      const encoded = url.pathname.split("/o/")[1];
      if (encoded) return decodeURIComponent(encoded.split("?")[0]);
    }
    if (trimmed.startsWith("companies/")) return trimmed;
    return trimmed;
  } catch {
    return null;
  }
}

/** Firebase Storage attachments (online companies) — ref-count aware when registry enabled. */
export async function deleteFirebaseStorageFilesForDoc(
  data: Record<string, unknown>,
  companyId?: string
): Promise<void> {
  const urls: string[] = [];
  for (const filePath of collectFirebaseStoragePaths(data)) {
    const trimmed = filePath.trim();
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      urls.push(trimmed);
    }
  }
  const cid = String(companyId || "").trim();
  if (cid && urls.length > 0) {
    const { deleteFirebaseStorageUrlsWithRegistry } = await import("@/lib/companyAttachmentRegistry");
    await deleteFirebaseStorageUrlsWithRegistry(cid, urls);
    return;
  }
  const { ref, deleteObject } = await import("firebase/storage");
  const { storage } = await import("@/lib/firebase");
  for (const filePath of collectFirebaseStoragePaths(data)) {
    const storagePath = resolveFirebaseStoragePath(filePath);
    if (!storagePath) continue;
    try {
      await deleteObject(ref(storage, storagePath));
    } catch {
      /* already gone */
    }
  }
}

/** Walk doc payload for `local:` / legacy `drive:` attachment refs. */
function collectAttachmentFileRefsFromValue(value: unknown, bucket: Set<string>): void {
  if (typeof value === "string") {
    if (isLocalFileRef(value) || isDriveFileRef(value)) bucket.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectAttachmentFileRefsFromValue(v, bucket);
    return;
  }
  if (value && typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      collectAttachmentFileRefsFromValue(v, bucket);
    }
  }
}

/** Cloud sync removed — legacy drive refs are not deleted remotely. */
export async function deleteDriveAttachmentRefsForDoc(_companyId: string, _data: Record<string, unknown>): Promise<void> {
  return;
}

/** Pending `local:` attachment bytes — permanent delete par cleanup. */
export async function removeLocalPendingRefsFromDoc(data: Record<string, unknown>): Promise<void> {
  const refs = new Set<string>();
  collectAttachmentFileRefsFromValue(data, refs);
  for (const refStr of refs) {
    if (!isLocalFileRef(refStr)) continue;
    const localId = refStr.slice("local:".length).trim();
    if (!localId) continue;
    try {
      await removePendingFile(localId);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Bin se permanent delete — local SQLite, Drive files, Firestore (optional), doosre devices par purge op.
 */
export async function permanentDeleteCompanySubdocFromRecycleBin(
  companyId: string,
  collectionPath: string,
  docId: string
): Promise<void> {
  const cid = String(companyId || "").trim();
  const id = String(docId || "").trim();
  if (!cid || !id) throw new Error("Missing company or document id");

  const localRow = (await getCompanyDocFromBrowserDb(cid, collectionPath, id)) as Record<string, unknown> | null;
  const reg = await getLocalCompanyById(cid, { includeDeleted: true });
  const fsId = String((reg as { authoritativeCompanyId?: string } | null)?.authoritativeCompanyId || cid).trim();
  let data: Record<string, unknown> = localRow ? { ...localRow } : {};
  try {
    const snap = await getDoc(doc(firestore, `companies/${fsId}/${collectionPath}`, id));
    if (snap.exists()) data = { ...data, ...(snap.data() as Record<string, unknown>) };
  } catch {
    /* optional */
  }

  await removeLocalPendingRefsFromDoc(data);
  await deleteDriveAttachmentRefsForDoc(cid, data);
  await deleteFirebaseStorageFilesForDoc(data, cid);

  await deleteCompanyDocFromBrowserDb(cid, collectionPath, id, { force: true, notify: true });

  try {
    await deleteDoc(doc(firestore, `companies/${fsId}/${collectionPath}`, id));
  } catch {
    /* pure local row */
  }

  if (collectionPath === "vouchers" && String(data.type || "") === "inter_company") {
    const partyId = String(data.interCompanyCounterpartyPartyId || "").trim();
    if (partyId) {
      try {
        await purgeInterCompanyCounterpartyPartyIfUnused({
          companyId: cid,
          partyId,
        });
      } catch (err) {
        console.warn("[IC] counterparty party cleanup after permanent delete:", err);
      }
    }
  }
}
