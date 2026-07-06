"use client";

/**
 * Party / Bank / Staff / Item: offline/local = IndexedDB + `local:uuid` + `syncPendingFiles`.
 * Online `uploadEntityAvatarAndDocumentsRemote` — turant Storage URL Firestore me (dusre device par turant kaam).
 */
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase";
import { isOfflineCompanyStorage } from "@/lib/companyUnlockGate";
import { getLocalCompanyById } from "@/lib/localCompanyStore";
import { generateLocalFileId, LOCAL_FILE_PREFIX, putPendingFile, removePendingFile } from "@/lib/localPendingFiles";
import { resolveAuthoritativeFirestoreCompanyId } from "@/lib/resolveAuthoritativeFirestoreCompanyId";
import {
  isEligibleLocalDriveSyncCompanyRow,
  shouldUseLocalCloudSync,
} from "@/lib/localCloudSync/companyConfig";
import { uploadPendingAttachmentPayloadToDrive } from "@/lib/localCloudSync/driveCloudSyncClient";
import { compressVoucherAttachment, DRIVE_ATTACHMENT_MAX_BYTES } from "@/lib/compression";

async function compressEntityProfileFileForPending(file: File): Promise<{
  blob: Blob;
  contentType: string;
  fileName: string;
}> {
  const compressed = await compressVoucherAttachment(file, DRIVE_ATTACHMENT_MAX_BYTES);
  return {
    blob: compressed,
    contentType: compressed.type || file.type || "application/octet-stream",
    fileName: compressed.name || file.name,
  };
}

/** Drive sync ON: save ke turant baad avatar/doc upload — `local:` stale na rahe, shared users `drive:` se load karein. */
async function tryImmediateDriveUploadForStagedEntityFile(params: {
  companyId: string;
  collectionSeg: EntityProfileCollection | "items";
  entityId: string;
  field: string;
  localId: string;
  blob: Blob;
  contentType: string;
  fileName: string;
}): Promise<string | null> {
  const cid = String(params.companyId || "").trim();
  if (!cid || !(await shouldUseLocalCloudSync(cid))) return null;
  try {
    const reg = await getLocalCompanyById(cid, { includeDeleted: true });
    const driveRef = await uploadPendingAttachmentPayloadToDrive({
      companyId: cid,
      companyName: typeof reg?.name === "string" ? reg.name : undefined,
      company: (reg ?? null) as Record<string, unknown> | null,
      collection: params.collectionSeg,
      docId: params.entityId,
      field: params.field,
      blob: params.blob,
      contentType: params.contentType,
      fileName: params.fileName,
    });
    if (driveRef?.trim()) {
      try {
        await removePendingFile(params.localId);
      } catch {
        /* pending cleanup best-effort */
      }
      return driveRef.trim();
    }
  } catch (e) {
    console.warn("[entityProfile] immediate Drive upload failed — keeping local: pending ref", e);
  }
  return null;
}

/** Local company — avatar/docs Firebase Storage par nahi; `local:` + Google Drive sync. */
export async function shouldStageEntityProfileFilesLocally(
  companyId: string,
  company?: { storageOption?: string } | null
): Promise<boolean> {
  const cid = String(companyId || "").trim();
  if (!cid) return false;
  if (company && isOfflineCompanyStorage(company)) return true;
  if (await shouldUseLocalCloudSync(cid)) return true;
  const reg = await getLocalCompanyById(cid, { includeDeleted: true });
  if (!reg) return false;
  if (isOfflineCompanyStorage(reg as { storageOption?: string })) return true;
  return isEligibleLocalDriveSyncCompanyRow(reg);
}

function safeEntityFileName(name: string | undefined): string {
  if (!name?.trim()) return "file";
  return name
    .trim()
    .replace(/[^\w.\-() ]+/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 120);
}

/** Offline staging path segment — Firebase +IndexedDB pending files */
export type EntityProfileCollection = "parties" | "bank_accounts" | "staff" | "taxes" | "expense_accounts";

const DEFAULT_MAX_ENTITY_DOCS = 5;

/** Profile photo — sirf image (ppic). */
export function isProfileAvatarImageFile(file: File): boolean {
  const t = (file.type || "").toLowerCase();
  if (t.startsWith("image/")) return true;
  const n = file.name.toLowerCase();
  return /\.(jpe?g|png|gif|webp|bmp|svg)$/.test(n);
}

/** Dusra section — image ya PDF. */
export function isProfileDocumentFile(file: File): boolean {
  const t = (file.type || "").toLowerCase();
  if (t.startsWith("image/") || t === "application/pdf") return true;
  const n = file.name.toLowerCase();
  return /\.(jpe?g|png|gif|webp|bmp|pdf)$/.test(n);
}

