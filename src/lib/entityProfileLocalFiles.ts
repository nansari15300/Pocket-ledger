"use client";

/**
 * Party / Bank / Staff / Item: offline/local = IndexedDB + `local:uuid` + `syncPendingFiles`.
 * Online `uploadEntityAvatarAndDocumentsRemote` — turant Storage URL Firestore me (dusre device par turant kaam).
 */
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase";
import { generateLocalFileId, LOCAL_FILE_PREFIX, putPendingFile } from "@/lib/localPendingFiles";

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
  const basePath = `companies/${companyId}/${collectionSeg}/${entityId}`;
  const prefix = `${collectionSeg.replace(/_/g, "-")}-files/${companyId}`;

  let fileUrl: string | null = null;
  if (avatarFile && isProfileAvatarImageFile(avatarFile)) {
    const id = generateLocalFileId();
    await putPendingFile({
      id,
      blob: avatarFile,
      contentType: avatarFile.type || "image/jpeg",
      docPath: basePath,
      field: "fileUrl",
      storagePathPrefix: `${prefix}/avatar`,
      fileName: avatarFile.name,
    });
    fileUrl = `${LOCAL_FILE_PREFIX}${id}`;
  }

  for (const f of documentFiles) {
    if (documentFileUrls.length >= maxDocuments) break;
    if (!isProfileDocumentFile(f)) continue;
    const id = generateLocalFileId();
    await putPendingFile({
      id,
      blob: f,
      contentType: f.type || "application/octet-stream",
      docPath: basePath,
      field: "documentFileUrls",
      storagePathPrefix: `${prefix}/documents`,
      fileName: f.name,
    });
    documentFileUrls.push(`${LOCAL_FILE_PREFIX}${id}`);
  }
  return { fileUrl, documentFileUrls };
}

/** Online: avatar + document files seedhe Firebase Storage, download URL Firestore me (local: sync par depend nahi). */
export async function uploadEntityAvatarAndDocumentsRemote(params: {
  companyId: string;
  collectionSeg: EntityProfileCollection;
  /** Future path scoping; storage prefix me company se hi enough hai */
  entityId: string;
  avatarFile: File | null;
  documentFiles: File[];
  maxDocuments?: number;
}): Promise<{ fileUrl: string | null; documentFileUrls: string[] }> {
  const { companyId, collectionSeg, avatarFile, documentFiles } = params;
  const maxDocuments = params.maxDocuments ?? DEFAULT_MAX_ENTITY_DOCS;
  const documentFileUrls: string[] = [];
  const prefix = `${collectionSeg.replace(/_/g, "-")}-files/${companyId}`;

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
  const prefix = `item-files/${companyId}`;

  let avatarUrl: string | null = null;
  if (avatarFile && isProfileAvatarImageFile(avatarFile)) {
    const id = generateLocalFileId();
    await putPendingFile({
      id,
      blob: avatarFile,
      contentType: avatarFile.type || "image/jpeg",
      docPath: basePath,
      field: "avatarUrl",
      storagePathPrefix: `${prefix}/avatar`,
      fileName: avatarFile.name,
    });
    avatarUrl = `${LOCAL_FILE_PREFIX}${id}`;
  }

  const newAttachmentUrls: string[] = [];
  for (const f of attachmentFiles) {
    if (newAttachmentUrls.length >= params.maxAttachments) break;
    if (!isProfileDocumentFile(f)) continue;
    const id = generateLocalFileId();
    await putPendingFile({
      id,
      blob: f,
      contentType: f.type || "application/octet-stream",
      docPath: basePath,
      field: "fileUrls",
      storagePathPrefix: `${prefix}/attachments`,
      fileName: f.name,
    });
    newAttachmentUrls.push(`${LOCAL_FILE_PREFIX}${id}`);
  }
  return { avatarUrl, newAttachmentUrls };
}

/** Item online: same paths as `stageItem*`, turant Storage URLs (dusre device). */
export async function uploadItemAvatarAndAttachmentsRemote(params: {
  companyId: string;
  itemId: string;
  avatarFile: File | null;
  attachmentFiles: File[];
  maxAttachments: number;
}): Promise<{ avatarUrl: string | null; newAttachmentUrls: string[] }> {
  const { companyId, avatarFile, attachmentFiles, maxAttachments } = params;
  const prefix = `item-files/${companyId}`;
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
