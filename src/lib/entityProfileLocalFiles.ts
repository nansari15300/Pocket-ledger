"use client";

/**
 * Party / Bank / Staff / Item: offline/local = IndexedDB + `local:uuid` + `syncPendingFiles`.
 * Online `uploadEntityAvatarAndDocumentsRemote` — turant Storage URL Firestore me (dusre device par turant kaam).
 */
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase";
import { isOfflineCompanyStorage } from "@/lib/companyUnlockGate";
import { getLocalCompanyById } from "@/lib/localCompanyStore";
import { generateLocalFileId, LOCAL_FILE_PREFIX, putPendingFile } from "@/lib/localPendingFiles";

/** Local company (`storageOption: local`) — avatar/docs/items Firebase par nahi; `local:` + Drive/Dropbox sync. */
export async function shouldStageEntityProfileFilesLocally(
  companyId: string,
  company?: { storageOption?: string } | null
): Promise<boolean> {
  if (company && isOfflineCompanyStorage(company)) return true;
  const reg = await getLocalCompanyById(String(companyId || "").trim(), { includeDeleted: true });
  return !!(reg && isOfflineCompanyStorage(reg as { storageOption?: string }));
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
  const basePath = `companies/${companyId}/${collectionSeg}/${entityId}`;
  // Firebase Storage rules: `companies/{companyId}/{folder}/**` — local pending upload bhi isi tree ke hisaab se.
  const prefix = `companies/${companyId}/${collectionSeg.replace(/_/g, "-")}-files`;

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
  const prefix = `companies/${companyId}/${collectionSeg.replace(/_/g, "-")}-files`;

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
