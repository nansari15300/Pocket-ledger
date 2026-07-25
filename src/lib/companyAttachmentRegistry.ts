"use client";

/**
 * Firebase Storage attachment ref-count — reuse same URL across vouchers without duplicate bytes;
 * permanent delete only removes Storage object when refCount hits zero.
 */
import {
  collection,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { ref, deleteObject, getBlob } from "firebase/storage";
import { firestore, storage } from "@/lib/firebase";
import { companyAttachmentRegistryEnabled } from "@/lib/firebaseBillingOptimization";
import { tryGetStoragePathFromFirebaseDownloadUrl } from "@/lib/firebaseStorageDownloadUrl";
import { isOfflineCompanyStorage } from "@/lib/companyUnlockGate";
import { getLocalCompanyById } from "@/lib/localCompanyStore";
import { uploadFileClient } from "@/lib/storageClient";

type RegistryRow = {
  url: string;
  storagePath?: string | null;
  refCount: number;
  updatedAt?: unknown;
};

function registryCollection(companyId: string) {
  return collection(firestore, `companies/${companyId}/attachment_registry`);
}

function registryDocId(url: string): string {
  const key = url.trim();
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return `r_${h.toString(36)}_${key.length}`;
}

function isRegistryEligibleHttpsUrl(url: string): boolean {
  const u = url.trim();
  return u.startsWith("http://") || u.startsWith("https://");
}

async function registryEnabledForCompany(companyId: string): Promise<boolean> {
  if (!companyAttachmentRegistryEnabled()) return false;
  const cid = String(companyId || "").trim();
  if (!cid) return false;
  const reg = await getLocalCompanyById(cid, { includeDeleted: true });
  if (reg && isOfflineCompanyStorage(reg as { storageOption?: string })) return false;
  return true;
}

export async function registerFirebaseAttachmentRef(
  companyId: string,
  url: string,
  initialRefCount = 1
): Promise<void> {
  if (!(await registryEnabledForCompany(companyId))) return;
  const trimmed = url.trim();
  if (!isRegistryEligibleHttpsUrl(trimmed)) return;
  const storagePath = tryGetStoragePathFromFirebaseDownloadUrl(trimmed);
  const refDoc = doc(registryCollection(companyId), registryDocId(trimmed));
  await runTransaction(firestore, async (tx) => {
    const snap = await tx.get(refDoc);
    if (snap.exists()) {
      const prev = (snap.data() as RegistryRow).refCount ?? 0;
      tx.update(refDoc, {
        refCount: Math.max(prev, 0) + Math.max(1, initialRefCount),
        url: trimmed,
        storagePath: storagePath ?? null,
        updatedAt: serverTimestamp(),
      });
    } else {
      tx.set(refDoc, {
        url: trimmed,
        storagePath: storagePath ?? null,
        refCount: Math.max(1, initialRefCount),
        updatedAt: serverTimestamp(),
      });
    }
  });
}

/** Reuse picker / IC link — increment before voucher save. */
export async function linkFirebaseAttachmentRefs(companyId: string, urls: string[]): Promise<void> {
  if (!(await registryEnabledForCompany(companyId))) return;
  const uniq = [...new Set(urls.map((u) => u.trim()).filter(isRegistryEligibleHttpsUrl))];
  await Promise.all(uniq.map((url) => registerFirebaseAttachmentRef(companyId, url, 1)));
}

/** Voucher reuse — Firebase HTTPS refs + `drive:` cloud paths (Google Drive reuse without re-upload). */
export async function linkCloudAttachmentRefs(companyId: string, urls: string[]): Promise<void> {
  const cid = String(companyId || "").trim();
  if (!cid) return;
  const https = urls.map((u) => u.trim()).filter(isRegistryEligibleHttpsUrl);
  if (https.length > 0) await linkFirebaseAttachmentRefs(cid, https);
  // `drive:` refs — local/Google Drive: no Firestore registry; same URL reuse on form only.
}

/** Voucher permanent delete — decrement; delete Storage bytes only when unreferenced. */
function fileNameFromStoragePath(path: string): string {
  const base = path.split("/").pop() || "attachment";
  try {
    return decodeURIComponent(base);
  } catch {
    return base;
  }
}

/**
 * Cross-company reuse copies bytes into the target company. Same URL across
 * companies would make delete/ref-count ownership unsafe.
 */
export async function copyCloudAttachmentRefToCompany(params: {
  sourceUrl: string;
  targetCompanyId: string;
  targetCompanyName?: string;
}): Promise<string> {
  const sourceUrl = String(params.sourceUrl || "").trim();
  const targetCompanyId = String(params.targetCompanyId || "").trim();
  if (!targetCompanyId) throw new Error("Target company is missing.");
  if (!isRegistryEligibleHttpsUrl(sourceUrl)) {
    throw new Error("This attachment type cannot be copied between companies yet.");
  }
  const sourcePath = tryGetStoragePathFromFirebaseDownloadUrl(sourceUrl);
  if (!sourcePath) throw new Error("Could not read the source attachment path.");

  const blob = await getBlob(ref(storage, sourcePath));
  const uploaded = await uploadFileClient(
    {
      name: fileNameFromStoragePath(sourcePath),
      type: blob.type || "application/octet-stream",
      arrayBuffer: await blob.arrayBuffer(),
    },
    targetCompanyId,
    params.targetCompanyName,
    new Date()
  );
  if (uploaded.success === false) throw new Error(uploaded.error || "Could not copy attachment.");
  await registerFirebaseAttachmentRef(targetCompanyId, uploaded.url, 1);
  return uploaded.url;
}
export async function unlinkFirebaseAttachmentRefsForDoc(
  companyId: string,
  fileUrls: string[]
): Promise<void> {
  if (!(await registryEnabledForCompany(companyId))) return;
  const uniq = [...new Set(fileUrls.map((u) => u.trim()).filter(isRegistryEligibleHttpsUrl))];
  for (const url of uniq) {
    const refDoc = doc(registryCollection(companyId), registryDocId(url));
    let storagePath: string | null = null;
    let shouldDelete = false;
    try {
      await runTransaction(firestore, async (tx) => {
        const snap = await tx.get(refDoc);
        if (!snap.exists()) {
          shouldDelete = true;
          storagePath = tryGetStoragePathFromFirebaseDownloadUrl(url);
          return;
        }
        const data = snap.data() as RegistryRow;
        const prev = Math.max(0, Number(data.refCount) || 0);
        const next = prev - 1;
        storagePath =
          (typeof data.storagePath === "string" && data.storagePath.trim()) ||
          tryGetStoragePathFromFirebaseDownloadUrl(url);
        if (next <= 0) {
          shouldDelete = true;
          tx.delete(refDoc);
        } else {
          tx.update(refDoc, { refCount: next, updatedAt: serverTimestamp() });
        }
      });
    } catch {
      shouldDelete = true;
      storagePath = tryGetStoragePathFromFirebaseDownloadUrl(url);
    }
    if (shouldDelete && storagePath) {
      try {
        await deleteObject(ref(storage, storagePath));
      } catch {
        /* already gone */
      }
    }
  }
}

/** Legacy path: no registry row → delete immediately (pre-registry vouchers). */
export async function deleteFirebaseStorageUrlsWithRegistry(
  companyId: string,
  urls: string[]
): Promise<void> {
  const cid = String(companyId || "").trim();
  if (!(await registryEnabledForCompany(cid))) {
    const { deleteObject: delObj } = await import("firebase/storage");
    const { storage: st } = await import("@/lib/firebase");
    for (const raw of urls) {
      const path = tryGetStoragePathFromFirebaseDownloadUrl(String(raw || "").trim());
      if (!path) continue;
      try {
        await delObj(ref(st, path));
      } catch {
        /* ignore */
      }
    }
    return;
  }
  await unlinkFirebaseAttachmentRefsForDoc(cid, urls);
}

/** Best-effort bump after immediate Storage upload (forms that still use uploadBytes). */
export async function touchRegistryAfterStorageUpload(
  companyId: string,
  httpsUrl: string
): Promise<void> {
  try {
    await registerFirebaseAttachmentRef(companyId, httpsUrl, 1);
  } catch {
    /* non-fatal */
  }
}

/** Ensure registry doc exists with at least refCount 1 (idempotent). */
export async function ensureRegistryDocForUrl(companyId: string, url: string): Promise<void> {
  if (!(await registryEnabledForCompany(companyId))) return;
  const trimmed = url.trim();
  if (!isRegistryEligibleHttpsUrl(trimmed)) return;
  const refDoc = doc(registryCollection(companyId), registryDocId(trimmed));
  const snap = await getDoc(refDoc);
  if (snap.exists()) return;
  await setDoc(refDoc, {
    url: trimmed,
    storagePath: tryGetStoragePathFromFirebaseDownloadUrl(trimmed) ?? null,
    refCount: 1,
    updatedAt: serverTimestamp(),
  });
}