export async function stageEntityAvatarAndDocuments(params: {
  companyId: string;
  collectionSeg: EntityProfileCollection;
  entityId: string;
  avatarFile: File | null;
  documentFiles: File[];
  maxDocuments?: number;
}): Promise<{ fileUrl: string | null; documentFileUrls: string[] }> {
  const { companyId, collectionSeg, entityId, avatarFile, documentFiles } = params;
  const maxDocuments = params.maxDocuments ?? DEFAULT_MAX_ENTITY_DOCS;
  const documentFileUrls: string[] = [];
  const stageLocally = await shouldStageEntityProfileFilesLocally(companyId);
  const fsCompanyId = await resolveAuthoritativeFirestoreCompanyId(companyId);
  const docCompanyId = stageLocally ? String(companyId || "").trim() : fsCompanyId;
  const basePath = `companies/${docCompanyId}/${collectionSeg}/${entityId}`;
  const prefix = `companies/${fsCompanyId}/${collectionSeg.replace(/_/g, "-")}-files`;

  let fileUrl: string | null = null;
  if (avatarFile && isProfileAvatarImageFile(avatarFile)) {
    const id = generateLocalFileId();
    const staged = await compressEntityProfileFileForPending(avatarFile);
    await putPendingFile({
      id,
      blob: staged.blob,
      contentType: staged.contentType,
      docPath: basePath,
      field: "fileUrl",
      storagePathPrefix: `${prefix}/avatar`,
      fileName: staged.fileName,
    });
    const driveRef = await tryImmediateDriveUploadForStagedEntityFile({
      companyId,
      collectionSeg,
      entityId,
      field: "fileUrl",
      localId: id,
      blob: staged.blob,
      contentType: staged.contentType,
      fileName: staged.fileName,
    });
    fileUrl = driveRef ?? `${LOCAL_FILE_PREFIX}${id}`;
  }

  for (const f of documentFiles) {
    if (documentFileUrls.length >= maxDocuments) break;
    if (!isProfileDocumentFile(f)) continue;
    const id = generateLocalFileId();
    const staged = await compressEntityProfileFileForPending(f);
    await putPendingFile({
      id,
      blob: staged.blob,
      contentType: staged.contentType,
      docPath: basePath,
      field: "documentFileUrls",
      storagePathPrefix: `${prefix}/documents`,
      fileName: staged.fileName,
    });
    const driveRef = await tryImmediateDriveUploadForStagedEntityFile({
      companyId,
      collectionSeg,
      entityId,
      field: "documentFileUrls",
      localId: id,
      blob: staged.blob,
      contentType: staged.contentType,
      fileName: staged.fileName,
    });
    documentFileUrls.push(driveRef ?? `${LOCAL_FILE_PREFIX}${id}`);
  }
  return { fileUrl, documentFileUrls };
}

/** Online Firebase company: Storage URL; local/Drive company par hamesha `stageEntityAvatarAndDocuments`. */
export async function uploadEntityAvatarAndDocumentsRemote(params: {
  companyId: string;
  collectionSeg: EntityProfileCollection;
  /** Future path scoping; storage prefix me company se hi enough hai */
  entityId: string;
  avatarFile: File | null;
  documentFiles: File[];
  maxDocuments?: number;
}): Promise<{ fileUrl: string | null; documentFileUrls: string[] }> {
  if (await shouldStageEntityProfileFilesLocally(params.companyId)) {
    return stageEntityAvatarAndDocuments(params);
  }
  const { companyId, collectionSeg, avatarFile, documentFiles } = params;
  const maxDocuments = params.maxDocuments ?? DEFAULT_MAX_ENTITY_DOCS;
  const documentFileUrls: string[] = [];
  const fsCompanyId = await resolveAuthoritativeFirestoreCompanyId(companyId);
  const prefix = `companies/${fsCompanyId}/${collectionSeg.replace(/_/g, "-")}-files`;

  let fileUrl: string | null = null;
  if (avatarFile && isProfileAvatarImageFile(avatarFile)) {
    const storagePath = `${prefix}/avatar/${Date.now()}_${safeEntityFileName(avatarFile.name)}`;
    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, avatarFile, { contentType: avatarFile.type || "image/jpeg" });
    fileUrl = await getDownloadURL(storageRef);
  }

  for (const f of documentFiles) {
    if (documentFileUrls.length >= maxDocuments) break;
    if (!isProfileDocumentFile(f)) continue;
    const storagePath = `${prefix}/documents/${Date.now()}_${safeEntityFileName(f.name)}`;
    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, f, { contentType: f.type || "application/octet-stream" });
    documentFileUrls.push(await getDownloadURL(storageRef));
  }
  return { fileUrl, documentFileUrls };
}

