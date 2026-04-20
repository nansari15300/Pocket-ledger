"use client";

/**
 * Local-first outbox flush: voucher JSON may still contain `local:uuid` (IndexedDB pending blobs).
 * Firestore + other devices cannot resolve those — upload bytes to Storage here and swap in HTTPS URLs.
 */
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase";
import {
  getPendingFiles,
  removePendingFile,
  isLocalFileRef,
  LOCAL_FILE_PREFIX,
} from "@/lib/localPendingFiles";

function safeStorageFileName(name: string | undefined): string {
  const n = (name || "file").replace(/[/\\?%*:|"<>]/g, "_").trim();
  return (n.slice(0, 200) || "file");
}

export async function hydrateVoucherLocalAttachmentsForServer(
  fsCompanyId: string,
  docFields: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const cid = String(fsCompanyId || "").trim();
  if (!cid) return docFields;

  const typeRaw = docFields.type;
  const voucherType =
    typeof typeRaw === "string" && typeRaw.trim() !== "" ? typeRaw.trim() : "voucher";

  const pendingAll = await getPendingFiles();
  let out: Record<string, unknown> = { ...docFields };

  const urlsRaw = out.fileUrls;
  if (Array.isArray(urlsRaw)) {
    const next: string[] = [];
    let anyLocal = false;
    for (const entry of urlsRaw) {
      if (typeof entry !== "string" || !entry) continue;
      if (!isLocalFileRef(entry)) {
        next.push(entry);
        continue;
      }
      anyLocal = true;
      const localId = entry.slice(LOCAL_FILE_PREFIX.length);
      const item = pendingAll.find((p) => p.id === localId);
      if (!item?.blob) {
        throw new Error(
          `[sync] Attachment bytes missing for ${entry} (clear cache or re-attach). Cannot push voucher to server.`
        );
      }
      const objectPath = `voucher-files/${cid}/${voucherType}/${Date.now()}_${safeStorageFileName(item.fileName)}`;
      const storageRef = ref(storage, objectPath);
      await uploadBytes(storageRef, item.blob, {
        contentType: item.contentType || "application/octet-stream",
      });
      const httpsUrl = await getDownloadURL(storageRef);
      try {
        const { incrementCompanyStorage } = await import("@/lib/storageUsageClient");
        await incrementCompanyStorage(cid, {
          attachmentsBytes: item.blob.size,
          storageBytes: item.blob.size,
        });
      } catch {
        /* usage counter non-fatal */
      }
      await removePendingFile(item.id);
      next.push(httpsUrl);
    }
    if (anyLocal) {
      out = { ...out, fileUrls: next };
    }
  }

  const uf = out.unassignedFile;
  if (uf && typeof uf === "object" && uf !== null) {
    const ufo = uf as Record<string, unknown>;
    const urlStr = ufo.url;
    if (typeof urlStr === "string" && isLocalFileRef(urlStr)) {
      const localId = urlStr.slice(LOCAL_FILE_PREFIX.length);
      const item = pendingAll.find((p) => p.id === localId);
      if (!item?.blob) {
        throw new Error(
          `[sync] unassignedFile bytes missing for ${urlStr}. Cannot push voucher to server.`
        );
      }
      const objectPath = `voucher-files/${cid}/${voucherType}/${Date.now()}_${safeStorageFileName(item.fileName)}`;
      const storageRef = ref(storage, objectPath);
      await uploadBytes(storageRef, item.blob, {
        contentType: item.contentType || "application/octet-stream",
      });
      const httpsUrl = await getDownloadURL(storageRef);
      try {
        const { incrementCompanyStorage } = await import("@/lib/storageUsageClient");
        await incrementCompanyStorage(cid, {
          attachmentsBytes: item.blob.size,
          storageBytes: item.blob.size,
        });
      } catch {
        /* non-fatal */
      }
      await removePendingFile(item.id);
      out = {
        ...out,
        unassignedFile: {
          ...ufo,
          url: httpsUrl,
          path: objectPath,
        },
      };
    }
  }

  return out;
}
