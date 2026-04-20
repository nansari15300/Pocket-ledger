"use client";

import { doc, getDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { isLocalFileRef, LOCAL_FILE_PREFIX } from "@/lib/localPendingFiles";
import { isLocalOnlyMode } from "@/lib/localMode";
import { listCompanyDocsFromBrowserDb } from "@/lib/localCompanyDocMirror";

function isRemoteAttachmentUrl(u: string): boolean {
  const s = String(u || "").trim();
  if (!s || s.startsWith(LOCAL_FILE_PREFIX)) return false;
  return s.startsWith("http://") || s.startsWith("https://") || s.startsWith("blob:") || s.startsWith("data:");
}

/**
 * IndexedDB pending blob cleared / APK cache wipe — voucher row may still hold `local:` in UI
 * while Firestore (or SQLite mirror) already has the uploaded download URL.
 */
export async function tryResolveRemoteUrlForStaleLocalAttachment(
  companyId: string,
  voucherId: string,
  staleUrl: string,
  clientFileUrls?: readonly string[] | null
): Promise<string | null> {
  const cid = String(companyId || "").trim();
  const vid = String(voucherId || "").trim();
  if (!cid || !vid || !staleUrl) return null;

  let fileUrls: string[] = [];
  try {
    if (!isLocalOnlyMode()) {
      const snap = await getDoc(doc(firestore, "companies", cid, "vouchers", vid));
      if (!snap.exists()) return null;
      const data = snap.data() as { fileUrls?: unknown };
      fileUrls = Array.isArray(data.fileUrls)
        ? data.fileUrls.filter((u): u is string => typeof u === "string" && u.length > 0)
        : [];
    } else {
      const rows = await listCompanyDocsFromBrowserDb(cid, "vouchers");
      const row = rows.find((r: { id?: string }) => r.id === vid) as { fileUrls?: unknown } | undefined;
      if (!row) return null;
      fileUrls = Array.isArray(row.fileUrls)
        ? row.fileUrls.filter((u): u is string => typeof u === "string" && u.length > 0)
        : [];
    }
  } catch {
    return null;
  }

  if (fileUrls.length === 0) return null;

  const client = (clientFileUrls || []).filter((u): u is string => typeof u === "string" && u.length > 0);
  const idx = client.findIndex((u) => u === staleUrl);
  if (idx >= 0 && fileUrls[idx] && isRemoteAttachmentUrl(fileUrls[idx])) {
    return fileUrls[idx]!;
  }
  if (client.length === fileUrls.length) {
    for (let i = 0; i < client.length; i++) {
      if (client[i] === staleUrl && fileUrls[i] && isRemoteAttachmentUrl(fileUrls[i]!)) {
        return fileUrls[i]!;
      }
    }
  }
  if (isLocalFileRef(staleUrl)) {
    const remotes = fileUrls.filter(isRemoteAttachmentUrl);
    if (remotes.length === 1) return remotes[0]!;
  }
  return null;
}