/** Item: thumbnail `avatarUrl` (image) alag, `fileUrls` attachments. */
export async function stageItemAvatarAndAttachments(params: {
  companyId: string;
  itemId: string;
  avatarFile: File | null;
  attachmentFiles: File[];
  maxAttachments: number;
}): Promise<{ avatarUrl: string | null; newAttachmentUrls: string[] }> {
  const { companyId, itemId, avatarFile, attachmentFiles } = params;
  const basePath = `companies/${companyId}/items/${itemId}`;
  const prefix = `companies/${companyId}/item-files`;

  let avatarUrl: string | null = null;
  if (avatarFile && isProfileAvatarImageFile(avatarFile)) {
    const id = generateLocalFileId();
    const staged = await compressEntityProfileFileForPending(avatarFile);
    await putPendingFile({
      id,
      blob: staged.blob,
      contentType: staged.contentType,
      docPath: basePath,
      field: "avatarUrl",
      storagePathPrefix: `${prefix}/avatar`,
      fileName: staged.fileName,
    });
    const driveRef = await tryImmediateDriveUploadForStagedEntityFile({
      companyId,
      collectionSeg: "items",
      entityId: itemId,
      field: "avatarUrl",
      localId: id,
      blob: staged.blob,
      contentType: staged.contentType,
      fileName: staged.fileName,
    });
    avatarUrl = driveRef ?? `${LOCAL_FILE_PREFIX}${id}`;
  }

  const newAttachmentUrls: string[] = [];
  for (const f of attachmentFiles) {
    if (newAttachmentUrls.length >= params.maxAttachments) break;
    if (!isProfileDocumentFile(f)) continue;
    const id = generateLocalFileId();
    const staged = await compressEntityProfileFileForPending(f);
    await putPendingFile({
      id,
      blob: staged.blob,
      contentType: staged.contentType,
      docPath: basePath,
      field: "fileUrls",
      storagePathPrefix: `${prefix}/attachments`,
      fileName: staged.fileName,
    });
    const driveRef = await tryImmediateDriveUploadForStagedEntityFile({
      companyId,
      collectionSeg: "items",
      entityId: itemId,
      field: "fileUrls",
      localId: id,
      blob: staged.blob,
      contentType: staged.contentType,
      fileName: staged.fileName,
    });
    newAttachmentUrls.push(driveRef ?? `${LOCAL_FILE_PREFIX}${id}`);
  }
  return { avatarUrl, newAttachmentUrls };
}

/** Item online Firebase: Storage URLs; local/Drive company par `stageItemAvatarAndAttachments`. */
export async function uploadItemAvatarAndAttachmentsRemote(params: {
  companyId: string;
  itemId: string;
  avatarFile: File | null;
  attachmentFiles: File[];
  maxAttachments: number;
}): Promise<{ avatarUrl: string | null; newAttachmentUrls: string[] }> {
  if (await shouldStageEntityProfileFilesLocally(params.companyId)) {
    return stageItemAvatarAndAttachments(params);
  }
  const { companyId, avatarFile, attachmentFiles, maxAttachments } = params;
  const prefix = `companies/${companyId}/item-files`;
  let avatarUrl: string | null = null;
  if (avatarFile && isProfileAvatarImageFile(avatarFile)) {
    const storagePath = `${prefix}/avatar/${Date.now()}_${safeEntityFileName(avatarFile.name)}`;
    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, avatarFile, { contentType: avatarFile.type || "image/jpeg" });
    avatarUrl = await getDownloadURL(storageRef);
  }
  const newAttachmentUrls: string[] = [];
  for (const f of attachmentFiles) {
    if (newAttachmentUrls.length >= maxAttachments) break;
    if (!isProfileDocumentFile(f)) continue;
    const storagePath = `${prefix}/attachments/${Date.now()}_${safeEntityFileName(f.name)}`;
    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, f, { contentType: f.type || "application/octet-stream" });
    newAttachmentUrls.push(await getDownloadURL(storageRef));
  }
  return { avatarUrl, newAttachmentUrls };
}

/** Save ke baad attachments + Drive delta — UI block mat karo (SQLite save pehle ho chuka hota hai). */
export function syncEntityAttachmentsAfterSave(companyId: string): void {
  void syncEntityAttachmentsAfterSaveAsync(companyId);
}

async function syncEntityAttachmentsAfterSaveAsync(companyId: string): Promise<void> {
  const cid = String(companyId || "").trim();
  if (!cid) return;
  try {
    if (await shouldUseLocalCloudSync(cid)) {
      const { scheduleLocalCloudSyncInBackground } = await import("@/lib/localCloudSync/engine");
      scheduleLocalCloudSyncInBackground(cid, { force: true });
      return;
    }
    const { syncPendingFiles } = await import("@/lib/localPendingFiles");
    await syncPendingFiles();
  } catch (e) {
    console.warn("[entityProfile] attachment sync after save", e);
  }
}
