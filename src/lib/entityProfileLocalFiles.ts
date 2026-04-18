"use client";

/**
 * Party / Bank / Staff / Item: Firebase turant upload ke bina IndexedDB + `local:uuid` —
 * `syncPendingFiles` online par Storage + Firestore update karta hai (`firestoreDocRefFromPath`).
 */
import { generateLocalFileId, LOCAL_FILE_PREFIX, putPendingFile } from "@/lib/localPendingFiles";

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
