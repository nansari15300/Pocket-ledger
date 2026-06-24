"use client";

import { doc, getDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { isLocalFileRef, LOCAL_FILE_PREFIX } from "@/lib/localPendingFiles";
import { normalizeFileUrlsField } from "@/lib/voucherAttachmentNormalize";
import { isLocalOnlyMode } from "@/lib/localMode";
import { listCompanyDocsFromBrowserDb } from "@/lib/localCompanyDocMirror";
import { getLocalCompanyById } from "@/lib/localCompanyStore";
import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";
import { isDriveFileRef } from "@/lib/legacyDriveFileRef";

/** HTTPS / Drive / blob — `local:` staging ke opposite; edit dialog merge me remote prefer karo. */
export function isRemoteAttachmentUrl(u: string): boolean {
  const s = String(u || "").trim();
  if (!s || s.startsWith(LOCAL_FILE_PREFIX)) return false;
  // Drive sync refs (`drive:...`) bhi remote attachment hi hain; stale local replace me inko accept karo.
  return (
    s.startsWith("http://") ||
    s.startsWith("https://") ||
    s.startsWith("blob:") ||
    s.startsWith("data:") ||
    isDriveFileRef(s)
  );
}

/** Forensic: stale `local:` → remote HTTPS resolve path proof (`NEXT_PUBLIC_ATTACHMENT_FORENSIC_DEBUG=1`). */
function staleLocalResolveForensicEnabled(): boolean {
  return typeof process !== "undefined" && process.env.NEXT_PUBLIC_ATTACHMENT_FORENSIC_DEBUG === "1";
}

/** Registry / device `companyId` → Firestore `companies/{id}` (Storage + voucher doc same id) — read-only, voucherActionsClient jaisa. */
async function resolveAuthoritativeFirestoreCompanyIdForAttachmentRead(companyId: string): Promise<string> {
  try {
    const reg = await getLocalCompanyById(companyId, { includeDeleted: true });
    const cid = String((reg as Record<string, unknown> | null)?.authoritativeCompanyId ?? "").trim();
    return cid || companyId;
  } catch {
    return companyId;
  }
}

/**
 * Stale `local:` resolve ke liye `fileUrls` source:
 * - Online: **pehle Firestore** (background `syncPendingFiles` mirror se pehle HTTPS likh chuka ho sakta hai).
 * - Miss/offline: SQLite mirror (`isLocalOnlyMode` / static APK par mirror kabhi 1–2 beat peeche rehta tha → preview/open fail).
 */
async function readVoucherFileUrlsForStaleLocalResolve(
  registryCompanyId: string,
  voucherId: string
): Promise<{ fileUrls: string[]; source: "firestore_getDoc" | "sqlite_mirror_list" | "none" }> {
  const regCid = String(registryCompanyId || "").trim();
  const vid = String(voucherId || "").trim();
  if (!regCid || !vid) return { fileUrls: [], source: "none" };

  const tryFirestoreFirst =
    typeof navigator === "undefined" ||
    navigator.onLine !== false ||
    isCapacitorNativeApp();

  if (tryFirestoreFirst) {
    try {
      const fsCid = await resolveAuthoritativeFirestoreCompanyIdForAttachmentRead(regCid);
      const snap = await getDoc(doc(firestore, "companies", fsCid, "vouchers", vid));
      if (snap.exists()) {
        const data = snap.data() as { fileUrls?: unknown };
        const fileUrls = normalizeFileUrlsField(data.fileUrls);
        if (fileUrls.length > 0) {
          return { fileUrls, source: "firestore_getDoc" };
        }
      }
    } catch {
      /* mirror fallback niche */
    }
  }

  try {
    const rows = await listCompanyDocsFromBrowserDb(regCid, "vouchers");
    const row = rows.find((r: { id?: string }) => r.id === vid) as { fileUrls?: unknown } | undefined;
    if (!row) return { fileUrls: [], source: "none" };
    const fileUrls = normalizeFileUrlsField(row.fileUrls);
    return { fileUrls, source: "sqlite_mirror_list" };
  } catch {
    return { fileUrls: [], source: "none" };
  }
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
  if (!cid || !vid || !staleUrl) {
    if (staleLocalResolveForensicEnabled()) {
      console.warn("[FORENSIC_STALE_LOCAL_RESOLVE]", {
        outcome: "early_null_missing_ids",
        companyId: cid,
        voucherId: vid,
        staleUrl,
      });
    }
    return null;
  }

  let fileUrls: string[] = [];
  let source: "firestore_getDoc" | "sqlite_mirror_list" | "none" = "none";
  try {
    const read = await readVoucherFileUrlsForStaleLocalResolve(cid, vid);
    fileUrls = read.fileUrls;
    source = read.source;
    if (fileUrls.length === 0 && staleLocalResolveForensicEnabled()) {
      console.warn("[FORENSIC_STALE_LOCAL_RESOLVE]", {
        outcome: source === "none" ? "no_rows_firestore_empty_then_sqlite_empty" : "empty_fileUrls_after_read",
        companyId: cid,
        voucherId: vid,
        staleUrl,
        source,
      });
    }
    if (fileUrls.length === 0) return null;
  } catch (e) {
    if (staleLocalResolveForensicEnabled()) {
      console.warn("[FORENSIC_STALE_LOCAL_RESOLVE]", {
        outcome: "read_throw",
        companyId: cid,
        voucherId: vid,
        staleUrl,
        source,
        error: e instanceof Error ? e.message : String(e),
      });
    }
    return null;
  }

  const client = (clientFileUrls || []).filter((u): u is string => typeof u === "string" && u.length > 0);
  const idx = client.findIndex((u) => u === staleUrl);
  let fallbackPath: string = "none";
  let resolved: string | null = null;

  if (idx >= 0 && fileUrls[idx] && isRemoteAttachmentUrl(fileUrls[idx])) {
    fallbackPath = "direct_index_match_client_stale_at_idx";
    resolved = fileUrls[idx]!;
  } else if (client.length === fileUrls.length) {
    for (let i = 0; i < client.length; i++) {
      if (client[i] === staleUrl && fileUrls[i] && isRemoteAttachmentUrl(fileUrls[i]!)) {
        fallbackPath = "parallel_scan_same_length_arrays";
        resolved = fileUrls[i]!;
        break;
      }
    }
  }
  if (!resolved && isLocalFileRef(staleUrl)) {
    const remotes = fileUrls.filter(isRemoteAttachmentUrl);
    if (remotes.length === 1) {
      fallbackPath = "single_remote_in_fileUrls_while_stale_local";
      resolved = remotes[0]!;
    }
  }

  if (staleLocalResolveForensicEnabled()) {
    console.warn("[FORENSIC_STALE_LOCAL_RESOLVE]", {
      outcome: resolved ? "resolved" : "unresolved_null",
      companyId: cid,
      voucherId: vid,
      staleUrl,
      clientFileUrls: client,
      remoteFileUrls: fileUrls,
      matchedClientIndex: idx,
      clientLength: client.length,
      remoteLength: fileUrls.length,
      lengthsAligned: client.length === fileUrls.length,
      fallbackPathChosen: fallbackPath,
      finalResolvedUrl: resolved,
      dataSource: source,
      isLocalOnlyMode: isLocalOnlyMode(),
    });
  }

  return resolved;
}

/**
 * Edit dialog: `liveVoucher` (onSnapshot) kabhi stale `local:` rakhe, table row / mirror pehle HTTPS patch kar chuka ho.
 * Sirf empty-live merge pehle tha — isliye tick preview chalta tha, form `local:` + missing pending par FILE icon.
 */
export function mergeVoucherFileUrlsForEditDialog(
  liveUrls: readonly string[],
  rowUrls: readonly string[]
): string[] {
  const live = liveUrls.map((u) => String(u || "").trim()).filter(Boolean);
  const row = rowUrls.map((u) => String(u || "").trim()).filter(Boolean);
  if (live.length === 0) return row;
  if (row.length === 0) return live;
  if (live.length === row.length) {
    return live.map((liveRef, i) => {
      const rowRef = row[i]!;
      if (isLocalFileRef(liveRef) && isRemoteAttachmentUrl(rowRef)) return rowRef;
      if (isRemoteAttachmentUrl(liveRef)) return liveRef;
      return liveRef || rowRef;
    });
  }
  const liveAllLocal = live.every((u) => isLocalFileRef(u));
  const rowRemotes = row.filter((u) => isRemoteAttachmentUrl(u));
  if (liveAllLocal && rowRemotes.length === live.length) return row;
  if (liveAllLocal && rowRemotes.length === 1 && live.length === 1) return rowRemotes;
  return live;
}
